import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { MARKET_UNIVERSE } from '../../src/lib/markets';
import { paperSettlementEligible } from '../../src/lib/marketCapabilities';
import { twelveDataSymbol } from './domain/LiveSymbolMap';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export function parseAutonomousTradingEnabled(value: string | undefined): boolean {
  const parsed = z.enum(['true', 'false']).safeParse(value ?? 'false');
  if (!parsed.success) throw new Error('AUTONOMOUS_TRADING must be either true or false.');
  return parsed.data === 'true';
}

const internalSettings = {
  rateLimitWindowMs: 60_000,
  marketRateLimitMax: 60,
  analyzeRateLimitMax: 5,
  marketDataCacheMaxEntries: 500,
  marketDataMaxStaleTtlMultiplier: 3,
  marketProbeIntervalMs: 1_000,
  marketProbeRateLimitMax: 1,
  massiveRequestsPerWindow: 5,
  massiveBudgetWindowMs: 60_000,
  massiveBudgetMaxWaitMs: 5_000,
  massiveBudgetMaxQueue: 10,
  massiveTraderReservedRequests: 2,
  twelveDataRequestsPerWindow: 8,
  twelveDataTraderReservedRequests: 2,
  twelveDataBudgetWindowMs: 60_000,
  twelveDataBudgetMaxWaitMs: 5_000,
  twelveDataBudgetMaxQueue: 10,
  twelveDataDailyCredits: 800,
  twelveDataTraderReservedCredits: 450,
  researchCollectionStartLeadMs: 300_000,
  liveFeed: {
    enabled: false,
    coinbase: { enabled: true, maxSymbols: 20 },
    twelveData: { enabled: true, symbols: [] as string[], maxSymbols: 8 },
    maxClients: 100,
    staleMs: 10_000,
    gateway: {
      maxConnectionsPerUser: 2,
      maxSubscriptions: 20,
      maxMessageBytes: 4_096,
      maxBufferedBytes: 262_144,
      ticketTtlMs: 30_000,
      ticketRateLimitMax: 10,
      maxConnectionMs: 900_000,
    },
  },
};

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

export function parseLiveFeedConfig() {
  const twelveDataSymbols = MARKET_UNIVERSE
    .filter((market) => market.isActive && twelveDataSymbol(market.symbol) !== undefined)
    .map((market) => market.symbol);
  return {
    ...internalSettings.liveFeed,
    twelveData: { ...internalSettings.liveFeed.twelveData, symbols: twelveDataSymbols },
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
  ...internalSettings,
  marketSessionCalendar: parsedSessionCalendar,
  liveFeed: parseLiveFeedConfig(),
};

// Validate default and configured autonomy symbols against the active market registry.
const activeSymbols = new Set(MARKET_UNIVERSE.filter((market) => market.isActive).map((market) => market.symbol));
const eligibleAutonomyMarkets = MARKET_UNIVERSE.filter((market) => market.isActive && paperSettlementEligible(market));
export const defaultSymbol = eligibleAutonomyMarkets[0]?.symbol;
if (!defaultSymbol || !activeSymbols.has(defaultSymbol)) throw new Error('The market registry must contain an active autonomous market.');
export const autonomySymbols = eligibleAutonomyMarkets.map((market) => market.symbol);
