import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createDecisionProxyHandler } from './proxy.ts';

Deno.serve(createDecisionProxyHandler({
  backendUrl: Deno.env.get('BACKEND_URL'),
  corsOrigins: Deno.env.get('CORS_ORIGIN'),
}));
