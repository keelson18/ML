// Quantum Intelligence — ML prediction microservice (Edge Function).
// Replaces the Python FastAPI service from the original spec with a Deno/TS equivalent.
// Implements feature engineering + a logistic-regression classifier trained on OHLCV features,
// exposed via the same contract: POST /predict, GET /model/status, POST /retrain.
// Prediction requests require an authenticated Supabase user. Retraining is
// restricted to the server-side service key.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { readJsonSafe } from "../../../shared/http.ts";
import { resolveCorsOrigin } from "../../../shared/cors.ts";
import { computeMlFeatures, type MlCandle } from "../../../shared/ml-features.ts";
import { calibratedExpectedMove, calibrateExpectedReturns, classificationMetrics, modelHasNoEdge, momentumBaselineAccuracy, purgedChronologicalSplit, type ReturnCalibrationBucket } from "../../../shared/ml-baseline.ts";

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
const TRAINING_EPOCHS = 200;
const TRAINING_LEARNING_RATE = 0.1;

function labelAtrMultiple(): number {
  const configured = Deno.env.get("ML_LABEL_ATR_MULTIPLE");
  if (configured === undefined || configured.trim() === "") return DEFAULT_LABEL_ATR_MULTIPLE;
  const value = Number(configured);
  if (!Number.isFinite(value) || value < 0) throw new Error("ML_LABEL_ATR_MULTIPLE must be a finite non-negative number.");
  return value;
}
const FEATURE_SCHEMA_VERSION = 'ohlcv-14-v2';

// In-memory model state. NOTE: edge functions may reset between requests, so this is
// best-effort. For durable state we persist to the `ml_predictions` table on each retrain.
interface ModelState {
  weights: number[];
  bias: number;
  metrics: ModelMetrics;
  trainedAt: string;
  dataRange: { start: number; end: number };
  version: string;
  mean: number[];
  std: number[];
  pair: string;
  timeframe: string;
  returnCalibration: ReturnCalibrationBucket[];
}
const modelStates = new Map<string, ModelState>();
const trainingFlights = new Map<string, Promise<{ ok: boolean; metrics: ModelMetrics; version: string }>>();
const modelKey = (pair: string, timeframe: string) => `${pair}:${timeframe}`;

async function ensureModel(supabase: SupabaseClient, pair: string, timeframe: string, accessToken: string): Promise<ModelState> {
  const key = modelKey(pair, timeframe);
  const existing = modelStates.get(key);
  if (existing) return existing;
  const persisted = await loadPersistedModel(supabase, pair, timeframe);
  if (persisted) {
    modelStates.set(key, persisted);
    return persisted;
  }
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
function computeFeatures(candles: Candle[]): { features: number[][]; labels: Array<number | null>; sampleIndices: number[]; forwardReturns: number[]; valid: boolean } {
  return computeMlFeatures(candles as MlCandle[], { predictionHorizon: PRED_HORIZON, minimumMoveAtr: labelAtrMultiple() });
}

interface ModelMetrics {
  accuracy: number;
  f1: number;
  samples: number;
  trainAccuracy: number;
  trainF1: number;
  trainSamples: number;
  momentumBaselineAccuracy: number;
  noEdge: boolean;
}

interface StoredModelArtifact {
  symbol: string;
  timeframe: string;
  version: string;
  prediction_horizon: unknown;
  weights: unknown;
  bias: unknown;
  feature_mean: unknown;
  feature_std: unknown;
  training_metrics: unknown;
  test_metrics: unknown;
  momentum_baseline_accuracy: unknown;
  no_edge: unknown;
  return_calibration: unknown;
  data_start: unknown;
  data_end: unknown;
  trained_at: unknown;
  algorithm: unknown;
  feature_schema_version: unknown;
}

function numberArray(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item)) ? value : undefined;
}

function storedMetrics(value: unknown): { accuracy: number; f1: number; samples: number } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const metrics = value as Record<string, unknown>;
  if (typeof metrics.accuracy !== 'number' || !Number.isFinite(metrics.accuracy)
    || typeof metrics.f1 !== 'number' || !Number.isFinite(metrics.f1)
    || metrics.accuracy < 0 || metrics.accuracy > 1 || metrics.f1 < 0 || metrics.f1 > 1
    || typeof metrics.samples !== 'number' || !Number.isInteger(metrics.samples) || metrics.samples <= 0) return undefined;
  return { accuracy: metrics.accuracy, f1: metrics.f1, samples: metrics.samples };
}

function storedCalibration(value: unknown): ReturnCalibrationBucket[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const valid = value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const bucket = item as Record<string, unknown>;
    return typeof bucket.lowerProbability === 'number' && bucket.lowerProbability >= 0 && bucket.lowerProbability <= 1
      && typeof bucket.upperProbability === 'number' && bucket.upperProbability >= bucket.lowerProbability && bucket.upperProbability <= 1
      && typeof bucket.samples === 'number' && Number.isInteger(bucket.samples) && bucket.samples >= 0
      && (bucket.expectedReturnPct === null || (typeof bucket.expectedReturnPct === 'number' && Number.isFinite(bucket.expectedReturnPct)));
  });
  return valid ? value as ReturnCalibrationBucket[] : undefined;
}

async function loadPersistedModel(supabase: SupabaseClient, pair: string, timeframe: string): Promise<ModelState | undefined> {
  const { data, error } = await supabase.from('ml_model_artifacts').select('*')
    .eq('symbol', pair).eq('timeframe', timeframe).order('trained_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Could not load persisted ML model: ${error.message}`);
  if (!data) return undefined;
  const row = data as unknown as StoredModelArtifact;
  const weights = numberArray(row.weights);
  const mean = numberArray(row.feature_mean);
  const std = numberArray(row.feature_std);
  const train = storedMetrics(row.training_metrics);
  const test = storedMetrics(row.test_metrics);
  const calibration = storedCalibration(row.return_calibration);
  const baseline = Number(row.momentum_baseline_accuracy);
  const dataStart = Number(row.data_start);
  const dataEnd = Number(row.data_end);
  if (row.algorithm !== 'logistic-regression' || row.feature_schema_version !== FEATURE_SCHEMA_VERSION
    || Number(row.prediction_horizon) !== PRED_HORIZON || typeof row.version !== 'string'
    || !weights || !mean || !std || weights.length !== 14 || weights.length !== mean.length || mean.length !== std.length
    || std.some((value) => value <= 0) || typeof row.bias !== 'number' || !Number.isFinite(row.bias)
    || !train || !test || !Number.isFinite(baseline) || baseline < 0 || baseline > 1
    || typeof row.no_edge !== 'boolean' || !calibration
    || !Number.isFinite(dataStart) || !Number.isFinite(dataEnd) || dataEnd < dataStart
    || typeof row.trained_at !== 'string') throw new Error('Persisted ML model artifact failed schema validation.');
  const metrics: ModelMetrics = {
    accuracy: test.accuracy, f1: test.f1, samples: test.samples,
    trainAccuracy: train.accuracy, trainF1: train.f1, trainSamples: train.samples,
    momentumBaselineAccuracy: baseline, noEdge: row.no_edge,
  };
  return {
    weights, mean, std, bias: row.bias, metrics, returnCalibration: calibration,
    trainedAt: row.trained_at, dataRange: { start: dataStart, end: dataEnd },
    version: row.version, pair, timeframe,
  };
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
async function fetchCandles(symbol: string, timeframe: string, limit: number, accessToken: string): Promise<{ candles: Candle[]; provider: string; quoteCurrency: string; sourceInstrument: string; datasetId: string }> {
  if (!BACKEND_URL) throw new Error('Market data service is not configured.');
  const url = `${BACKEND_URL}/api/v1/market/candles/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const { payload } = await readJsonSafe<{ candles: Candle[]; dataset: { id: string; provider: string; quoteCurrency: string; sourceInstrument: string } }>(res);
  if (!res.ok) throw new Error(`Market data service ${res.status}`);
  if (payload === null) throw new Error('Market data service returned an empty or invalid response.');
  return {
    candles: payload.candles,
    provider: payload.dataset.provider,
    quoteCurrency: payload.dataset.quoteCurrency,
    sourceInstrument: payload.dataset.sourceInstrument,
    datasetId: payload.dataset.id,
  };
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
  const configuredOrigins = Deno.env.get('CORS_ORIGIN') ?? '';
  const allowLoopbackPorts = Deno.env.get('ML_FUNCTION_ENV') === 'development';
  const origin = resolveCorsOrigin(req.headers.get('origin'), configuredOrigins, allowLoopbackPorts);
  const headers = corsHeaders(origin);

  if (!configuredOrigins.split(',').some((value) => value.trim()) && !origin) {
    return jsonResponse({ error: 'Service misconfigured' }, 500, headers);
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: origin ? 204 : 403, headers });
  if (req.headers.has('origin') && !origin) return jsonResponse({ error: 'Origin not allowed' }, 403, headers);

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop() ?? '';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // /model/status is public (metadata only); artifact weights remain service-role only.
    if (path === 'model-status' || path === 'status') {
      const pair = url.searchParams.get('pair');
      const timeframe = url.searchParams.get('timeframe');
      const modelState = pair && timeframe
        ? modelStates.get(modelKey(pair, timeframe))
        : Array.from(modelStates.values()).at(-1);
      let artifact: Record<string, unknown> | null = null;
      if (!modelState) {
        let query = supabase.from('ml_model_artifacts')
          .select('symbol,timeframe,version,trained_at,data_start,data_end,training_metrics,test_metrics,momentum_baseline_accuracy,no_edge')
          .order('trained_at', { ascending: false }).limit(1);
        if (pair && timeframe) query = query.eq('symbol', pair).eq('timeframe', timeframe);
        const { data, error } = await query.maybeSingle();
        if (error) return jsonResponse({ error: 'Model status is temporarily unavailable.' }, 503, headers);
        artifact = data as Record<string, unknown> | null;
      }
      const modelMetrics = modelState?.metrics ?? (artifact ? {
        accuracy: artifact.test_metrics && (artifact.test_metrics as Record<string, unknown>).accuracy,
        f1: artifact.test_metrics && (artifact.test_metrics as Record<string, unknown>).f1,
        samples: artifact.test_metrics && (artifact.test_metrics as Record<string, unknown>).samples,
        trainAccuracy: artifact.training_metrics && (artifact.training_metrics as Record<string, unknown>).accuracy,
        trainF1: artifact.training_metrics && (artifact.training_metrics as Record<string, unknown>).f1,
        trainSamples: artifact.training_metrics && (artifact.training_metrics as Record<string, unknown>).samples,
        momentumBaselineAccuracy: Number(artifact.momentum_baseline_accuracy),
        noEdge: artifact.no_edge,
      } : null);
      const noEdge = modelState?.metrics.noEdge ?? artifact?.no_edge;
      return jsonResponse({
        trained: Boolean(modelState || artifact),
        version: modelState?.version ?? artifact?.version ?? 'untrained',
        trainedAt: modelState?.trainedAt ?? artifact?.trained_at ?? null,
        metrics: modelMetrics,
        edgeStatus: noEdge === undefined ? 'untrained' : (noEdge ? 'no-edge' : 'beats-momentum-baseline'),
        dataRange: modelState?.dataRange ?? (artifact ? { start: artifact.data_start, end: artifact.data_end } : null),
        pair: modelState?.pair ?? artifact?.symbol ?? pair ?? null,
        timeframe: modelState?.timeframe ?? artifact?.timeframe ?? timeframe ?? null,
        availableModels: [...modelStates.values()].map(({ pair: modelPair, timeframe: modelTimeframe, version }) => ({ pair: modelPair, timeframe: modelTimeframe, version })),
        horizon: PRED_HORIZON,
      }, 200, headers);
    }

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
      const calibratedMove = calibratedExpectedMove(probUp, modelState.returnCalibration);
      const expectedMovePct = calibratedMove === null ? null : Number(calibratedMove.toFixed(2));
      const confidence = probUp > 0.7 || probUp < 0.3 ? 'high' : probUp > 0.6 || probUp < 0.4 ? 'medium' : 'low';

      const out = {
        pair,
        timeframe,
        prediction,
        probability: Number(probUp.toFixed(3)),
        expected_move_pct: expectedMovePct,
        expected_move_calibrated: expectedMovePct !== null,
        model_version: modelState.version,
        edge_status: modelState.metrics.noEdge ? 'no-edge' : 'beats-momentum-baseline',
        momentum_baseline_accuracy: modelState.metrics.momentumBaselineAccuracy,
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

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

interface ModelMetrics {
  accuracy: number;
  f1: number;
  samples: number;
  trainAccuracy: number;
  trainF1: number;
  trainSamples: number;
  momentumBaselineAccuracy: number;
  noEdge: boolean;
}

async function retrainInternal(supabase: SupabaseClient, symbol: string, timeframe: string, accessToken?: string): Promise<{ ok: boolean; metrics: ModelMetrics; version: string }> {
  const token = accessToken ?? Deno.env.get('SERVICE_ACCESS_TOKEN') ?? '';
  const { candles, provider, quoteCurrency, sourceInstrument, datasetId } = await fetchCandles(symbol, timeframe, 1000, token);
  const { features, labels, sampleIndices, forwardReturns, valid } = computeFeatures(candles);
  if (!valid) throw new Error('Insufficient data for training');

  // Split by candle time and purge forward-label windows across every boundary.
  const split = purgedChronologicalSplit(sampleIndices, candles.length, PRED_HORIZON);
  const labeled = (indices: number[]) => indices.filter((row) => labels[row] !== null);
  const featuresFor = (indices: number[]) => indices.map((row) => features[row]!);
  const labelsFor = (indices: number[]) => indices.map((row) => labels[row]!);
  const trainingRows = labeled(split.train);
  const validationRows = split.validation;
  const testRows = labeled(split.test);
  const training = { x: featuresFor(trainingRows), y: labelsFor(trainingRows) };
  const validation = { x: featuresFor(validationRows), returns: validationRows.map((row) => forwardReturns[row]!) };
  const test = { x: featuresFor(testRows), y: labelsFor(testRows) };
  if (training.y.length < 50 || validation.y.length < 10 || test.y.length < 10) {
    throw new Error('Insufficient purged chronological train, validation, or test samples.');
  }

  const model = trainLogistic(training.x, training.y, TRAINING_EPOCHS, TRAINING_LEARNING_RATE);
  const trainMetrics = classificationMetrics(training.x.map((features) => predictProba(model, features) > 0.5 ? 1 : 0), training.y);
  const validationProbabilities = validation.x.map((features) => predictProba(model, features));
  const returnCalibration = calibrateExpectedReturns(validationProbabilities, validation.returns, 5);
  // The test period is untouched by training and calibration.
  const testPredictions = test.x.map((features) => predictProba(model, features) > 0.5 ? 1 : 0);
  const testMetrics = classificationMetrics(testPredictions, test.y);
  const baselineAccuracy = momentumBaselineAccuracy(test.x.map((features) => features[0]!), test.y);
  const noEdge = modelHasNoEdge(testMetrics.accuracy, baselineAccuracy);
  const trainedAt = new Date().toISOString();
  const version = `${trainedAt.replace(/[-:.TZ]/g, '')}-${crypto.randomUUID()}`;
  const persistedTestMetrics = {
    accuracy: Number(testMetrics.accuracy.toFixed(3)),
    f1: Number(testMetrics.f1.toFixed(3)),
    samples: testMetrics.samples,
    validationSamples: validation.x.length,
    testStartIndex: split.testBoundary,
    predictionHorizon: PRED_HORIZON,
  };

  const modelState: ModelState = {
    weights: model.weights,
    bias: model.bias,
    metrics: {
      accuracy: Number(testMetrics.accuracy.toFixed(3)),
      f1: Number(testMetrics.f1.toFixed(3)),
      samples: testMetrics.samples,
      trainAccuracy: Number(trainMetrics.accuracy.toFixed(3)),
      trainF1: Number(trainMetrics.f1.toFixed(3)),
      trainSamples: trainMetrics.samples,
      momentumBaselineAccuracy: Number(baselineAccuracy.toFixed(3)),
      noEdge,
    },
    trainedAt,
    dataRange: { start: candles[0].time, end: candles[candles.length - 1].time },
    version,
    mean: model.mean,
    std: model.std,
    pair: symbol,
    timeframe,
    returnCalibration,
  };
  const { error: persistError } = await supabase.from('ml_model_artifacts').insert({
    symbol,
    timeframe,
    version,
    algorithm: 'logistic-regression',
    feature_schema_version: FEATURE_SCHEMA_VERSION,
    prediction_horizon: PRED_HORIZON,
    minimum_move_atr: labelAtrMultiple(),
    training_parameters: { epochs: TRAINING_EPOCHS, learningRate: TRAINING_LEARNING_RATE, trainFraction: 0.7, validationFraction: 0.15, testFraction: 0.15 },
    dataset_id: datasetId,
    provider,
    source_instrument: sourceInstrument,
    quote_currency: quoteCurrency,
    weights: model.weights,
    bias: model.bias,
    feature_mean: model.mean,
    feature_std: model.std,
    training_metrics: {
      accuracy: Number(trainMetrics.accuracy.toFixed(3)),
      f1: Number(trainMetrics.f1.toFixed(3)),
      samples: trainMetrics.samples,
    },
    test_metrics: persistedTestMetrics,
    momentum_baseline_accuracy: Number(baselineAccuracy.toFixed(3)),
    no_edge: noEdge,
    return_calibration: returnCalibration,
    data_start: candles[0]!.time,
    data_end: candles.at(-1)!.time,
    trained_at: trainedAt,
  });
  if (persistError) throw new Error(`Could not persist trained ML model artifact: ${persistError.message}`);
  modelStates.set(modelKey(symbol, timeframe), modelState);
  console.log(`[ml] retrained on ${symbol} ${timeframe}: test_acc=${testMetrics.accuracy.toFixed(3)} momentum_acc=${baselineAccuracy.toFixed(3)} no_edge=${noEdge} test_samples=${testMetrics.samples}`);
  return { ok: true, metrics: modelState.metrics, version };
}

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }
