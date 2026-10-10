import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { buildCoachRecords } from '../coach/context';
import { getAccount } from '../services/paperTradingService';

export async function coachContextRoutes(app: FastifyInstance) {
  app.get('/api/v1/coach/context', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    if (!request.accessToken || !request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required.' });
    try {
      const account = await getAccount(request.authenticatedUserId, request.accessToken);
      return { generatedAt: new Date().toISOString(), ...buildCoachRecords(account, account.tradePlans ?? []) };
    } catch (error) {
      request.log.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'Coach context failed');
      return reply.code(503).send({ error: 'Coach records are temporarily unavailable.' });
    }
  });
}
