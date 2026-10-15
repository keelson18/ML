import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { MARKET_UNIVERSE } from '../../src/lib/markets';
import { twelveDataSymbol } from './domain/LiveSymbolMap';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export function parseAutonomousTradingEnabled(value: string | undefined): boolean {
  const parsed = z.enum(['true', 'false']).safeParse(value ?? 'false');
  if (!parsed.success) throw new Error('AUTONOMOUS_TRADING must be either true or false.');
  return parsed.data === 'true';
}

const rateLimitSettings = z.object({
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive(),
  MARKET_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
  ANALYZE_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
  MARKET_DATA_CACHE_MAX_ENTRIES: z.coerce.number().int().positive(),
  MARKET_DATA_MAX_STALE_TTL_MULTIPLIER: z.coerce.number().positive(),
  MARKET_PROBE_INTERVAL_MS: z.coerce.number().int().positive(),
  MARKET_PROBE_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
  MASSIVE_REQUESTS_PER_WINDOW: z.coerce.number().int().positive(),
  MASSIVE_BUDGET_WINDOW_MS: z.coerce.number().int().positive(),
  MASSIVE_BUDGET_MAX_WAIT_MS: z.coerce.number().int().nonnegative(),
  MASSIVE_BUDGET_MAX_QUEUE: z.coerce.number().int().nonnegative(),
  MASSIVE_TRADER_RESERVED_REQUESTS: z.coerce.number().int().nonnegative(),
  TWELVEDATA_REQUESTS_PER_WINDOW: z.coerce.number().int().positive(),
  TWELVEDATA_BUDGET_WINDOW_MS: z.coerce.number().int().positive(),
  TWELVEDATA_BUDGET_MAX_WAIT_MS: z.coerce.number().int().nonnegative(),
  TWELVEDATA_BUDGET_MAX_QUEUE: z.coerce.number().int().nonnegative(),
  RESEARCH_COLLECTION_START_LEAD_MS: z.coerce.number().int().positive(),
}).safeParse({
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS ?? 60_000,
  MARKET_RATE_LIMIT_MAX: process.env.MARKET_RATE_LIMIT_MAX ?? 60,
  ANALYZE_RATE_LIMIT_MAX: process.env.ANALYZE_RATE_LIMIT_MAX ?? 5,
  MARKET_DATA_CACHE_MAX_ENTRIES: process.env.MARKET_DATA_CACHE_MAX_ENTRIES ?? 500,
  MARKET_DATA_MAX_STALE_TTL_MULTIPLIER: process.env.MARKET_DATA_MAX_STALE_TTL_MULTIPLIER ?? 3,
  MARKET_PROBE_INTERVAL_MS: process.env.MARKET_PROBE_INTERVAL_MS ?? 1_000,
  MARKET_PROBE_RATE_LIMIT_MAX: process.env.MARKET_PROBE_RATE_LIMIT_MAX ?? 1,
  MASSIVE_REQUESTS_PER_WINDOW: process.env.MASSIVE_REQUESTS_PER_WINDOW ?? 5,
  MASSIVE_BUDGET_WINDOW_MS: process.env.MASSIVE_BUDGET_WINDOW_MS ?? 60_000,
  MASSIVE_BUDGET_MAX_WAIT_MS: process.env.MASSIVE_BUDGET_MAX_WAIT_MS ?? 5_000,
  MASSIVE_BUDGET_MAX_QUEUE: process.env.MASSIVE_BUDGET_MAX_QUEUE ?? 10,
  MASSIVE_TRADER_RESERVED_REQUESTS: process.env.MASSIVE_TRADER_RESERVED_REQUESTS ?? 2,
  TWELVEDATA_REQUESTS_PER_WINDOW: process.env.TWELVEDATA_REQUESTS_PER_WINDOW ?? 8,
  TWELVEDATA_BUDGET_WINDOW_MS: process.env.TWELVEDATA_BUDGET_WINDOW_MS ?? 60_000,
  TWELVEDATA_BUDGET_MAX_WAIT_MS: process.env.TWELVEDATA_BUDGET_MAX_WAIT_MS ?? 5_000,
  TWELVEDATA_BUDGET_MAX_QUEUE: process.env.TWELVEDATA_BUDGET_MAX_QUEUE ?? 10,
  RESEARCH_COLLECTION_START_LEAD_MS: process.env.RESEARCH_COLLECTION_START_LEAD_MS ?? 300_000,
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
  LIVE_FEED_MAX_CONNECTIONS_PER_USER: z.coerce.number().int().positive(),
  LIVE_FEED_MAX_SUBSCRIPTIONS: z.coerce.number().int().positive(),
  LIVE_FEED_MAX_MESSAGE_BYTES: z.coerce.number().int().positive(),
  LIVE_FEED_MAX_BUFFERED_BYTES: z.coerce.number().int().positive(),
  LIVE_FEED_TICKET_TTL_MS: z.coerce.number().int().positive(),
  LIVE_FEED_TICKET_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
  LIVE_FEED_MAX_CONNECTION_MS: z.coerce.number().int().positive(),
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
    LIVE_FEED_MAX_CONNECTIONS_PER_USER: env.LIVE_FEED_MAX_CONNECTIONS_PER_USER ?? 2,
    LIVE_FEED_MAX_SUBSCRIPTIONS: env.LIVE_FEED_MAX_SUBSCRIPTIONS ?? 20,
    LIVE_FEED_MAX_MESSAGE_BYTES: env.LIVE_FEED_MAX_MESSAGE_BYTES ?? 4_096,
    LIVE_FEED_MAX_BUFFERED_BYTES: env.LIVE_FEED_MAX_BUFFERED_BYTES ?? 262_144,
    LIVE_FEED_TICKET_TTL_MS: env.LIVE_FEED_TICKET_TTL_MS ?? 30_000,
    LIVE_FEED_TICKET_RATE_LIMIT_MAX: env.LIVE_FEED_TICKET_RATE_LIMIT_MAX ?? 10,
    LIVE_FEED_MAX_CONNECTION_MS: env.LIVE_FEED_MAX_CONNECTION_MS ?? 900_000,
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
    gateway: {
      maxConnectionsPerUser: settings.data.LIVE_FEED_MAX_CONNECTIONS_PER_USER,
      maxSubscriptions: settings.data.LIVE_FEED_MAX_SUBSCRIPTIONS,
      maxMessageBytes: settings.data.LIVE_FEED_MAX_MESSAGE_BYTES,
      maxBufferedBytes: settings.data.LIVE_FEED_MAX_BUFFERED_BYTES,
      ticketTtlMs: settings.data.LIVE_FEED_TICKET_TTL_MS,
      ticketRateLimitMax: settings.data.LIVE_FEED_TICKET_RATE_LIMIT_MAX,
      maxConnectionMs: settings.data.LIVE_FEED_MAX_CONNECTION_MS,
    },
  };
}

const adminOverviewSettings = z.object({
  APP_ENV: z.enum(['test', 'production']),
  ADMIN_OVERVIEW_CACHE_TTL_MS: z.coerce.number().int().positive(),
  ADMIN_OVERVIEW_REFRESH_MS: z.coerce.number().int().positive(),
  ADMIN_CANDLE_STALE_MULTIPLIER: z.coerce.number().positive(),
}).safeParse({
  APP_ENV: process.env.APP_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'test'),
  ADMIN_OVERVIEW_CACHE_TTL_MS: process.env.ADMIN_OVERVIEW_CACHE_TTL_MS ?? 15_000,
  ADMIN_OVERVIEW_REFRESH_MS: process.env.ADMIN_OVERVIEW_REFRESH_MS ?? 30_000,
  ADMIN_CANDLE_STALE_MULTIPLIER: process.env.ADMIN_CANDLE_STALE_MULTIPLIER ?? 3,
});
if (!adminOverviewSettings.success) throw new Error('Admin health environment settings are invalid.');

export const config = {
  autonomousTradingEnabled: parseAutonomousTradingEnabled(process.env.AUTONOMOUS_TRADING),
  appEnvironment: adminOverviewSettings.data.APP_ENV,
  adminOverviewCacheTtlMs: adminOverviewSettings.data.ADMIN_OVERVIEW_CACHE_TTL_MS,
  adminOverviewRefreshMs: adminOverviewSettings.data.ADMIN_OVERVIEW_REFRESH_MS,
  adminCandleStaleMultiplier: adminOverviewSettings.data.ADMIN_CANDLE_STALE_MULTIPLIER,
  port: Number(process.env.BACKEND_PORT ?? 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || '',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  mlServiceApiKey: process.env.ML_SERVICE_API_KEY ?? '',
  massiveApiKey: process.env.MASSIVE_API_KEY ?? '',
  twelveDataApiKey: process.env.TWELVEDATA_API_KEY ?? '',
  rateLimitWindowMs: rateLimitSettings.data.RATE_LIMIT_WINDOW_MS,
  marketRateLimitMax: rateLimitSettings.data.MARKET_RATE_LIMIT_MAX,
  analyzeRateLimitMax: rateLimitSettings.data.ANALYZE_RATE_LIMIT_MAX,
  marketDataCacheMaxEntries: rateLimitSettings.data.MARKET_DATA_CACHE_MAX_ENTRIES,
  marketDataMaxStaleTtlMultiplier: rateLimitSettings.data.MARKET_DATA_MAX_STALE_TTL_MULTIPLIER,
  researchCollectionStartLeadMs: rateLimitSettings.data.RESEARCH_COLLECTION_START_LEAD_MS,
  marketProbeIntervalMs: rateLimitSettings.data.MARKET_PROBE_INTERVAL_MS,
  marketProbeRateLimitMax: rateLimitSettings.data.MARKET_PROBE_RATE_LIMIT_MAX,
  massiveRequestsPerWindow: rateLimitSettings.data.MASSIVE_REQUESTS_PER_WINDOW,
  massiveBudgetWindowMs: rateLimitSettings.data.MASSIVE_BUDGET_WINDOW_MS,
  massiveBudgetMaxWaitMs: rateLimitSettings.data.MASSIVE_BUDGET_MAX_WAIT_MS,
  massiveBudgetMaxQueue: rateLimitSettings.data.MASSIVE_BUDGET_MAX_QUEUE,
  massiveTraderReservedRequests: rateLimitSettings.data.MASSIVE_TRADER_RESERVED_REQUESTS,
  twelveDataRequestsPerWindow: rateLimitSettings.data.TWELVEDATA_REQUESTS_PER_WINDOW,
  twelveDataBudgetWindowMs: rateLimitSettings.data.TWELVEDATA_BUDGET_WINDOW_MS,
  twelveDataBudgetMaxWaitMs: rateLimitSettings.data.TWELVEDATA_BUDGET_MAX_WAIT_MS,
  twelveDataBudgetMaxQueue: rateLimitSettings.data.TWELVEDATA_BUDGET_MAX_QUEUE,
  marketSessionCalendar: parsedSessionCalendar,
  liveFeed: parseLiveFeedConfig(process.env),
};

// Validate default and configured autonomy symbols against the active market registry.
const activeSymbols = new Set(MARKET_UNIVERSE.filter((market) => market.isActive).map((market) => market.symbol));
export const defaultSymbol = process.env.DEFAULT_SYMBOL?.trim() || MARKET_UNIVERSE.find((market) => market.isActive)?.symbol;
if (!defaultSymbol || !activeSymbols.has(defaultSymbol)) throw new Error('DEFAULT_SYMBOL must name an active market in the market registry.');

export const autonomySymbols = (process.env.AUTONOMY_SYMBOLS?.split(',').map((symbol) => symbol.trim()).filter(Boolean) ?? [defaultSymbol]);
if (autonomySymbols.some((symbol) => !activeSymbols.has(symbol))) throw new Error('AUTONOMY_SYMBOLS must contain only active symbols from the market registry.');
