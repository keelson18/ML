import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const rateLimitSettings = z.object({
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive(),
  MARKET_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
  ANALYZE_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
}).safeParse({
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS ?? 60_000,
  MARKET_RATE_LIMIT_MAX: process.env.MARKET_RATE_LIMIT_MAX ?? 60,
  ANALYZE_RATE_LIMIT_MAX: process.env.ANALYZE_RATE_LIMIT_MAX ?? 5,
});

if (!rateLimitSettings.success) {
  const variable = rateLimitSettings.error.issues[0]?.path[0] ?? 'rate-limit configuration';
  throw new Error(`${String(variable)} must be a positive integer.`);
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
};
