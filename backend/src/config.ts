import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { MARKET_UNIVERSE } from '../../src/lib/markets';

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

if (!rateLimitSettings.success) {
  const variable = rateLimitSettings.error.issues[0]?.path[0] ?? 'rate-limit configuration';
  throw new Error(`${String(variable)} must be a positive number.`);
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
