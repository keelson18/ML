// Exposes authenticated availability reads and throttled admin-only probes.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { getMarketAvailability, isProbeableMarket, MarketProbeInProgressError, probeAllMarkets } from '../services/marketAvailability';
import { getMassiveBudgetSnapshot, getTwelveDataBudgetSnapshot } from '../services/marketDataService';
import { getMarket } from '../../../src/lib/markets';
import { getSupabaseClient, getSupabaseClientWithToken } from '../db';

const probeRequestSchema = z.object({ symbol: z.string().trim().min(1).max(30) }).strict();
const restrictionSchema = z.object({ symbol: z.string().trim().min(1).max(30), blocked: z.boolean(), reason: z.string().trim().min(1).max(500) }).strict();

export function hasConfiguredProbeProvider(symbols: readonly string[]): boolean {
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
  app.get('/api/v1/admin/markets/restrictions', { preHandler: app.requireAdmin, config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } } }, async (_request, reply) => {
    const { data, error } = await getSupabaseClient().from('market_access_restrictions').select('symbol, blocked, reason, updated_at').eq('blocked', true).order('symbol');
    if (error) return reply.code(503).send({ error: 'Market access restrictions are not available.' });
    return { restrictions: data ?? [] };
  });
  app.put('/api/v1/admin/markets/restrictions', { preHandler: app.requireAdmin, config: { rateLimit: { max: 10, timeWindow: config.rateLimitWindowMs } } }, async (request, reply) => {
    const parsed = restrictionSchema.safeParse(request.body);
    if (!parsed.success || !request.accessToken) return reply.code(400).send({ error: 'Choose an instrument and provide a restriction reason.' });
    const { error } = await getSupabaseClientWithToken(request.accessToken).rpc('admin_set_market_access_restriction', {
      p_symbol: parsed.data.symbol, p_blocked: parsed.data.blocked, p_reason: parsed.data.reason,
    });
    if (error) {
      if (error.code === '42501') return reply.code(403).send({ error: 'Market restriction changes require administrator access with MFA.' });
      if (error.code === '22023') return reply.code(400).send({ error: error.message });
      request.log.error({ error, symbol: parsed.data.symbol }, 'market restriction update failed');
      return reply.code(503).send({ error: 'Market access restriction could not be updated.' });
    }
    return { ok: true };
  });
  app.post('/api/v1/admin/markets/probe', {
    preHandler: app.requireAdmin,
    config: { rateLimit: { max: config.marketProbeRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    const parsed = probeRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Choose one configured crypto or commodity market to probe.' });
    if (!isProbeableMarket(parsed.data.symbol)) return reply.code(400).send({ error: 'The selected market has no supported crypto or commodity provider mapping.' });
    if (!hasConfiguredProbeProvider([parsed.data.symbol])) return reply.code(503).send({ error: 'No configured provider key is available for the selected market.' });
    try { return { markets: await probeAllMarkets([parsed.data.symbol]) }; }
    catch (error) {
      if (error instanceof MarketProbeInProgressError) return reply.code(409).send({ error: error.message });
      request.log.error({ symbol: parsed.data.symbol }, 'market availability probe failed unexpectedly');
      return reply.code(503).send({ error: 'Market availability probe could not be completed.' });
    }
  });
}
