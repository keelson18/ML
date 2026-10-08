import { TIMEFRAMES, type Candle, type Market, type MarketDataIdentity, type Timeframe } from '../../../src/lib/types';
import { getMarket } from '../../../src/lib/markets';
import { config } from '../config';
import { fetchWithTimeout } from '../../../src/lib/providers/request';
import { readJsonSafe } from '../../../shared/http';

// Provider base URLs — configurable via env for testing overrides
const MASSIVE_REST = process.env.MASSIVE_REST_URL ?? 'https://api.massive.com';
const TWELVEDATA_REST = process.env.TWELVEDATA_REST_URL ?? 'https://api.twelvedata.com';
const TWELVEDATA_TIMEFRAMES: Record<Timeframe, string> = {
  '1m': '1min', '3m': '3min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week', '1M': '1month',
};
const MASSIVE_TIMEFRAMES: Record<Timeframe, { multiplier: number; timespan: 'minute' | 'hour' | 'day' | 'week' | 'month'; minutes: number }> = {
  '1m': { multiplier: 1, timespan: 'minute', minutes: 1 },
  '3m': { multiplier: 3, timespan: 'minute', minutes: 3 },
  '5m': { multiplier: 5, timespan: 'minute', minutes: 5 },
  '15m': { multiplier: 15, timespan: 'minute', minutes: 15 },
  '30m': { multiplier: 30, timespan: 'minute', minutes: 30 },
  '1h': { multiplier: 1, timespan: 'hour', minutes: 60 },
  '4h': { multiplier: 4, timespan: 'hour', minutes: 240 },
  '1d': { multiplier: 1, timespan: 'day', minutes: 1440 },
  '1w': { multiplier: 1, timespan: 'week', minutes: 10080 },
  '1M': { multiplier: 1, timespan: 'month', minutes: 43200 },
};

// TTL cache for market data — avoids hammering provider APIs under polling load
const CACHE_TTL_MS: Record<Timeframe, number> = {
  '1m': 5_000, '3m': 5_000, '5m': 10_000, '15m': 15_000, '30m': 30_000,
  '1h': 60_000, '4h': 120_000, '1d': 300_000, '1w': 600_000, '1M': 3_600_000,
};

interface CacheEntry {
  series: MarketDataSeries;
  fetchedAt: number;
  expiresAt: number;
}
const marketDataCache = new Map<string, CacheEntry>();

export class MarketDataProviderError extends Error {
  constructor(readonly provider: string, readonly status: number, readonly retryAfter: string | null) {
    super(`${provider} market data failed (${status}).`);
  }
}

const inFlightMarketRequests = new Map<string, Map<number, Promise<MarketDataSeries>>>();

export function clearMarketDataCache(): void {
  marketDataCache.clear();
  inFlightMarketRequests.clear();
}

export async function probeMarketData(canonicalSymbol: string): Promise<{ candleCount: number }> {
  const instrument = getMarket(canonicalSymbol);
  if (!instrument || instrument.marketType !== 'crypto' || instrument.provider !== 'massive' || !instrument.sourceSymbol) {
    throw new Error('Market probe is not configured for this instrument.');
  }
  const candles = await fetchFromProvider(instrument, '1m', 5);
  validateCandles(candles, canonicalSymbol);
  if (candles.length === 0) throw new Error('Provider returned no candles.');
  return { candleCount: candles.length };
}

export function isTimeframe(value: unknown): value is Timeframe {
  return typeof value === 'string' && TIMEFRAMES.some((timeframe) => timeframe.value === value);
}

export interface MarketDataSeries {
  instrument: Pick<Market, 'id' | 'canonicalSymbol' | 'sourceSymbol' | 'baseAsset' | 'quoteAsset' | 'priceCurrency' | 'provider' | 'marketType'>;
  timeframe: Timeframe;
  identity: MarketDataIdentity;
  dataset: {
    id: string;
    provider: NonNullable<Market['provider']>;
    sourceInstrument: string;
    quoteCurrency: string;
    timeframe: Timeframe;
    startTimestamp: number | null;
    endTimestamp: number | null;
    dataVersion: string;
  };
  candles: Candle[];
  fetchedAt: number;
  stale: boolean;
}

export function fetchMarketData(canonicalSymbol: string, timeframe: Timeframe, limit = 1000): Promise<MarketDataSeries> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return Promise.reject(new Error('Candle limit must be an integer between 1 and 1000.'));

  // Check TTL cache first — return fresh or stale entry
  const cacheKey = JSON.stringify([canonicalSymbol, timeframe, limit]);
  const cached = marketDataCache.get(cacheKey);
  if (cached && Date.now() <= cached.expiresAt) {
    marketDataCache.delete(cacheKey);
    marketDataCache.set(cacheKey, cached);
    return Promise.resolve({ ...cached.series, fetchedAt: cached.fetchedAt, stale: false });
  }

  // De-duplicate in-flight requests
  const inflightKey = JSON.stringify([canonicalSymbol, timeframe]);
  const requests = inFlightMarketRequests.get(inflightKey);
  const matchingRequest = [...(requests ?? [])]
    .filter(([requestedLimit]) => requestedLimit >= limit)
    .sort(([left], [right]) => left - right)[0]?.[1];
  if (matchingRequest) {
    return matchingRequest
      .then((series) => limitMarketDataSeries(series, limit))
      .catch((error: unknown) => returnStaleOrThrow(cacheKey, cached, timeframe, canonicalSymbol, error));
  }

  const pending = requests ?? new Map<number, Promise<MarketDataSeries>>();
  const request = fetchMarketDataUncoalesced(canonicalSymbol, timeframe, limit);
  pending.set(limit, request);
  inFlightMarketRequests.set(inflightKey, pending);
  return request.finally(() => {
    pending.delete(limit);
    if (pending.size === 0) inFlightMarketRequests.delete(inflightKey);
  }).catch((error: unknown) => returnStaleOrThrow(cacheKey, cached, timeframe, canonicalSymbol, error));
}

function returnStaleOrThrow(cacheKey: string, cached: CacheEntry | undefined, timeframe: Timeframe, symbol: string, error: unknown): Promise<MarketDataSeries> {
  if (!cached) return Promise.reject(error);
  const ttl = CACHE_TTL_MS[timeframe] ?? 15_000;
  const ageMs = Date.now() - cached.fetchedAt;
  const maxStaleMs = ttl * config.marketDataMaxStaleTtlMultiplier;
  if (ageMs > maxStaleMs) return Promise.reject(error);

  // Keep the fallback in the LRU queue without extending its original age.
  marketDataCache.delete(cacheKey);
  marketDataCache.set(cacheKey, cached);
  evictOldestCacheEntries();
  console.warn({ symbol, timeframe, ageMs }, 'serving stale market data after provider failure');
  return Promise.resolve({ ...cached.series, fetchedAt: cached.fetchedAt, stale: true });
}

function evictOldestCacheEntries(): void {
  while (marketDataCache.size > config.marketDataCacheMaxEntries) {
    const oldestKey = marketDataCache.keys().next().value as string | undefined;
    if (!oldestKey) return;
    marketDataCache.delete(oldestKey);
  }
}

async function fetchMarketDataUncoalesced(canonicalSymbol: string, timeframe: Timeframe, limit: number): Promise<MarketDataSeries> {
  const configuredInstrument = getMarket(canonicalSymbol);
  if (!configuredInstrument) throw new Error(`Unknown canonical instrument: ${canonicalSymbol}`);
  const sourceSymbol = configuredInstrument.sourceSymbol ?? (
    configuredInstrument.provider === 'twelvedata'
      ? `${configuredInstrument.baseAsset}/${configuredInstrument.quoteAsset}`
      : configuredInstrument.provider === 'massive'
        ? configuredInstrument.symbol
        : undefined
  );
  if (!configuredInstrument.provider || !sourceSymbol) throw new Error(`No market-data source is configured for ${canonicalSymbol}.`);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Candle limit must be an integer between 1 and 1000.');
  const instrument: Market = {
    ...configuredInstrument,
    id: configuredInstrument.id ?? canonicalSymbol,
    canonicalSymbol: configuredInstrument.canonicalSymbol ?? canonicalSymbol,
    sourceSymbol,
  };

  const candles = await fetchFromProvider(instrument, timeframe, limit);
  validateCandles(candles, canonicalSymbol);
  const provider = instrument.provider;
  const sourceInstrument = sourceSymbol;
  const startTimestamp = candles[0]?.time ?? null;
  const endTimestamp = candles.at(-1)?.time ?? null;
  const dataVersion = `${provider}-ohlcv-v1`;
  const datasetId = [provider, sourceInstrument, instrument.quoteAsset, timeframe, startTimestamp ?? 'empty', endTimestamp ?? 'empty', dataVersion].join(':');

  const identity: MarketDataIdentity = {
    instrumentId: instrument.id ?? canonicalSymbol,
    canonicalSymbol: instrument.canonicalSymbol ?? canonicalSymbol,
    sourceSymbol: sourceInstrument,
    provider,
    baseAsset: instrument.baseAsset,
    quoteAsset: instrument.quoteAsset,
    marketType: instrument.marketType,
    timeframe,
    startTimestamp,
    endTimestamp,
    datasetId,
    dataVersion,
  };

  const fetchedAt = Date.now();
  const series: MarketDataSeries = {
    instrument: {
      id: instrument.id,
      canonicalSymbol: instrument.canonicalSymbol,
      sourceSymbol: instrument.sourceSymbol,
      baseAsset: instrument.baseAsset,
      quoteAsset: instrument.quoteAsset,
      priceCurrency: instrument.priceCurrency,
      provider: instrument.provider,
      marketType: instrument.marketType,
    },
    timeframe,
    identity,
    dataset: {
      id: datasetId,
      provider,
      sourceInstrument,
      quoteCurrency: instrument.quoteAsset,
      timeframe,
      startTimestamp,
      endTimestamp,
      dataVersion,
    },
    candles,
    fetchedAt,
    stale: false,
  };

  // Store in TTL cache
  const ttl = CACHE_TTL_MS[timeframe] ?? 15_000;
  const cacheKey = JSON.stringify([canonicalSymbol, timeframe, limit]);
  marketDataCache.delete(cacheKey);
  marketDataCache.set(cacheKey, { series, fetchedAt, expiresAt: fetchedAt + ttl });
  evictOldestCacheEntries();

  return series;
}

async function fetchFromProvider(instrument: Market, timeframe: Timeframe, requestedLimit: number): Promise<Candle[]> {
  const sourceSymbol = instrument.sourceSymbol;
  if (!sourceSymbol) throw new Error(`No source symbol is configured for ${instrument.canonicalSymbol}.`);

  if (instrument.provider === 'massive') {
    const apiKey = config.massiveApiKey;
    if (!apiKey) throw new Error('MASSIVE_API_KEY is not configured on the server.');
    const limit = Math.min(requestedLimit, 1000);
    const interval = MASSIVE_TIMEFRAMES[timeframe];
    const minutes = interval.minutes * limit * 1.5;
    const from = new Date(Date.now() - minutes * 60_000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    const query = new URLSearchParams({ adjusted: 'true', sort: 'asc', limit: String(limit) });
    const url = `${MASSIVE_REST}/v2/aggs/ticker/${encodeURIComponent(sourceSymbol)}/range/${interval.multiplier}/${interval.timespan}/${from}/${to}?${query}`;
    // API key in Authorization header, never in URL query string
    const response = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const { payload: body } = await readJsonSafe<{
      status?: string;
      error?: string;
      message?: string;
      results?: Array<{ o: number; h: number; l: number; c: number; v?: number; t: number }>;
    }>(response);
    if (!response.ok) throw new MarketDataProviderError('Massive', response.status, response.headers.get('retry-after'));
    if (!body) throw new Error('Massive returned an empty or invalid response.');
    if (body.status === 'ERROR') throw new Error(`Massive market data failed: ${body.error ?? body.message ?? 'provider error'}.`);
    return (body.results ?? []).map((bar) => ({
      time: Math.floor(bar.t / 1000), open: Number(bar.o), high: Number(bar.h), low: Number(bar.l), close: Number(bar.c), volume: Number(bar.v ?? 0),
    }));
  }

  if (instrument.provider === 'twelvedata') {
    const apiKey = config.twelveDataApiKey;
    if (!apiKey) throw new Error('TWELVEDATA_API_KEY is not configured on the server.');
    const limit = Math.min(requestedLimit, 1000);
    const query = new URLSearchParams({ symbol: sourceSymbol, interval: TWELVEDATA_TIMEFRAMES[timeframe], outputsize: String(limit), timezone: 'UTC', apikey: apiKey });
    const response = await fetchWithTimeout(`${TWELVEDATA_REST}/time_series?${query}`);
    const { payload: body } = await readJsonSafe<{ status?: string; message?: string; values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }> }>(response);
    if (!response.ok) throw new MarketDataProviderError('Twelve Data', response.status, response.headers.get('retry-after'));
    if (!body) throw new Error('Twelve Data returned an empty or invalid response.');
    if (body.status === 'error') throw new Error(`Twelve Data market data failed: ${body.message ?? 'provider error'}.`);
    if (!body.values) throw new Error('Twelve Data returned no candle series.');
    return body.values.map((bar) => ({
      time: Math.floor(Date.parse(bar.datetime) / 1000),
      open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close), volume: Number(bar.volume ?? 0),
    })).reverse();
  }

  throw new Error(`Unsupported provider for ${instrument.canonicalSymbol}.`);
}

function limitMarketDataSeries(series: MarketDataSeries, limit: number): MarketDataSeries {
  const candles = series.candles.slice(-limit);
  if (candles.length === series.candles.length) return series;

  const startTimestamp = candles[0]?.time ?? null;
  const endTimestamp = candles.at(-1)?.time ?? null;
  const dataVersion = series.dataset.dataVersion;
  const datasetId = [series.dataset.provider, series.dataset.sourceInstrument, series.instrument.quoteAsset, series.timeframe, startTimestamp ?? 'empty', endTimestamp ?? 'empty', dataVersion].join(':');

  return {
    ...series,
    identity: { ...series.identity, startTimestamp, endTimestamp, datasetId },
    dataset: { ...series.dataset, startTimestamp, endTimestamp, id: datasetId },
    candles,
  };
}

function validateCandles(candles: Candle[], canonicalSymbol: string): void {
  let previousTime: number | undefined;
  for (const candle of candles) {
    const values = [candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume];
    if (values.some((value) => !Number.isFinite(value))
      || candle.time < 0
      || candle.open <= 0
      || candle.high <= 0
      || candle.low <= 0
      || candle.close <= 0
      || candle.volume < 0
      || candle.high < Math.max(candle.open, candle.close, candle.low)
      || candle.low > Math.min(candle.open, candle.close, candle.high)
      || (previousTime !== undefined && candle.time <= previousTime)) {
      throw new Error(`Provider returned invalid or unordered candles for ${canonicalSymbol}.`);
    }
    previousTime = candle.time;
  }
}
