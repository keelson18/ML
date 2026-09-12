import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { masterDecisionEngine, type DecisionEngineContext } from "../../../src/lib/intelligence/decision-engine.ts";
import { explainabilityEngine } from "../../../src/lib/intelligence/explainability-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("CORS_ORIGIN") ?? "null",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Max-Age": "600",
  "Vary": "Origin",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function correlationId(req: Request): string {
  return req.headers.get("x-correlation-id") ?? `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function authenticated(req: Request): Promise<boolean> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: { user }, error } = await client.auth.getUser();
  return !error && user !== null;
}

function validRequest(value: unknown): value is DecisionEngineContext {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return typeof request.inputContextId === "string"
    && typeof request.symbol === "string"
    && typeof request.timeframe === "string"
    && Array.isArray(request.candles)
    && request.candles.length > 0
    && request.risk !== undefined
    && request.portfolio !== undefined;
}

Deno.serve(async (req: Request) => {
  const requestCorrelationId = correlationId(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed", correlationId: requestCorrelationId }, 405);

  try {
    if (!(await authenticated(req))) {
      return response({ error: "Authentication required", correlationId: requestCorrelationId }, 401);
    }
    const payload: unknown = await req.json();
    if (!validRequest(payload)) {
      return response({ error: "Invalid analysis request", correlationId: requestCorrelationId }, 400);
    }

    const decision = masterDecisionEngine.analyze(payload);
    const explanation = explainabilityEngine.analyze({
      ...payload,
      decision: decision.result,
      evidence: decision.evidence,
    });
    return response({
      correlationId: requestCorrelationId,
      decision,
      explanation,
      persisted: false,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "decision.analyze.failed",
      correlationId: requestCorrelationId,
      error: error instanceof Error ? error.message : "Unknown error",
    }));
    return response({ error: "Analysis failed", correlationId: requestCorrelationId }, 500);
  }
});