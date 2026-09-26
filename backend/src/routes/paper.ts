import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { executeDecision } from '../services/paperTradingService';
import type { TradeDecision } from '../engines/decision-engine';

export async function paperRoutes(app: FastifyInstance) {
  app.post('/api/v1/paper/execute', async (request: FastifyRequest<{ Body: { accountId?: string; symbol: string; decision: TradeDecision; quantity?: number } }>, reply: FastifyReply) => {
    try {
      return await executeDecision(request.body);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Paper execution failed.' });
    }
  });
}