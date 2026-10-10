import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { MARKET_UNIVERSE } from '../../src/lib/markets';
import { twelveDataSymbol } from './domain/LiveSymbolMap';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const rateLimitSettings = z.object({
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive(),
  MARKET_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
  ANALYZE_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
  MARKET_DATA_CACHE_MAX_ENTRIES: z.coerce.number().int().positive(),
  MARKET_DATA_MAX_STALE_TTL_MULTIPLIER: z.coerce.number().positive(),
  MARKET_PROBE_INTERVAL_MS: z.coerce.number().int().positive(),
  MARKET_PROBE_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
}).safeParse({
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS ?? 60_000,
  MARKET_RATE_LIMIT_MAX: process.env.MARKET_RATE_LIMIT_MAX ?? 60,
  ANALYZE_RATE_LIMIT_MAX: process.env.ANALYZE_RATE_LIMIT_MAX ?? 5,
  MARKET_DATA_CACHE_MAX_ENTRIES: process.env.MARKET_DATA_CACHE_MAX_ENTRIES ?? 500,
  MARKET_DATA_MAX_STALE_TTL_MULTIPLIER: process.env.MARKET_DATA_MAX_STALE_TTL_MULTIPLIER ?? 3,
  MARKET_PROBE_INTERVAL_MS: process.env.MARKET_PROBE_INTERVAL_MS ?? 1_000,
  MARKET_PROBE_RATE_LIMIT_MAX: process.env.MARKET_PROBE_RATE_LIMIT_MAX ?? 1,
});

const sessionCalendarEntry = z.object({
  timezone: z.string().min(1).max(64),
  open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
  openAuctionBlackoutMinutes: z.number().int().nonnegative().max(240).default(10),
  closeAuctionBlackoutMinutes: z.number().int().nonnegative().max(240).default(10),
  scoreMultiplier: z.number().finite().positive().max(1).default(1),
});
const parsedSessionCalendar = (() => {
  let raw: unknown;
  try { raw = JSON.parse(process.env.MARKET_SESSION_CALENDAR_JSON ?? '{}'); }
  catch { throw new Error('MARKET_SESSION_CALENDAR_JSON must be valid JSON.'); }
  const result = z.record(z.string(), sessionCalendarEntry).safeParse(raw);
  if (!result.success) throw new Error('MARKET_SESSION_CALENDAR_JSON has an invalid calendar entry.');
  for (const [exchange, calendar] of Object.entries(result.data)) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: calendar.timezone }); }
    catch { throw new Error(`MARKET_SESSION_CALENDAR_JSON has an invalid timezone for ${exchange}.`); }
  }
  return result.data;
})();

if (!rateLimitSettings.success) {
  const variable = rateLimitSettings.error.issues[0]?.path[0] ?? 'rate-limit configuration';
  throw new Error(`${String(variable)} must be a positive number.`);
}

const liveFeedFlag = z.enum(['true', 'false']).transform((value) => value === 'true');
const liveFeedSettings = z.object({
  LIVE_FEED_ENABLED: liveFeedFlag,
  LIVE_FEED_COINBASE_ENABLED: liveFeedFlag,
  LIVE_FEED_TWELVEDATA_ENABLED: liveFeedFlag,
  LIVE_FEED_TWELVEDATA_MAX_SYMBOLS: z.coerce.number().int().positive(),
  LIVE_FEED_MAX_SYMBOLS: z.coerce.number().int().positive(),
  LIVE_FEED_MAX_CLIENTS: z.coerce.number().int().positive(),
  LIVE_FEED_STALE_MS: z.coerce.number().int().positive(),
});

function parseSymbolList(value: string): string[] {
  return [...new Set(value.split(',').map((symbol) => symbol.trim()).filter(Boolean))];
}

export function parseLiveFeedConfig(env: NodeJS.ProcessEnv) {
  const settings = liveFeedSettings.safeParse({
    LIVE_FEED_ENABLED: env.LIVE_FEED_ENABLED ?? 'false',
    LIVE_FEED_COINBASE_ENABLED: env.LIVE_FEED_COINBASE_ENABLED ?? 'true',
    LIVE_FEED_TWELVEDATA_ENABLED: env.LIVE_FEED_TWELVEDATA_ENABLED ?? 'true',
    LIVE_FEED_TWELVEDATA_MAX_SYMBOLS: env.LIVE_FEED_TWELVEDATA_MAX_SYMBOLS ?? 8,
    LIVE_FEED_MAX_SYMBOLS: env.LIVE_FEED_MAX_SYMBOLS ?? 20,
    LIVE_FEED_MAX_CLIENTS: env.LIVE_FEED_MAX_CLIENTS ?? 100,
    LIVE_FEED_STALE_MS: env.LIVE_FEED_STALE_MS ?? 10_000,
  });
  if (!settings.success) {
    const variable = settings.error.issues[0]?.path[0] ?? 'live feed configuration';
    throw new Error(`${String(variable)} has an invalid live feed configuration value.`);
  }

  const twelveDataSymbols = parseSymbolList(env.LIVE_FEED_TWELVEDATA_SYMBOLS ?? 'EURUSD,GBPUSD,USDJPY,XAUUSD');
  const twelveDataCap = settings.data.LIVE_FEED_TWELVEDATA_MAX_SYMBOLS;
  if (twelveDataSymbols.length > twelveDataCap) {
    throw new Error(`LIVE_FEED_TWELVEDATA_SYMBOLS lists ${twelveDataSymbols.length} symbols; the Twelve Data limit is ${twelveDataCap}.`);
  }
  const unstreamable = twelveDataSymbols.filter((symbol) => twelveDataSymbol(symbol) === undefined);
  if (unstreamable.length > 0) {
    throw new Error(`LIVE_FEED_TWELVEDATA_SYMBOLS contains symbols Twelve Data cannot stream: ${unstreamable.join(', ')}.`);
  }

  return {
    enabled: settings.data.LIVE_FEED_ENABLED,
    coinbase: { enabled: settings.data.LIVE_FEED_COINBASE_ENABLED, maxSymbols: settings.data.LIVE_FEED_MAX_SYMBOLS },
    twelveData: { enabled: settings.data.LIVE_FEED_TWELVEDATA_ENABLED, symbols: twelveDataSymbols, maxSymbols: twelveDataCap },
    maxClients: settings.data.LIVE_FEED_MAX_CLIENTS,
    staleMs: settings.data.LIVE_FEED_STALE_MS,
  };
}

export const config = {
  port: Number(process.env.BACKEND_PORT ?? 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  mlServiceApiKey: process.env.ML_SERVICE_API_KEY ?? '',
  massiveApiKey: process.env.MASSIVE_API_KEY ?? '',
  twelveDataApiKey: process.env.TWELVEDATA_API_KEY ?? '',
  rateLimitWindowMs: rateLimitSettings.data.RATE_LIMIT_WINDOW_MS,
  marketRateLimitMax: rateLimitSettings.data.MARKET_RATE_LIMIT_MAX,
  analyzeRateLimitMax: rateLimitSettings.data.ANALYZE_RATE_LIMIT_MAX,
  marketDataCacheMaxEntries: rateLimitSettings.data.MARKET_DATA_CACHE_MAX_ENTRIES,
  marketDataMaxStaleTtlMultiplier: rateLimitSettings.data.MARKET_DATA_MAX_STALE_TTL_MULTIPLIER,
  marketProbeIntervalMs: rateLimitSettings.data.MARKET_PROBE_INTERVAL_MS,
  marketProbeRateLimitMax: rateLimitSettings.data.MARKET_PROBE_RATE_LIMIT_MAX,
  marketSessionCalendar: parsedSessionCalendar,
  liveFeed: parseLiveFeedConfig(process.env),
};

// Validate default and probe override symbols against the same active market registry used by the API.
const activeSymbols = new Set(MARKET_UNIVERSE.filter((market) => market.isActive).map((market) => market.symbol));
export const defaultSymbol = process.env.DEFAULT_SYMBOL?.trim() || MARKET_UNIVERSE.find((market) => market.isActive)?.symbol;
if (!defaultSymbol || !activeSymbols.has(defaultSymbol)) throw new Error('DEFAULT_SYMBOL must name an active market in the market registry.');

export const autonomySymbols = (process.env.AUTONOMY_SYMBOLS?.split(',').map((symbol) => symbol.trim()).filter(Boolean) ?? [defaultSymbol]);
if (autonomySymbols.some((symbol) => !activeSymbols.has(symbol))) throw new Error('AUTONOMY_SYMBOLS must contain only active symbols from the market registry.');

const massiveCryptoSymbols = new Set(MARKET_UNIVERSE
  .filter((market) => market.isActive && market.marketType === 'crypto' && market.provider === 'massive')
  .map((market) => market.symbol));
export const marketsVerifiedOverride = (process.env.MARKETS_VERIFIED_OVERRIDE ?? '').split(',').map((symbol) => symbol.trim()).filter(Boolean);
if (marketsVerifiedOverride.some((symbol) => !massiveCryptoSymbols.has(symbol))) {
  throw new Error('MARKETS_VERIFIED_OVERRIDE must contain only active Massive crypto symbols from the market registry.');
}
