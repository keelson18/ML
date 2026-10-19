import type { FastifyInstance, FastifyRequest } from 'fastify';
import { readJsonSafe } from '../../../shared/http';
import { TIMEFRAMES, type MLPrediction } from '../../../src/lib/types';
import { config } from '../config.js';

interface PredictionRequest {
  pair?: unknown;
  timeframe?: unknown;
}

const validTimeframes = new Set<string>(TIMEFRAMES.map(({ value }) => value));

export async function mlRoutes(app: FastifyInstance) {
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
