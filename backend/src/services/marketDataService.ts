import { createHash } from 'node:crypto';
import { TIMEFRAMES, type Candle, type Market, type MarketDataIdentity, type Timeframe } from '../../../src/lib/types';
import { getMarket } from '../../../src/lib/markets';
import { config } from '../config';
import { fetchWithTimeout } from '../../../src/lib/providers/request';
import { readJsonSafe } from '../../../shared/http';
import { ProviderBudget, ProviderBudgetExhaustedError, type ProviderBudgetSnapshot } from './providerBudget';
import { candleSeconds, selectClosedCandles } from '../trader/candle-math';
import { traderConfig } from '../trader/config';

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

function createMassiveBudget(): ProviderBudget {
  const reservedForPriority = Math.min(config.massiveTraderReservedRequests, config.massiveRequestsPerWindow - 1);
  return new ProviderBudget({
    requestsPerWindow: config.massiveRequestsPerWindow,
    windowMs: config.massiveBudgetWindowMs,
    maxWaitMs: config.massiveBudgetMaxWaitMs,
    maxQueue: config.massiveBudgetMaxQueue,
    reservedForPriority,
  });
}
let massiveBudget = createMassiveBudget();

function createTwelveDataBudget(): ProviderBudget {
  return new ProviderBudget({
    requestsPerWindow: config.twelveDataRequestsPerWindow,
    windowMs: config.twelveDataBudgetWindowMs,
    maxWaitMs: config.twelveDataBudgetMaxWaitMs,
    maxQueue: config.twelveDataBudgetMaxQueue,
  });
}
let twelveDataBudget = createTwelveDataBudget();

export function getMassiveBudgetSnapshot(): ProviderBudgetSnapshot {
  return massiveBudget.snapshot();
}

export function getTwelveDataBudgetSnapshot(): ProviderBudgetSnapshot {
  return twelveDataBudget.snapshot();
}

export function resetMassiveBudgetForTests(): void {
  massiveBudget = createMassiveBudget();
  twelveDataBudget = createTwelveDataBudget();
}

export function clearMarketDataCache(): void {
  marketDataCache.clear();
  inFlightMarketRequests.clear();
}

export function getCachedCandleFreshness(symbols: string[], timeframes: Timeframe[], staleMultiplier: number) {
  const now = Date.now();
  return [...new Set(symbols)].flatMap((symbol) => [...new Set(timeframes)].map((timeframe) => {
    const cached = [...marketDataCache.entries()]
      .filter(([key]) => {
        const parsed = JSON.parse(key) as [string, Timeframe, number];
        return parsed[0] === symbol && parsed[1] === timeframe;
      })
      .map(([, entry]) => entry)
      .sort((left, right) => right.fetchedAt - left.fetchedAt)[0];
    const checkedAt = new Date(now).toISOString();
    const newestClosed = cached && selectClosedCandles(cached.series.candles, timeframe, now).at(-1);
    if (!newestClosed) return { symbol, timeframe, status: 'unverified' as const, reason: 'No cached closed candle is available.', checkedAt, newestClosedCandleAt: null, ageMs: null };
    const candleTime = newestClosed.time * 1000;
    const ageMs = Math.max(0, now - candleTime - candleSeconds(timeframe, newestClosed.time) * 1000);
    const stale = ageMs > candleSeconds(timeframe, newestClosed.time) * 1000 * staleMultiplier;
    return { symbol, timeframe, status: stale ? 'degraded' as const : 'ok' as const, reason: stale ? 'Cached candle exceeds the configured age threshold.' : 'Cached closed candle is within the configured age threshold.', checkedAt, newestClosedCandleAt: new Date(candleTime).toISOString(), ageMs };
  }));
}

export async function probeMarketData(canonicalSymbol: string, timeframe: Timeframe = '1m', requestedLimit = 60): Promise<{
  candleCount: number;
  closedCandleCount: number;
  latestClosedCandleAt: string | null;
  ageMs: number | null;
  stale: boolean;
  provider: string;
  sourceInstrument: string;
}> {
  const instrument = getMarket(canonicalSymbol);
  if (!instrument || instrument.marketType !== 'crypto' || !['massive', 'twelvedata'].includes(instrument.provider) || !instrument.sourceSymbol) {
    throw new Error('Market probe is not configured for this instrument.');
  }
  const candles = await fetchFromProvider(instrument, timeframe, requestedLimit, false);
  validateCandles(candles, instrument, timeframe);
  if (candles.length === 0) throw new Error('Provider returned no candles.');
  const now = Date.now();
  const closed = selectClosedCandles(candles, timeframe, now, traderConfig.CLOSE_GRACE_MS);
  const latest = closed.at(-1);
  if (!latest) return { candleCount: candles.length, closedCandleCount: 0, latestClosedCandleAt: null, ageMs: null, stale: true, provider: instrument.provider, sourceInstrument: instrument.sourceSymbol };
  const durationMs = candleSeconds(timeframe, latest.time) * 1000;
  const ageMs = Math.max(0, now - latest.time * 1000 - durationMs);
  return {
    candleCount: candles.length,
    closedCandleCount: closed.length,
    latestClosedCandleAt: new Date(latest.time * 1000).toISOString(),
    ageMs,
    stale: ageMs > durationMs * config.marketDataMaxStaleTtlMultiplier,
    provider: instrument.provider,
    sourceInstrument: instrument.sourceSymbol,
  };
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

export interface MarketDataFetchOptions {
  priority?: boolean;
}

function candleContentVersion(provider: string, candles: Candle[]): string {
  const contentHash = createHash('sha256').update(JSON.stringify(candles.map(({ time, open, high, low, close, volume }) =>
    [time, open, high, low, close, volume]))).digest('hex');
  return `${provider}-ohlcv-v1:sha256:${contentHash}`;
}

export function fetchMarketData(canonicalSymbol: string, timeframe: Timeframe, limit = 1000, options: MarketDataFetchOptions = {}): Promise<MarketDataSeries> {
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
  const priority = options.priority ?? false;
  const inflightKey = JSON.stringify([canonicalSymbol, timeframe, priority]);
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
  const request = fetchMarketDataUncoalesced(canonicalSymbol, timeframe, limit, priority);
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

async function fetchMarketDataUncoalesced(canonicalSymbol: string, timeframe: Timeframe, limit: number, priority: boolean): Promise<MarketDataSeries> {
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

  const candles = await fetchFromProvider(instrument, timeframe, limit, priority);
  validateCandles(candles, instrument, timeframe);
  const provider = instrument.provider;
  const sourceInstrument = sourceSymbol;
  const startTimestamp = candles[0]?.time ?? null;
  const endTimestamp = candles.at(-1)?.time ?? null;
  const dataVersion = candleContentVersion(provider, candles);
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

async function fetchFromProvider(instrument: Market, timeframe: Timeframe, requestedLimit: number, priority: boolean): Promise<Candle[]> {
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
    await acquireRequestSlot(massiveBudget, 'Massive', priority);
    const response = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const { payload: body } = await readJsonSafe<{
      status?: string;
      error?: string;
      message?: string;
      ticker?: string;
      results?: Array<{ o: number; h: number; l: number; c: number; v?: number; t: number }>;
    }>(response);
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      if (response.status === 429) massiveBudget.backoff(retryAfterMs(retryAfter, config.massiveBudgetWindowMs));
      throw new MarketDataProviderError('Massive', response.status, retryAfter);
    }
    if (!body) throw new Error('Massive returned an empty or invalid response.');
    if (body.status === 'ERROR') throw new Error(`Massive market data failed: ${body.error ?? body.message ?? 'provider error'}.`);
    if (body.ticker !== sourceSymbol) throw new Error(`Massive returned mismatched instrument metadata for ${instrument.canonicalSymbol}.`);
    const candles = (body.results ?? []).map((bar) => ({
      time: Math.floor(bar.t / 1000), open: Number(bar.o), high: Number(bar.h), low: Number(bar.l), close: Number(bar.c), volume: Number(bar.v ?? 0),
    }));
    if (candles.length === 0) throw new Error(`Massive returned no candles for ${instrument.canonicalSymbol}.`);
    return candles;
  }

  if (instrument.provider === 'twelvedata') {
    const apiKey = config.twelveDataApiKey;
    if (!apiKey) throw new Error('TWELVEDATA_API_KEY is not configured on the server.');
    const limit = Math.min(requestedLimit, 1000);
    const query = new URLSearchParams({ symbol: sourceSymbol, interval: TWELVEDATA_TIMEFRAMES[timeframe], outputsize: String(limit), timezone: 'UTC', apikey: apiKey });
    await acquireRequestSlot(twelveDataBudget, 'Twelve Data', priority);
    const response = await fetchWithTimeout(`${TWELVEDATA_REST}/time_series?${query}`);
    const { payload: body } = await readJsonSafe<{
      status?: string;
      message?: string;
      meta?: { symbol?: string };
      values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }>;
    }>(response);
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      if (response.status === 429) twelveDataBudget.backoff(retryAfterMs(retryAfter, config.twelveDataBudgetWindowMs));
      throw new MarketDataProviderError('Twelve Data', response.status, retryAfter);
    }
    if (!body) throw new Error('Twelve Data returned an empty or invalid response.');
    if (body.status === 'error') throw new Error(`Twelve Data market data failed: ${body.message ?? 'provider error'}.`);
    if (!body.values) throw new Error('Twelve Data returned no candle series.');
    if (body.meta?.symbol?.trim().toUpperCase() !== sourceSymbol.trim().toUpperCase()) {
      throw new Error(`Twelve Data returned mismatched instrument metadata for ${instrument.canonicalSymbol}.`);
    }
    const candles = body.values.map((bar) => ({
      time: Math.floor(parseUtcTimestamp(bar.datetime) / 1000),
      open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close), volume: Number(bar.volume ?? 0),
    })).reverse();
    if (candles.length === 0) throw new Error(`Twelve Data returned no candles for ${instrument.canonicalSymbol}.`);
    return candles;
  }

  throw new Error(`Unsupported provider for ${instrument.canonicalSymbol}.`);
}

function parseUtcTimestamp(value: string): number {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return Date.parse(hasTimezone ? value : `${value.replace(' ', 'T')}Z`);
}

async function acquireRequestSlot(budget: ProviderBudget, provider: string, priority: boolean): Promise<void> {
  try {
    await budget.acquire(priority);
  } catch (error) {
    if (error instanceof ProviderBudgetExhaustedError) throw new MarketDataProviderError(provider, 429, String(error.retryAfterSeconds));
    throw error;
  }
}

function retryAfterMs(header: string | null, windowMs: number): number {
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : windowMs;
}

function limitMarketDataSeries(series: MarketDataSeries, limit: number): MarketDataSeries {
  const candles = series.candles.slice(-limit);
  if (candles.length === series.candles.length) return series;

  const startTimestamp = candles[0]?.time ?? null;
  const endTimestamp = candles.at(-1)?.time ?? null;
  const dataVersion = candleContentVersion(series.dataset.provider, candles);
  const datasetId = [series.dataset.provider, series.dataset.sourceInstrument, series.instrument.quoteAsset, series.timeframe, startTimestamp ?? 'empty', endTimestamp ?? 'empty', dataVersion].join(':');

  return {
    ...series,
    identity: { ...series.identity, startTimestamp, endTimestamp, datasetId, dataVersion },
    dataset: { ...series.dataset, startTimestamp, endTimestamp, id: datasetId, dataVersion },
    candles,
  };
}

function validateCandles(candles: Candle[], instrument: Market, timeframe: Timeframe, nowMs = Date.now()): void {
  let previousTime: number | undefined;
  for (const candle of candles) {
    const values = [candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume];
    const futureDated = candle.time * 1000 > nowMs;
    const misalignedCryptoBar = instrument.marketType === 'crypto' && timeframe !== '1w' && timeframe !== '1M'
      && candle.time % candleSeconds(timeframe, candle.time) !== 0;
    if (values.some((value) => !Number.isFinite(value))
      || candle.time < 0
      || futureDated
      || misalignedCryptoBar
      || candle.open <= 0
      || candle.high <= 0
      || candle.low <= 0
      || candle.close <= 0
      || candle.volume < 0
      || candle.high < Math.max(candle.open, candle.close, candle.low)
      || candle.low > Math.min(candle.open, candle.close, candle.high)
      || (previousTime !== undefined && candle.time <= previousTime)) {
      throw new Error(`Provider returned invalid, future-dated, misaligned, or unordered candles for ${instrument.canonicalSymbol}.`);
    }
    previousTime = candle.time;
  }
}
