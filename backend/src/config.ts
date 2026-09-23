import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: Number(process.env.BACKEND_PORT ?? 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  mlServiceApiKey: process.env.ML_SERVICE_API_KEY ?? '',
};
