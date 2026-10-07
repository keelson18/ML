import type { FastifyInstance } from 'fastify';
import { getMarket } from '../../../src/lib/markets';
import { isTimeframe } from '../services/marketDataService';

export async function paperRoutes(app: FastifyInstance) {
  app.post<{ Body: { symbol?: unknown; timeframe?: unknown } }>('/api/v1/paper/execute', { preHandler: app.requireAuth }, async (request, reply) => {
    const accountId = request.authenticatedUserId;
    const accessToken = request.accessToken;
    if (!accountId || !accessToken) return reply.code(401).send({ error: 'Authentication required.' });

    const { symbol, timeframe } = request.body ?? {};
    if (typeof symbol !== 'string' || !getMarket(symbol)) return reply.code(400).send({ error: 'Unknown market symbol.' });
    if (!isTimeframe(timeframe)) return reply.code(400).send({ error: 'Invalid timeframe.' });

    return reply.code(409).send({ error: 'Immediate paper execution is disabled. Create a plan and wait for a confirmed trigger.' });
  });
}
