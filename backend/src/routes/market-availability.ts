// Exposes authenticated availability reads and throttled admin-only probes.
import type { FastifyInstance } from 'fastify';
import { autonomySymbols, config } from '../config';
import { getMarketAvailability, probeAllMarkets } from '../services/marketAvailability';
import { getMassiveBudgetSnapshot, getTwelveDataBudgetSnapshot } from '../services/marketDataService';
import { getMarket } from '../../../src/lib/markets';

export function hasConfiguredProbeProvider(symbols: readonly string[] = autonomySymbols): boolean {
  return symbols.some((symbol) => {
    const market = getMarket(symbol);
    if (market?.provider === 'massive') return Boolean(config.massiveApiKey);
    if (market?.provider === 'twelvedata') return Boolean(config.twelveDataApiKey);
    return false;
  });
}

export async function marketAvailabilityRoutes(app: FastifyInstance) {
  app.get('/api/v1/market/availability', { preHandler: app.requireAuth }, async () => ({ markets: getMarketAvailability() }));
  app.get('/api/v1/admin/markets/availability', { preHandler: app.requireAdmin }, async () => ({ markets: getMarketAvailability() }));
  app.get('/api/v1/admin/markets/budget', { preHandler: app.requireAdmin }, async () => ({ massive: getMassiveBudgetSnapshot(), twelveData: getTwelveDataBudgetSnapshot() }));
  app.post('/api/v1/admin/markets/probe', {
    preHandler: app.requireAdmin,
    config: { rateLimit: { max: config.marketProbeRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (_request, reply) => {
    if (!hasConfiguredProbeProvider()) return reply.code(503).send({ error: 'No configured market provider key is available for the autonomy symbols.' });
    return { markets: await probeAllMarkets() };
  });
}
