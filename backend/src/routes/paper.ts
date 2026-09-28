import type { FastifyInstance, FastifyReply } from 'fastify';
import { executeDecision } from '../services/paperTradingService';
import type { TradeDecision } from '../engines/decision-engine';

export async function paperRoutes(app: FastifyInstance) {
  app.post<{ Body: { accountId?: string; symbol: string; decision: TradeDecision; quantity?: number } }>('/api/v1/paper/execute', { preHandler: app.requireAuth }, async (request, reply: FastifyReply) => {
    try {
      const accountId = request.authenticatedUserId;
      if (!accountId) return reply.code(401).send({ error: 'Authentication required' });
      return await executeDecision({ ...request.body, accountId });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Paper execution failed.' });
    }
  });
}
