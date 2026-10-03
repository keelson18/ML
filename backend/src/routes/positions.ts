import type { FastifyInstance } from 'fastify';
import { closeOpenPaperPosition, getAccount } from '../services/paperTradingService';

export async function positionRoutes(app: FastifyInstance) {
  app.get('/api/v1/paper/positions', { preHandler: app.requireAuth }, async (request, reply) => {
    const accountId = request.authenticatedUserId;
    if (!accountId) return reply.code(401).send({ error: 'Authentication required' });
    if (!request.accessToken) return reply.code(401).send({ error: 'Authentication required' });
    return getAccount(accountId, request.accessToken);
  });

  app.post<{ Body: { symbol: string } }>('/api/v1/paper/close', { preHandler: app.requireAuth }, async (request, reply) => {
    const accountId = request.authenticatedUserId;
    if (!accountId) return reply.code(401).send({ error: 'Authentication required' });
    const symbol = request.body?.symbol;
    if (typeof symbol !== 'string' || !/^[A-Z0-9]{2,20}$/.test(symbol)) {
      return reply.code(400).send({ error: 'A valid symbol is required.' });
    }
    try {
      if (!request.accessToken) return reply.code(401).send({ error: 'Authentication required' });
      return { trade: await closeOpenPaperPosition(accountId, symbol, request.accessToken) };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Could not close paper position.' });
    }
  });
}
