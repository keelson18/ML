import { analyze, type AnalyzeInput } from '../services/decisionService';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AutonomousPipeline } from '../autonomy/pipeline';
import { getAccount } from '../services/paperTradingService';
import { fetchMarketData, MarketDataProviderError } from '../services/marketDataService';
import { getMarketAvailability } from '../services/marketAvailability';
import { getMarket } from '../../../src/lib/markets';
import { TIMEFRAMES, type Timeframe } from '../../../src/lib/types';
import { config } from '../config.js';
import { DEFAULT_SYMBOL } from '../constants/markets';
import { BoundedMap, WindowLimiter } from '../utils/limits';

const VALID_TIMEFRAMES = new Set<string>(TIMEFRAMES.map((t) => t.value));
const SYMBOL_PATTERN = /^[A-Z0-9._-]{1,20}$/;
const MIN_CANDLES = 60;
const MAX_CANDLES = 2000;
const ANALYSIS_CANDLES = 1000;
const MAX_CACHED_DECISIONS = 200;

interface DecisionRequest {
  symbol?: unknown;
  timeframe?: unknown;
  candles?: unknown;
}

function validateAnalyzeInput(input: Partial<AnalyzeInput> | undefined, requireCandles: boolean): string | null {
  if (!input || typeof input !== 'object') return 'Request body is required.';
  if (typeof input.symbol !== 'string' || !SYMBOL_PATTERN.test(input.symbol)) return 'Invalid symbol.';
  if (typeof input.timeframe !== 'string' || !VALID_TIMEFRAMES.has(input.timeframe)) return 'Invalid timeframe.';
  if (input.candles === undefined && !requireCandles) return null;
  if (!Array.isArray(input.candles) || input.candles.length < MIN_CANDLES || input.candles.length > MAX_CANDLES) {
    return `candles must be an array of ${MIN_CANDLES} to ${MAX_CANDLES} items.`;
  }
  const valid = input.candles.every((c) => c
    && Number.isFinite(c.time) && Number.isFinite(c.open) && Number.isFinite(c.high)
    && Number.isFinite(c.low) && Number.isFinite(c.close) && Number.isFinite(c.volume));
  return valid ? null : 'candles contain invalid values.';
}

function validateDecisionRequest(body: DecisionRequest | undefined): { symbol: string; timeframe: Timeframe } | string {
  if (!body || typeof body !== 'object') return 'Request body is required.';
  if (body.candles !== undefined) return 'Candles are not accepted; send symbol and timeframe only.';
  if (typeof body.symbol !== 'string' || !SYMBOL_PATTERN.test(body.symbol)) return 'Invalid symbol.';
  if (typeof body.timeframe !== 'string' || !VALID_TIMEFRAMES.has(body.timeframe)) return 'Invalid timeframe.';
  if (!getMarket(body.symbol)) return 'Unknown market symbol.';
  if (getMarketAvailability().find((market) => market.symbol === body.symbol)?.status === 'unavailable') {
    return 'Market not available.';
  }
  return { symbol: body.symbol, timeframe: body.timeframe as Timeframe };
}

export async function decisionRoutes(app: FastifyInstance, pipeline: AutonomousPipeline) {
  const missBudget = new WindowLimiter(config.analyzeRateLimitMax, config.rateLimitWindowMs);
  const decisionCache = new BoundedMap<unknown>(MAX_CACHED_DECISIONS);

  const handler = async (request: FastifyRequest<{ Body: DecisionRequest }>, reply: FastifyReply) => {
    if (!request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required' });
    if (!request.accessToken) return reply.code(401).send({ error: 'Authentication required' });
    const userId = request.authenticatedUserId;
    const parsed = validateDecisionRequest(request.body);
    if (typeof parsed === 'string') {
      request.log.warn({ userId, reason: parsed }, 'rejected invalid analyze input');
      return reply.code(400).send({ error: parsed });
    }
    const { symbol, timeframe } = parsed;

    let candles;
    try {
      candles = (await fetchMarketData(symbol, timeframe, ANALYSIS_CANDLES)).candles.slice(0, -1);
    } catch (error) {
      if (error instanceof MarketDataProviderError && error.status === 429) {
        if (error.retryAfter) reply.header('Retry-After', error.retryAfter);
        return reply.code(429).send({ error: 'Market data provider rate limit exceeded.' });
      }
      request.log.error({ userId, symbol, timeframe, err: error instanceof Error ? error.message : 'unknown' }, 'decision candle fetch failed');
      return reply.code(502).send({ error: 'Market data unavailable.' });
    }
    if (candles.length < MIN_CANDLES) return reply.code(400).send({ error: 'Not enough closed candles for analysis.' });

    const lastClosedTime = candles[candles.length - 1].time;
    const cacheKey = `${userId}:${symbol}:${timeframe}:${lastClosedTime}`;
    const cached = decisionCache.get(cacheKey);
    if (cached) return { ...(cached as object), cached: true };

    if (!missBudget.consume(userId)) {
      request.log.warn({ userId }, 'decision analysis quota exceeded');
      return reply.code(429).send({ error: 'Analysis is busy. Try again shortly.' });
    }
    try {
      const result = await analyze({ symbol, timeframe, candles }, userId, request.accessToken);
      const response = { ...result, cached: false };
      decisionCache.set(cacheKey, response);
      return response;
    } catch (error) {
      request.log.error({ err: error, userId }, 'decision analysis failed');
      return reply.code(500).send({ error: 'Analysis failed.' });
    }
  };
  const analyzeOptions = { onRequest: app.requireAuth };
  app.post<{ Body: DecisionRequest }>('/api/v1/decisions/analyze', analyzeOptions, handler);
  app.post<{ Body: DecisionRequest }>('/api/v1/analyze', analyzeOptions, handler);

  app.get('/api/v1/autonomy/status', { preHandler: app.requireAuth }, async () => pipeline.getSnapshot());
  app.get('/api/v1/autonomy/account', { preHandler: app.requireAdmin }, async () => getAccount('autonomy:default'));
  app.post('/api/v1/autonomy/start', { preHandler: app.requireAdmin }, async () => { pipeline.start(); return pipeline.getSnapshot(); });
  app.post('/api/v1/autonomy/pause', { preHandler: app.requireAdmin }, async () => { pipeline.pause(); return pipeline.getSnapshot(); });
  app.post('/api/v1/autonomy/run', { preHandler: app.requireAdmin }, async (request, reply) => {
    const body = (request.body ?? {}) as { symbol?: string; timeframe?: AnalyzeInput['timeframe']; candles?: AnalyzeInput['candles'] };
    const symbol = body.symbol ?? DEFAULT_SYMBOL;
    const invalid = validateAnalyzeInput({ ...body, symbol, timeframe: body.timeframe ?? '15m' }, false);
    if (invalid) return reply.code(400).send({ error: invalid });
    try {
      pipeline.start();
      return await pipeline.runOnce(symbol, body.timeframe, body.candles);
    } catch (error) {
      request.log.error({ err: error }, 'autonomy run failed');
      return reply.code(500).send({ error: 'Pipeline failed.' });
    }
  });
}
