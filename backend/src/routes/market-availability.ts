// Exposes authenticated availability reads and throttled admin-only probes.
import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { getMarketAvailability, probeAllMarkets } from '../services/marketAvailability';

export async function marketAvailabilityRoutes(app: FastifyInstance) {
  app.get('/api/v1/market/availability', { preHandler: app.requireAuth }, async () => ({ markets: getMarketAvailability() }));
  app.get('/api/v1/admin/markets/availability', { preHandler: app.requireAdmin }, async () => ({ markets: getMarketAvailability() }));
  app.post('/api/v1/admin/markets/probe', {
    preHandler: app.requireAdmin,
    config: { rateLimit: { max: config.marketProbeRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (_request, reply) => {
    if (!config.massiveApiKey) return reply.code(503).send({ error: 'Market provider is not configured.' });
    return { markets: await probeAllMarkets() };
  });
}
