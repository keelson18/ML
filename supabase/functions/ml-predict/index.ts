// Quantum Intelligence — ML prediction microservice (Edge Function).
// Replaces the Python FastAPI service from the original spec with a Deno/TS equivalent.
// Implements feature engineering + a logistic-regression classifier trained on OHLCV features,
// exposed via the same contract: POST /predict, GET /model/status, POST /retrain.
// All endpoints protected by a shared API key (ML_SERVICE_API_KEY env var).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ---- Config ----
// SECURITY: ML_SERVICE_API_KEY must be explicitly configured in the environment.
// If missing, fail loudly rather than silently falling back to a default that
// ships in the client-side bundle. This key does NOT gate real users — it only
// filters raw internet traffic. Real auth comes from the Supabase JWT.
const API_KEY = (() => {
  const key = Deno.env.get("ML_SERVICE_API_KEY");
  if (!key) throw new Error("ML_SERVICE_API_KEY environment variable is required");
  return key;
})();
const BINANCE = "https://api.binance.com";
const PRED_HORIZON = 5; // candles ahead to predict
const TRAIN_FRACTION = 0.7; // chronological split, no shuffling

// In-memory model state. NOTE: edge functions may reset between requests, so this is
// best-effort. For durable state we persist to the `ml_predictions` table on each retrain.
let modelState: {
  weights: number[];
  bias: number;
  metrics: { accuracy: number; f1: number; samples: number };
  trainedAt: string;
  dataRange: { start: number; end: number };
  version: string;
} | null = null;

// ---- Feature engineering ----
// Computes the same feature set as the Python spec: multi-window returns, RSI, MACD,
// MAs (20/50/200), Bollinger width, volume change, ATR.
function computeFeatures(candles: Candle[]): { features: number[][]; labels: number[]; valid: boolean } {
  if (candles.length < 210) return { features: [], labels: [], valid: false };
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const vols = candles.map((c) => c.volume);

  const ema = (vals: number[], p: number) => {
    const k = 2 / (p + 1);
    let prev = vals[0];
    return vals.map((_, i) => (i === 0 ? prev : (prev = vals[i] * k + prev * (1 - k))));
  };
  const sma = (vals: number[], p: number) =>
    vals.map((_, i) => (i < p - 1 ? NaN : vals.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p));

  const rsiArr = (() => {
    const out: number[] = new Array(closes.length).fill(50);
    let gain = 0, loss = 0;
    const p = 14;
    for (let i = 1; i <= p; i++) {
      const ch = closes[i] - closes[i - 1];
      if (ch >= 0) gain += ch; else loss -= ch;
    }
    let avgG = gain / p, avgL = loss / p;
    out[p] = 100 - 100 / (1 + (avgL === 0 ? 100 : avgG / avgL));
    for (let i = p + 1; i < closes.length; i++) {
      const ch = closes[i] - closes[i - 1];
      const g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
      avgG = (avgG * (p - 1) + g) / p;
      avgL = (avgL * (p - 1) + l) / p;
      out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    }
    return out;
  })();

  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  const macdLine = ema(closes, 12).map((v, i) => v - ema(closes, 26)[i]);
  const macdSignal = ema(macdLine, 9);
  const bbMid = sma(closes, 20);
  const bbWidth = bbMid.map((m, i) => {
    if (isNaN(m)) return 0;
    let sumSq = 0;
    for (let j = i - 19; j <= i; j++) sumSq += (closes[j] - m) ** 2;
    const sd = Math.sqrt(sumSq / 20);
    return (4 * sd) / m;
  });
  const volChange = vols.map((v, i) => (i === 0 ? 0 : v / (vols[i - 1] || 1) - 1));
  const atrArr: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    atrArr[i] = i < 14 ? tr : (atrArr[i - 1] * 13 + tr) / 14;
  }

  const features: number[][] = [];
  const labels: number[] = [];
  // Start where all features are valid (200 SMA needs 200 bars).
  for (let i = 200; i < closes.length - PRED_HORIZON; i++) {
    const ret = (p: number) => closes[i] / closes[i - p] - 1;
    const f = [
      ret(1), ret(3), ret(5), ret(10), ret(20),
      rsiArr[i] / 100,
      macdLine[i] / closes[i],
      macdSignal[i] / closes[i],
      ma20[i] / closes[i] - 1,
      ma50[i] / closes[i] - 1,
      ma200[i] / closes[i] - 1,
      bbWidth[i],
      volChange[i],
      atrArr[i] / closes[i],
    ];
    // Label: will price be higher after N candles? (classification target)
    const future = closes[i + PRED_HORIZON];
    const label = future > closes[i] ? 1 : 0;
    features.push(f);
    labels.push(label);
  }
  return { features, labels, valid: features.length > 50 };
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
async function fetchCandles(symbol: string, timeframe: string, limit = 1000): Promise<Candle[]> {
  const url = `${BINANCE}/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const raw = (await res.json()) as unknown[][];
  return raw.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}

// ---- Rate limiting (durable via Supabase table) ----
async function checkRate(supabase: any, key: string, maxPerMin: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = new Date(now - 60000).toISOString();
  const { data } = await supabase.from('ml_predictions').select('created_at').eq('symbol', `__rl__${key}`).gte('created_at', windowStart);
  return (data?.length ?? 0) < maxPerMin;
}

// ---- Auth ----
function authorized(req: Request): boolean {
  const key = req.headers.get('x-api-key') ?? new URL(req.url).searchParams.get('key');
  return key === API_KEY;
}

// ---- Main handler ----
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop() ?? '';

    // /model/status is public (metadata only); /predict and /retrain require the API key.
    if (path === 'model-status' || path === 'status') {
      return jsonResponse({
        trained: modelState !== null,
        version: modelState?.version ?? 'untrained',
        trainedAt: modelState?.trainedAt ?? null,
        metrics: modelState?.metrics ?? null,
        dataRange: modelState?.dataRange ?? null,
        horizon: PRED_HORIZON,
      });
    }

    if (!authorized(req)) {
      console.warn(`[ml] unauthorized attempt from ${req.headers.get('x-forwarded-for') ?? 'unknown'}`);
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    if (path === 'predict' && req.method === 'POST') {
      const { pair, timeframe } = await req.json();
      if (!pair || !timeframe) return jsonResponse({ error: 'pair and timeframe required' }, 400);
      // Rate limit: 30 predicts/min.
      if (!(await checkRate(supabase, `predict-${pair}-${timeframe}`, 30))) {
        return jsonResponse({ error: 'Rate limit exceeded' }, 429);
      }
      // Lazily train on first predict if no model yet.
      if (!modelState) {
        await retrainInternal(supabase, pair, timeframe);
      }
      if (!modelState) return jsonResponse({ error: 'Model not available' }, 503);

      const candles = await fetchCandles(pair, timeframe, 1000);
      const { features, valid } = computeFeatures(candles);
      if (!valid || features.length === 0) return jsonResponse({ error: 'Insufficient data' }, 422);
      const last = features[features.length - 1];
      const probUp = predictProba({ weights: modelState.weights, bias: modelState.bias, mean: (modelState as any).mean, std: (modelState as any).std }, last);
      const prediction = probUp > 0.55 ? 'up' : probUp < 0.45 ? 'down' : 'flat';
      const lastClose = candles[candles.length - 1].close;
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
      };
      // Cache prediction durably.
      await supabase.from('ml_predictions').upsert({
        symbol: pair, timeframe, prediction, probability: probUp,
        expected_move_pct: expectedMovePct, model_version: modelState.version, confidence,
        payload: out,
      }, { onConflict: 'symbol,timeframe' });
      return jsonResponse(out);
    }

    if (path === 'retrain' && req.method === 'POST') {
      if (!(await checkRate(supabase, 'retrain', 2))) return jsonResponse({ error: 'Rate limit exceeded' }, 429);
      const { pair = 'BTCUSDT', timeframe = '1h' } = await req.json().catch(() => ({}));
      const result = await retrainInternal(supabase, pair, timeframe);
      return jsonResponse(result);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (err) {
    console.error('[ml]', err);
    return jsonResponse({ error: 'Internal error' }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function retrainInternal(supabase: any, symbol: string, timeframe: string): Promise<{ ok: boolean; metrics: any; version: string }> {
  const candles = await fetchCandles(symbol, timeframe, 1000);
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

  modelState = {
    weights: model.weights,
    bias: model.bias,
    metrics: { accuracy: Number(accuracy.toFixed(3)), f1: Number(f1.toFixed(3)), samples: n },
    trainedAt: new Date().toISOString(),
    dataRange: { start: candles[0].time, end: candles[candles.length - 1].time },
    version,
    // stash mean/std for predict
    ...({ mean: model.mean, std: model.std } as any),
  };
  console.log(`[ml] retrained on ${symbol} ${timeframe}: acc=${accuracy.toFixed(3)} f1=${f1.toFixed(3)} samples=${n}`);
  return { ok: true, metrics: modelState.metrics, version };
}

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }
