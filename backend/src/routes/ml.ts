import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { getMarket } from '../../../src/lib/markets';
import { isMarketAccessBlocked } from '../services/marketRestrictions';
import { fetchMarketData, isTimeframe, MarketDataProviderError } from '../services/marketDataService';
import { readJsonSafe } from '../../../shared/http';
import { TIMEFRAMES, type MLPrediction } from '../../../src/lib/types';
import { config } from '../config.js';

interface PredictionRequest {
  pair?: unknown;
  timeframe?: unknown;
}

const validTimeframes = new Set<string>(TIMEFRAMES.map(({ value }) => value));

export async function mlRoutes(app: FastifyInstance) {
  app.get<{ Params: { symbol: string }; Querystring: { timeframe?: string; limit?: string } }>('/api/v1/internal/ml/candles/:symbol', {
    config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    const suppliedKey = request.headers['x-ml-service-key'];
    const expectedValue = config.mlServiceApiKey.trim();
    const expected = Buffer.from(expectedValue);
    const supplied = Buffer.from(typeof suppliedKey === 'string' ? suppliedKey : '');
    if (expectedValue.length < 32 || !supplied.length || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return reply.code(expectedValue.length >= 32 ? 401 : 503).send({ error: 'ML service authentication failed.' });
    }
    const symbol = request.params.symbol;
    const timeframe = request.query.timeframe ?? '1h';
    const limit = request.query.limit === undefined ? 1000 : Number(request.query.limit);
    if (!getMarket(symbol) || !/^[A-Z0-9]{2,20}$/.test(symbol) || !isTimeframe(timeframe)
      || !Number.isInteger(limit) || limit < 210 || limit > 1000) {
      return reply.code(400).send({ error: 'A valid supported symbol, timeframe, and limit are required.' });
    }
    if (await isMarketAccessBlocked(symbol)) return reply.code(403).send({ error: 'Market access is disabled by an administrator.' });
    try {
      const series = await fetchMarketData(symbol, timeframe, limit, { priority: true });
      return {
        candles: series.candles,
        dataset: {
          id: series.dataset.id,
          provider: series.dataset.provider,
          quoteCurrency: series.dataset.quoteCurrency,
          sourceInstrument: series.dataset.sourceInstrument,
        },
      };
    } catch (error) {
      if (error instanceof MarketDataProviderError && error.status === 429) {
        if (error.retryAfter) reply.header('Retry-After', error.retryAfter);
        return reply.code(429).send({ error: 'Market data provider rate limit exceeded.' });
      }
      request.log.error({ symbol, timeframe, reason: error instanceof Error ? error.message : 'unknown' }, 'internal ML market-data request failed');
      return reply.code(502).send({ error: 'Market data unavailable.' });
    }
  });

  app.post<{ Body: PredictionRequest }>('/api/v1/ml/predict', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (request: FastifyRequest<{ Body: PredictionRequest }>, reply) => {
    if (!request.accessToken) return reply.code(401).send({ error: 'Authentication required.' });
    const { pair, timeframe } = request.body ?? {};
    if (typeof pair !== 'string' || !/^[A-Z0-9]{2,20}$/.test(pair)
      || typeof timeframe !== 'string' || !validTimeframes.has(timeframe)) {
      return reply.code(400).send({ error: 'A valid pair and timeframe are required.' });
    }
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      return reply.code(503).send({ error: 'ML prediction service is not configured.' });
    }

    try {
      const response = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/ml-predict/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${request.accessToken}`,
          apikey: config.supabaseAnonKey,
        },
        body: JSON.stringify({ pair, timeframe }),
      });
      const { payload } = await readJsonSafe<MLPrediction & { error?: string }>(response);
      if (!response.ok) return reply.code(response.status).send({ error: payload?.error ?? `ML prediction failed (${response.status}).` });
      if (payload === null) return reply.code(502).send({ error: 'ML prediction service returned an invalid response.' });
      return payload;
    } catch (error) {
      request.log.error({ err: error, pair, timeframe }, 'ML prediction request failed');
      return reply.code(502).send({ error: 'ML prediction service is unreachable.' });
    }
  });
}
