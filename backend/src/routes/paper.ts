import type { FastifyInstance } from 'fastify';
import { getMarket } from '../../../src/lib/markets';
import { analyze } from '../services/decisionService';
import { executeDecision } from '../services/paperTradingService';
import { fetchMarketData, isTimeframe } from '../services/marketDataService';

export async function paperRoutes(app: FastifyInstance) {
  app.post<{ Body: { symbol?: unknown; timeframe?: unknown } }>('/api/v1/paper/execute', { preHandler: app.requireAuth }, async (request, reply) => {
    const accountId = request.authenticatedUserId;
    const accessToken = request.accessToken;
    if (!accountId || !accessToken) return reply.code(401).send({ error: 'Authentication required.' });

    const { symbol, timeframe } = request.body ?? {};
    if (typeof symbol !== 'string' || !getMarket(symbol)) return reply.code(400).send({ error: 'Unknown market symbol.' });
    if (!isTimeframe(timeframe)) return reply.code(400).send({ error: 'Invalid timeframe.' });

    try {
      const series = await fetchMarketData(symbol, timeframe, 501);
      const candles = series.candles.slice(0, -1);
      if (candles.length < 60) return reply.code(422).send({ error: 'Not enough closed candles to evaluate a paper trade.' });
      const { decision } = await analyze({ symbol, timeframe, candles }, accountId, accessToken);
      if (decision.result.decision !== 'BUY' && decision.result.decision !== 'SELL') {
        return { accepted: false, status: 'rejected', reason: decision.result.explanation };
      }
      return await executeDecision({ symbol, decision: decision.result, accountId, accessToken });
    } catch (error) {
      const reason = error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[upstream URL redacted]') : 'Unknown error.';
      request.log.error({ reason, userId: accountId, symbol, timeframe }, 'paper execution failed');
      return reply.code(502).send({ error: 'Paper execution could not be completed.' });
    }
  });
}
