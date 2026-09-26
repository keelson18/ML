import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { fetchKlines } from '../../../src/lib/binance';
import type { Timeframe } from '../../../src/lib/types';

export async function marketRoutes(app: FastifyInstance) {
  app.get('/api/v1/market/candles/:symbol', async (request: FastifyRequest<{ Params: { symbol: string }; Querystring: { timeframe?: Timeframe; limit?: string } }>, reply: FastifyReply) => {
    const { symbol } = request.params;
    const timeframe = request.query.timeframe ?? '15m';
    try {
      return { symbol, timeframe, candles: await fetchKlines(symbol, timeframe, Number(request.query.limit ?? 500)) };
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : 'Market data unavailable.' });
    }
  });
}