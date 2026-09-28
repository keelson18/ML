import type { FastifyInstance } from 'fastify';
import { getAccount } from '../services/paperTradingService';

export async function positionRoutes(app: FastifyInstance) {
  app.get('/api/v1/paper/positions', { preHandler: app.requireAuth }, async (request, reply) => {
    const accountId = request.authenticatedUserId;
    if (!accountId) return reply.code(401).send({ error: 'Authentication required' });
    return getAccount(accountId);
  });
}
