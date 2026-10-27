import type { FastifyInstance } from 'fastify';
import { getMarket } from '../../../src/lib/markets';
import { config } from '../config';
import { fetchMarketData, isTimeframe, MarketDataProviderError } from '../services/marketDataService';
import { getMarketAvailability, recordProviderTimeframeAvailability, recordProviderTimeframeError, recordProviderUnavailable } from '../services/marketAvailability';
import { canFetchHistoricalMarketData, getMarketCoverage, hasMarketCoverageOverride, marketCoverageAllowsFetch } from '../../../src/lib/market-coverage';
import { refreshMarketCoverageOverrides } from '../services/marketCoverage';
import { formatServerTiming } from '../utils/server-timing';
import { candleSeconds, selectClosedCandles } from '../trader/candle-math';
import { traderConfig } from '../trader/config';

export async function marketRoutes(app: FastifyInstance) {
  app.get<{ Params: { symbol: string }; Querystring: { timeframe?: string; limit?: string } }>('/api/v1/market/candles/:symbol', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    const started = performance.now();
    const { symbol } = request.params;
    const timeframe = request.query.timeframe ?? '15m';
    const limit = request.query.limit === undefined ? 500 : Number(request.query.limit);

    const market = getMarket(symbol);
    if (!market) return reply.code(400).send({ error: 'Unknown market symbol.' });
    if (!isTimeframe(timeframe)) return reply.code(400).send({ error: 'Invalid timeframe.' });
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      return reply.code(400).send({ error: 'Limit must be an integer between 1 and 1000.' });
    }
    await refreshMarketCoverageOverrides();
    const availability = getMarketAvailability().find((market) => market.symbol === symbol);
    const coverage = getMarketCoverage(market, availability);
    const explicitBlock = hasMarketCoverageOverride(symbol) && coverage.tier === 'blocked';
    if (!marketCoverageAllowsFetch(coverage.tier) && !canFetchHistoricalMarketData(market, explicitBlock)) {
      return reply.code(403).send({ error: 'Market coverage is blocked.', reason: coverage.reason, tier: coverage.tier });
    }
    if (availability?.status === 'unavailable') {
      return reply.code(404).send({ error: 'Market not available.' });
    }
    try {
      const providerStarted = performance.now();
      const series = await fetchMarketData(symbol, timeframe, limit);
      const providerMs = performance.now() - providerStarted;
      const closedCandles = selectClosedCandles(series.candles, timeframe, Date.now(), traderConfig.CLOSE_GRACE_MS);
      const latestClosedCandle = closedCandles.at(-1);
      const ageMs = latestClosedCandle
        ? Math.max(0, Date.now() - latestClosedCandle.time * 1000 - candleSeconds(timeframe, latestClosedCandle.time) * 1000)
        : null;
      recordProviderTimeframeAvailability(symbol, timeframe, series.candles.length, closedCandles.length, latestClosedCandle ? new Date(latestClosedCandle.time * 1000).toISOString() : null, ageMs, series.stale);
      const body = JSON.stringify({ symbol, timeframe, candles: series.candles, identity: series.identity, dataset: series.dataset, fetchedAt: series.fetchedAt, stale: series.stale });
      const totalMs = performance.now() - started;
      reply.header('Server-Timing', formatServerTiming([{ name: 'provider', durationMs: providerMs }, { name: 'total', durationMs: totalMs }]));
      request.log.info({ route: 'candles', symbol, timeframe, limit, candles: series.candles.length, providerMs: Math.round(providerMs), totalMs: Math.round(totalMs), bytes: Buffer.byteLength(body) }, 'market candles served');
      return reply.type('application/json').send(body);
    } catch (error) {
      if (error instanceof MarketDataProviderError && error.status === 429) {
        recordProviderTimeframeError(symbol, timeframe, 'rate-limited');
        if (error.retryAfter) reply.header('Retry-After', error.retryAfter);
        request.log.warn({ symbol, timeframe, provider: error.provider, status: error.status }, 'market data provider rate limited request');
        return reply.code(429).send({ error: 'Market data provider rate limit exceeded.' });
      }
      if (error instanceof MarketDataProviderError && error.status === 404) {
        recordProviderUnavailable(symbol, timeframe);
        return reply.code(404).send({ error: 'Market not available.' });
      }
      recordProviderTimeframeError(symbol, timeframe, error instanceof Error && /timeout|timed out/i.test(error.message) ? 'timeout' : 'provider-or-validation-error');
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
