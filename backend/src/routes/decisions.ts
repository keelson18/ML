import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { analyze, type AnalyzeInput } from '../services/decisionService';
import { AutonomousPipeline } from '../autonomy/pipeline';
import { getAccount } from '../services/paperTradingService';
import { TIMEFRAMES } from '../../../src/lib/types';

const VALID_TIMEFRAMES = new Set<string>(TIMEFRAMES.map((t) => t.value));
const SYMBOL_PATTERN = /^[A-Z0-9._-]{1,20}$/;
const MIN_CANDLES = 60;
const MAX_CANDLES = 2000;

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

export async function decisionRoutes(app: FastifyInstance, pipeline: AutonomousPipeline) {
  const handler = async (request: FastifyRequest<{ Body: AnalyzeInput }>, reply: FastifyReply) => {
    if (!request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required' });
    if (!request.accessToken) return reply.code(401).send({ error: 'Authentication required' });
    const invalid = validateAnalyzeInput(request.body, true);
    if (invalid) {
      request.log.warn({ userId: request.authenticatedUserId, reason: invalid }, 'rejected invalid analyze input');
      return reply.code(400).send({ error: invalid });
    }
    try {
      return await analyze(request.body, request.authenticatedUserId, request.accessToken);
    } catch (error) {
      request.log.error({ err: error, userId: request.authenticatedUserId }, 'decision analysis failed');
      return reply.code(500).send({ error: 'Analysis failed.' });
    }
  };
  app.post<{ Body: AnalyzeInput }>('/api/v1/decisions/analyze', { preHandler: app.requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, handler);
  app.post<{ Body: AnalyzeInput }>('/api/v1/analyze', { preHandler: app.requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, handler);

  app.get('/api/v1/autonomy/status', { preHandler: app.requireAuth }, async () => pipeline.getSnapshot());
  app.get('/api/v1/autonomy/account', { preHandler: app.requireAdmin }, async () => getAccount('autonomy:default'));
  app.post('/api/v1/autonomy/start', { preHandler: app.requireAdmin }, async () => { pipeline.start(); return pipeline.getSnapshot(); });
  app.post('/api/v1/autonomy/pause', { preHandler: app.requireAdmin }, async () => { pipeline.pause(); return pipeline.getSnapshot(); });
  app.post('/api/v1/autonomy/run', { preHandler: app.requireAdmin }, async (request, reply) => {
    const body = (request.body ?? {}) as { symbol?: string; timeframe?: AnalyzeInput['timeframe']; candles?: AnalyzeInput['candles'] };
    const symbol = body.symbol ?? 'BTCUSD';
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
