// Quantum Intelligence — ML prediction microservice (Edge Function).
// Replaces the Python FastAPI service from the original spec with a Deno/TS equivalent.
// Implements feature engineering + a logistic-regression classifier trained on OHLCV features,
// exposed via the same contract: POST /predict, GET /model/status, POST /retrain.
// Prediction requests require an authenticated Supabase user. Retraining is
// restricted to the server-side service key.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { readJsonSafe } from "../../../shared/http.ts";
import { computeMlFeatures, type MlCandle } from "../../../shared/ml-features.ts";

function corsHeaders(origin: string | undefined): Record<string, string> {
  return {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
  };
}

// ---- Config ----
// SECURITY: ML_SERVICE_API_KEY must be explicitly configured in the environment
// for protected maintenance operations. It is never sent to the browser.
function maintenanceApiKey(): string | null {
  return Deno.env.get("ML_SERVICE_API_KEY") ?? null;
}

function backendUrl(): string | null {
  const value = Deno.env.get('BACKEND_URL')?.trim();
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('BACKEND_URL must be a valid absolute URL.');
  }
  const functionEnvironment = Deno.env.get('ML_FUNCTION_ENV') ?? 'production';
  if (!['development', 'production'].includes(functionEnvironment)) {
    throw new Error('ML_FUNCTION_ENV must be development or production.');
  }
  if (functionEnvironment === 'production' && parsed.protocol !== 'https:') {
    throw new Error('BACKEND_URL must use HTTPS in production.');
  }
  if (functionEnvironment === 'development' && !['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('BACKEND_URL must use HTTP or HTTPS.');
  }
  return parsed.toString().replace(/\/$/, '');
}

const BACKEND_URL = backendUrl();
const PRED_HORIZON = 5; // candles ahead to predict
const DEFAULT_LABEL_ATR_MULTIPLE = 0.1;

function labelAtrMultiple(): number {
  const configured = Deno.env.get("ML_LABEL_ATR_MULTIPLE");
  if (configured === undefined || configured.trim() === "") return DEFAULT_LABEL_ATR_MULTIPLE;
  const value = Number(configured);
  if (!Number.isFinite(value) || value < 0) throw new Error("ML_LABEL_ATR_MULTIPLE must be a finite non-negative number.");
  return value;
}
const TRAIN_FRACTION = 0.7; // chronological split, no shuffling

// In-memory model state. NOTE: edge functions may reset between requests, so this is
// best-effort. For durable state we persist to the `ml_predictions` table on each retrain.
interface ModelState {
  weights: number[];
  bias: number;
  metrics: { accuracy: number; f1: number; samples: number };
  trainedAt: string;
  dataRange: { start: number; end: number };
  version: string;
  mean: number[];
  std: number[];
  pair: string;
  timeframe: string;
}
const modelStates = new Map<string, ModelState>();
const trainingFlights = new Map<string, Promise<{ ok: boolean; metrics: ModelMetrics; version: string }>>();
const modelKey = (pair: string, timeframe: string) => `${pair}:${timeframe}`;

async function ensureModel(supabase: SupabaseClient, pair: string, timeframe: string, accessToken: string): Promise<ModelState> {
  const key = modelKey(pair, timeframe);
  const existing = modelStates.get(key);
  if (existing) return existing;
  let flight = trainingFlights.get(key);
  if (!flight) {
    flight = retrainInternal(supabase, pair, timeframe, accessToken);
    trainingFlights.set(key, flight);
  }
  try {
    await flight;
  } finally {
    if (trainingFlights.get(key) === flight) trainingFlights.delete(key);
  }
  const trained = modelStates.get(key);
  if (!trained) throw new Error('Model training did not produce a model.');
  return trained;
}

// ---- Feature engineering ----
// Computes the same feature set as the Python spec: multi-window returns, RSI, MACD,
// MAs (20/50/200), Bollinger width, volume change, ATR.
function computeFeatures(candles: Candle[]): { features: number[][]; labels: number[]; valid: boolean } {
  return computeMlFeatures(candles as MlCandle[], { predictionHorizon: PRED_HORIZON, minimumMoveAtr: labelAtrMultiple() });
}

// ---- Logistic regression with gradient descent ----
// Simple, dependency-free classifier. Trains on standardized features.
function trainLogistic(features: number[][], labels: number[], epochs = 200, lr = 0.1) {
  const n = features.length;
  const d = features[0].length;
  // Standardize.
  const mean = new Array(d).fill(0);
  for (const f of features) for (let j = 0; j < d; j++) mean[j] += f[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  const std = new Array(d).fill(0);
  for (const f of features) for (let j = 0; j < d; j++) std[j] += (f[j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / n) || 1;
  const X = features.map((f) => f.map((v, j) => (v - mean[j]) / std[j]));

  const weights = new Array(d).fill(0);
  let bias = 0;
  const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
  for (let e = 0; e < epochs; e++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const z = bias + X[i].reduce((s, x, j) => s + x * weights[j], 0);
      const pred = sigmoid(z);
      const err = pred - labels[i];
      for (let j = 0; j < d; j++) gradW[j] += err * X[i][j];
      gradB += err;
    }
    for (let j = 0; j < d; j++) weights[j] -= (lr * gradW[j]) / n;
    bias -= (lr * gradB) / n;
  }
  return { weights, bias, mean, std };
}

function predictProba(model: { weights: number[]; bias: number; mean: number[]; std: number[] }, x: number[]) {
  const xStd = x.map((v, j) => (v - model.mean[j]) / model.std[j]);
  const z = model.bias + xStd.reduce((s, v, j) => s + v * model.weights[j], 0);
  return 1 / (1 + Math.exp(-z));
}

// ---- Data fetching ----
// Routes through the backend market data service so ML predictions use the same
// provider (Massive/Twelve Data) as the UI, not a separate legacy feed.
async function fetchCandles(symbol: string, timeframe: string, limit: number, accessToken: string): Promise<{ candles: Candle[]; provider: string; quoteCurrency: string }> {
  if (!BACKEND_URL) throw new Error('Market data service is not configured.');
  const url = `${BACKEND_URL}/api/v1/market/candles/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const { payload } = await readJsonSafe<{ candles: Candle[]; dataset: { provider: string; quoteCurrency: string } }>(res);
  if (!res.ok) throw new Error(`Market data service ${res.status}`);
  if (payload === null) throw new Error('Market data service returned an empty or invalid response.');
  return { candles: payload.candles, provider: payload.dataset.provider, quoteCurrency: payload.dataset.quoteCurrency };
}

// ---- Rate limiting (durable via Supabase table) ----
async function checkRate(supabase: SupabaseClient, key: string, maxPerMin: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('consume_ml_rate_limit', {
    p_key: key,
    p_max_requests: maxPerMin,
  });
  if (error) throw new Error(`ML rate-limit check failed: ${error.message}`);
  return data === true;
}

// ---- Auth ----
function authorized(req: Request): boolean {
  const key = req.headers.get('x-api-key');
  const configuredKey = maintenanceApiKey();
  return configuredKey !== null && key === configuredKey;
}

async function authenticatedUser(req: Request): Promise<string | null> {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  );
  const accessToken = authorization.slice('Bearer '.length);
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  return !error && user ? user.id : null;
}

// ---- Main handler ----
Deno.serve(async (req: Request) => {
  const origin = Deno.env.get('CORS_ORIGIN') || undefined;
  const headers = corsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers });
  if (!origin) {
    return jsonResponse({ error: 'Service misconfigured' }, 500, headers);
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop() ?? '';

    // /model/status is public (metadata only); /predict and /retrain require the API key.
    if (path === 'model-status' || path === 'status') {
      const pair = url.searchParams.get('pair');
      const timeframe = url.searchParams.get('timeframe');
      const modelState = pair && timeframe
        ? modelStates.get(modelKey(pair, timeframe))
        : Array.from(modelStates.values()).at(-1);
      return jsonResponse({
        trained: Boolean(modelState),
        version: modelState?.version ?? 'untrained',
        trainedAt: modelState?.trainedAt ?? null,
        metrics: modelState?.metrics ?? null,
        dataRange: modelState?.dataRange ?? null,
        pair: modelState?.pair ?? null,
        timeframe: modelState?.timeframe ?? null,
        availableModels: [...modelStates.values()].map(({ pair: modelPair, timeframe: modelTimeframe, version }) => ({ pair: modelPair, timeframe: modelTimeframe, version })),
        horizon: PRED_HORIZON,
      }, 200, headers);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    if (path === 'predict' && req.method === 'POST') {
      const userId = await authenticatedUser(req);
      if (!userId) {
        console.warn(`[ml] unauthenticated prediction attempt from ${req.headers.get('x-forwarded-for') ?? 'unknown'}`);
        return jsonResponse({ error: 'Authentication required' }, 401, headers);
      }
      const { pair, timeframe } = await req.json() as { pair?: string; timeframe?: string };
      if (typeof pair !== 'string' || !/^[A-Z0-9]{2,20}$/.test(pair)
        || typeof timeframe !== 'string' || !['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'].includes(timeframe)) {
        return jsonResponse({ error: 'A valid pair and timeframe are required' }, 400, headers);
      }
      // Rate limit: 30 predicts/min.
      if (!(await checkRate(supabase, `predict-${userId}`, 30))) {
        return jsonResponse({ error: 'Rate limit exceeded' }, 429, headers);
      }
      const authHeader = req.headers.get('Authorization') ?? '';
      const token = authHeader.slice('Bearer '.length);
      const modelState = await ensureModel(supabase, pair, timeframe, token);
      const { candles, provider, quoteCurrency } = await fetchCandles(pair, timeframe, 1000, token);
      const { features, valid } = computeFeatures(candles);
      if (!valid || features.length === 0) return jsonResponse({ error: 'Insufficient data' }, 422, headers);
      const last = features[features.length - 1];
      const probUp = predictProba(modelState, last);
      const prediction = probUp > 0.55 ? 'up' : probUp < 0.45 ? 'down' : 'flat';
      const expectedMovePct = (probUp - 0.5) * 2 * (modelState.metrics.accuracy * 5);
      const confidence = probUp > 0.7 || probUp < 0.3 ? 'high' : probUp > 0.6 || probUp < 0.4 ? 'medium' : 'low';

      const out = {
        pair,
        timeframe,
        prediction,
        probability: Number(probUp.toFixed(3)),
        expected_move_pct: Number(expectedMovePct.toFixed(2)),
        model_version: modelState.version,
        confidence,
        dataProvider: provider,
        quoteCurrency,
      };
      // Cache prediction durably.
      await supabase.from('ml_predictions').upsert({
        symbol: pair, timeframe, prediction, probability: probUp,
        expected_move_pct: expectedMovePct, model_version: modelState.version, confidence,
        payload: out,
      }, { onConflict: 'symbol,timeframe' });
      return jsonResponse(out, 200, headers);
    }

    if (path === 'retrain' && req.method === 'POST') {
      if (!authorized(req)) {
        return jsonResponse({ error: 'Unauthorized' }, 401, headers);
      }
      if (!(await checkRate(supabase, 'retrain', 2))) return jsonResponse({ error: 'Rate limit exceeded' }, 429, headers);
      const requestBody = await req.json().catch(() => ({})) as { pair?: unknown; timeframe?: unknown };
      const pair = requestBody.pair ?? Deno.env.get('DEFAULT_SYMBOL')?.trim();
      const timeframe = requestBody.timeframe ?? '1h';
      if (typeof pair !== 'string' || pair.length === 0) {
        return jsonResponse({ error: 'Default market is not configured.' }, 503, headers);
      }
      if (typeof pair !== 'string' || !/^[A-Z0-9]{2,20}$/.test(pair)
        || typeof timeframe !== 'string' || !['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'].includes(timeframe)) {
        return jsonResponse({ error: 'A valid pair and timeframe are required' }, 400, headers);
      }
      const authHeader = req.headers.get('Authorization') ?? '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;
      const result = await retrainInternal(supabase, pair, timeframe, token);
      return jsonResponse(result, 200, headers);
    }

    return jsonResponse({ error: 'Not found' }, 404, headers);
  } catch (err) {
    if (err instanceof Error && err.message === 'Market data service is not configured.') {
      console.error('[ml] market data backend URL is not configured');
      return jsonResponse({ error: 'Market data service not configured.' }, 503, headers);
    }
    console.error('[ml]', err);
    return jsonResponse({ error: 'Internal error' }, 500, headers);
  }
});

function jsonResponse(body: unknown, status = 200, headersOverride?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(headersOverride ?? corsHeaders(Deno.env.get('CORS_ORIGIN') || undefined)), 'Content-Type': 'application/json' },
  });
}

interface ModelMetrics { accuracy: number; f1: number; samples: number }

async function retrainInternal(supabase: SupabaseClient, symbol: string, timeframe: string, accessToken?: string): Promise<{ ok: boolean; metrics: ModelMetrics; version: string }> {
  const token = accessToken ?? Deno.env.get('SERVICE_ACCESS_TOKEN') ?? '';
  const { candles } = await fetchCandles(symbol, timeframe, 1000, token);
  const { features, labels, valid } = computeFeatures(candles);
  if (!valid) throw new Error('Insufficient data for training');

  // Chronological split: first 70% train, next 15% val, last 15% test. No shuffling.
  const n = features.length;
  const trainEnd = Math.floor(n * TRAIN_FRACTION);
  const valEnd = Math.floor(n * 0.85);
  const trainX = features.slice(0, trainEnd);
  const trainY = labels.slice(0, trainEnd);
  const testX = features.slice(valEnd);
  const testY = labels.slice(valEnd);

  const model = trainLogistic(trainX, trainY, 200, 0.1);
  // Evaluate on test set.
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < testX.length; i++) {
    const p = predictProba(model, testX[i]);
    const pred = p > 0.5 ? 1 : 0;
    if (pred === 1 && testY[i] === 1) tp++;
    else if (pred === 1 && testY[i] === 0) fp++;
    else if (pred === 0 && testY[i] === 0) tn++;
    else fn++;
  }
  const accuracy = (tp + tn) / (testX.length || 1);
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  const f1 = 2 * (precision * recall) / (precision + recall || 1);
  const version = new Date().toISOString().slice(0, 10);

  const modelState: ModelState = {
    weights: model.weights,
    bias: model.bias,
    metrics: { accuracy: Number(accuracy.toFixed(3)), f1: Number(f1.toFixed(3)), samples: n },
    trainedAt: new Date().toISOString(),
    dataRange: { start: candles[0].time, end: candles[candles.length - 1].time },
    version,
    mean: model.mean,
    std: model.std,
    pair: symbol,
    timeframe,
  };
  modelStates.set(modelKey(symbol, timeframe), modelState);
  console.log(`[ml] retrained on ${symbol} ${timeframe}: acc=${accuracy.toFixed(3)} f1=${f1.toFixed(3)} samples=${n}`);
  return { ok: true, metrics: modelState.metrics, version };
}

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }
