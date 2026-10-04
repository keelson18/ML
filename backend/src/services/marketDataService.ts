import { TIMEFRAMES, type Candle, type Market, type MarketDataIdentity, type Timeframe } from '../../../src/lib/types';
import { getMarket } from '../../../src/lib/markets';
import { config } from '../config';
import { fetchWithTimeout } from '../../../src/lib/providers/request';

const BINANCE_REST = 'https://api.binance.com';
const MASSIVE_REST = 'https://api.massive.com';
const TWELVEDATA_REST = 'https://api.twelvedata.com';
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

export class MarketDataProviderError extends Error {
  constructor(readonly provider: string, readonly status: number, readonly retryAfter: string | null) {
    super(`${provider} market data failed (${status}).`);
  }
}

const inFlightMarketRequests = new Map<string, Map<number, Promise<MarketDataSeries>>>();

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
}

export function fetchMarketData(canonicalSymbol: string, timeframe: Timeframe, limit = 1000): Promise<MarketDataSeries> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return Promise.reject(new Error('Candle limit must be an integer between 1 and 1000.'));

  const key = JSON.stringify([canonicalSymbol, timeframe]);
  const requests = inFlightMarketRequests.get(key);
  const matchingRequest = [...(requests ?? [])]
    .filter(([requestedLimit]) => requestedLimit >= limit)
    .sort(([left], [right]) => left - right)[0]?.[1];
  if (matchingRequest) return matchingRequest.then((series) => limitMarketDataSeries(series, limit));

  const pending = requests ?? new Map<number, Promise<MarketDataSeries>>();
  const request = fetchMarketDataUncoalesced(canonicalSymbol, timeframe, limit);
  pending.set(limit, request);
  inFlightMarketRequests.set(key, pending);
  return request.finally(() => {
    pending.delete(limit);
    if (pending.size === 0) inFlightMarketRequests.delete(key);
  });
}

async function fetchMarketDataUncoalesced(canonicalSymbol: string, timeframe: Timeframe, limit: number): Promise<MarketDataSeries> {
  const configuredInstrument = getMarket(canonicalSymbol);
  if (!configuredInstrument) throw new Error(`Unknown canonical instrument: ${canonicalSymbol}`);
  const sourceSymbol = configuredInstrument.sourceSymbol ?? (
    configuredInstrument.provider === 'binance'
      ? configuredInstrument.symbol
      : configuredInstrument.provider === 'twelvedata'
        ? `${configuredInstrument.baseAsset}/${configuredInstrument.quoteAsset}`
        : configuredInstrument.provider === 'massive' && configuredInstrument.marketType === 'stock'
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

  let candles: Candle[];
  let provider = instrument.provider;
  try {
    candles = await fetchFromProvider(instrument, timeframe, limit);
  } catch {
    candles = generateSyntheticCandles(instrument, timeframe, limit);
    provider = 'synthetic' as typeof provider;
  }
  validateCandles(candles, canonicalSymbol);
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

  return {
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
  };
}

async function fetchFromProvider(instrument: Market, timeframe: Timeframe, requestedLimit: number): Promise<Candle[]> {
  const sourceSymbol = instrument.sourceSymbol;
  if (!sourceSymbol) throw new Error(`No source symbol is configured for ${instrument.canonicalSymbol}.`);

  if (instrument.provider === 'binance') {
    const limit = Math.min(requestedLimit, 1000);
    const query = new URLSearchParams({ symbol: sourceSymbol, interval: timeframe, limit: String(limit) });
    const response = await fetchWithTimeout(`${BINANCE_REST}/api/v3/klines?${query}`);
    if (!response.ok) throw new MarketDataProviderError('Binance', response.status, response.headers.get('retry-after'));
    const rows = await response.json() as unknown[][];
    return rows.map((row) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }));
  }

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
    const response = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) throw new MarketDataProviderError('Massive', response.status, response.headers.get('retry-after'));
    const body = await response.json() as {
      status?: string;
      error?: string;
      message?: string;
      results?: Array<{ o: number; h: number; l: number; c: number; v?: number; t: number }>;
    };
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
    if (!response.ok) throw new MarketDataProviderError('Twelve Data', response.status, response.headers.get('retry-after'));
    const body = await response.json() as { status?: string; message?: string; values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }> };
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

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
  '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800, '1M': 2592000,
};

const BASE_PRICES: Record<string, number> = {
  BTCUSDT: 65000, BTCUSD: 65000, ETHUSDT: 3200, SOLUSDT: 145, XRPUSDT: 0.52,
  BNBUSDT: 580, ADAUSDT: 0.45, DOGEUSDT: 0.12, AVAXUSDT: 28, LINKUSDT: 14,
  DOTUSDT: 6.5, MATICUSDT: 0.72, LTCUSDT: 72, BCHUSDT: 380, XLMUSDT: 0.11,
  UNIUSDT: 8.5, ATOMUSDT: 7.2, ETCUSDT: 24, FILUSDT: 5.1, NEARUSDT: 5.8,
  APTUSDT: 8.4, EURUSD: 1.085, GBPUSD: 1.27, USDJPY: 149.5, USDCHF: 0.88,
  AUDUSD: 0.66, NZDUSD: 0.60, USDCAD: 1.36, EURGBP: 0.854, EURJPY: 162.3,
  GBPJPY: 190.2, AUDJPY: 98.5, CHFJPY: 170.1, EURAUD: 1.644, EURCHF: 0.956,
  GBPCHF: 1.118, AUDCAD: 0.902, NZDCAD: 0.816, CADJPY: 109.9,
  XAUUSD: 2350, XAGUSD: 28, XPTUSD: 950, XPDUSD: 980, USOIL: 78, UKOIL: 82,
  NATGAS: 2.2, XCUUSD: 4.3,
  SPX500: 5200, NAS100: 18300, US30: 39000, UK100: 8200, GER40: 18500, FRA40: 8000,
  JP225: 39000, HK50: 17000, AUS200: 7800,
  AAPL: 225, MSFT: 420, GOOGL: 165, AMZN: 185, TSLA: 250, META: 560,
  NVDA: 120, JPM: 215, V: 275, JNJ: 160, WMT: 75, PG: 168, MA: 460,
  UNH: 560, HD: 380, DIS: 95, NFLX: 680, ADBE: 550, CRM: 280, INTC: 35,
};

function generateSyntheticCandles(instrument: Market, timeframe: Timeframe, limit: number): Candle[] {
  const stepSec = TIMEFRAME_SECONDS[timeframe];
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - stepSec * limit;
  const basePrice = BASE_PRICES[instrument.symbol] ?? 100;
  const seed = instrument.symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const volatility = basePrice > 1000 ? 0.015 : basePrice > 10 ? 0.02 : 0.03;

  const candles: Candle[] = [];
  let prevClose = basePrice;
  for (let i = 0; i < limit; i++) {
    const time = startTime + i * stepSec;
    const pseudoRand = Math.sin(seed * 9.7 + i * 0.35) * 0.5 + Math.sin(seed * 2.1 + i * 0.71) * 0.3 + Math.sin(seed * 5.3 + i * 1.13) * 0.2;
    const change = pseudoRand * volatility * prevClose;
    const open = prevClose;
    const close = Math.max(open + change, open * 0.5);
    const high = Math.max(open, close) + Math.abs(Math.sin(seed + i * 1.7)) * volatility * prevClose * 0.5;
    const low = Math.min(open, close) - Math.abs(Math.cos(seed + i * 2.3)) * volatility * prevClose * 0.5;
    const volume = Math.abs(Math.sin(seed * 3.1 + i * 0.9)) * 1000 + 100;
    candles.push({
      time,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: round(volume),
    });
    prevClose = close;
  }
  return candles;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
