import type { FastifyInstance } from 'fastify';
import { getMarket } from '../../../src/lib/markets';
import { config } from '../config';
import { fetchMarketData, isTimeframe, MarketDataProviderError } from '../services/marketDataService';
import { getMarketAvailability } from '../services/marketAvailability';
import { formatServerTiming } from '../utils/server-timing';

export async function marketRoutes(app: FastifyInstance) {
  app.get<{ Params: { symbol: string }; Querystring: { timeframe?: string; limit?: string } }>('/api/v1/market/candles/:symbol', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    const started = performance.now();
    const { symbol } = request.params;
    const timeframe = request.query.timeframe ?? '15m';
    const limit = request.query.limit === undefined ? 500 : Number(request.query.limit);

    if (!getMarket(symbol)) return reply.code(400).send({ error: 'Unknown market symbol.' });
    if (getMarketAvailability().find((market) => market.symbol === symbol)?.status === 'unavailable') {
      return reply.code(404).send({ error: 'Market not available.' });
    }
    if (!isTimeframe(timeframe)) return reply.code(400).send({ error: 'Invalid timeframe.' });
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      return reply.code(400).send({ error: 'Limit must be an integer between 1 and 1000.' });
    }

    try {
      const providerStarted = performance.now();
      const series = await fetchMarketData(symbol, timeframe, limit);
      const providerMs = performance.now() - providerStarted;
      const body = JSON.stringify({ symbol, timeframe, candles: series.candles, identity: series.identity, dataset: series.dataset, fetchedAt: series.fetchedAt, stale: series.stale });
      const totalMs = performance.now() - started;
      reply.header('Server-Timing', formatServerTiming([{ name: 'provider', durationMs: providerMs }, { name: 'total', durationMs: totalMs }]));
      request.log.info({ route: 'candles', symbol, timeframe, limit, candles: series.candles.length, providerMs: Math.round(providerMs), totalMs: Math.round(totalMs), bytes: Buffer.byteLength(body) }, 'market candles served');
      return reply.type('application/json').send(body);
    } catch (error) {
      if (error instanceof MarketDataProviderError && error.status === 429) {
        if (error.retryAfter) reply.header('Retry-After', error.retryAfter);
        request.log.warn({ symbol, timeframe, provider: error.provider, status: error.status }, 'market data provider rate limited request');
        return reply.code(429).send({ error: 'Market data provider rate limit exceeded.' });
      }
      const providerError = error instanceof MarketDataProviderError;
      request.log.error({
        reason: error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[upstream URL redacted]') : 'Unknown error.',
        symbol,
        timeframe,
        provider: providerError ? error.provider : undefined,
        status: providerError ? error.status : undefined,
      }, 'market data request failed');
      return reply.code(502).send({ error: 'Market data unavailable.' });
    }
  });
}
