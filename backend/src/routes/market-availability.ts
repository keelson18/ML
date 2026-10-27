// Exposes authenticated availability reads and throttled admin-only probes.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { getMarketAvailability, getTierBLastScannedAt, isProbeableMarket, MarketProbeInProgressError, probeAllMarkets } from '../services/marketAvailability';
import { getMassiveBudgetSnapshot, getTwelveDataBudgetSnapshot } from '../services/marketDataService';
import { getMarket, MARKET_UNIVERSE } from '../../../src/lib/markets';
import { getMarketCoverage, setMarketCoverageOverrides, type MarketCoverageOverride } from '../../../src/lib/market-coverage';
import { getSupabaseClient, getSupabaseClientWithToken } from '../db';
import { refreshMarketCoverageOverrides } from '../services/marketCoverage';

const coverageUpdateSchema = z.object({
  symbol: z.string().trim().min(1).max(30),
  tier: z.enum(['A', 'B', 'C', 'blocked']),
  reason: z.string().trim().min(1).max(500),
  providerMappingVerified: z.boolean(),
  providerAvailable: z.boolean(),
  sessionCalendarVerified: z.boolean(),
}).strict();
const probeRequestSchema = z.object({ symbol: z.string().trim().min(1).max(30) }).strict();

async function readCoverageRows() {
  const { data, error } = await getSupabaseClient().from('market_coverage_overrides').select('symbol,tier,reason,provider_mapping_verified,session_calendar_verified,updated_at');
  if (error) throw new Error('Market coverage is unavailable.');
  const rows = data ?? [];
  const overrides = new Map(rows.map((row) => [row.symbol, row]));
  const activeOverrides: MarketCoverageOverride[] = rows.map((row) => ({ symbol: row.symbol, tier: row.tier, reason: row.reason, providerMappingVerified: row.provider_mapping_verified, sessionCalendarVerified: row.session_calendar_verified }));
  setMarketCoverageOverrides(activeOverrides);
  const availability = new Map(getMarketAvailability().map((row) => [row.symbol, row]));
  return MARKET_UNIVERSE.filter((market) => market.isActive).map((market) => {
    const override = overrides.get(market.symbol);
    return { ...getMarketCoverage(market, availability.get(market.symbol), override ? {
      symbol: override.symbol, tier: override.tier, reason: override.reason,
      providerMappingVerified: override.provider_mapping_verified,
      sessionCalendarVerified: override.session_calendar_verified,
    } : undefined), lastScannedAt: getTierBLastScannedAt(market.symbol) };
  });
}

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
  app.get('/api/v1/market/coverage', { preHandler: app.requireAuth, config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } } }, async (_request, reply) => {
    try { return { instruments: await readCoverageRows() }; }
    catch { return reply.code(503).send({ error: 'Market coverage is temporarily unavailable.' }); }
  });
  app.get('/api/v1/admin/markets/availability', { preHandler: app.requireAdmin }, async () => ({ markets: getMarketAvailability() }));
  app.get('/api/v1/admin/markets/budget', { preHandler: app.requireAdmin }, async () => ({ massive: getMassiveBudgetSnapshot(), twelveData: getTwelveDataBudgetSnapshot() }));
  app.get('/api/v1/admin/markets/coverage', { preHandler: app.requireAdmin, config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } } }, async (_request, reply) => {
    try { return { instruments: await readCoverageRows(), budgets: { massive: getMassiveBudgetSnapshot(), twelveData: getTwelveDataBudgetSnapshot() } }; }
    catch { return reply.code(503).send({ error: 'Market coverage is temporarily unavailable.' }); }
  });
  app.put('/api/v1/admin/markets/coverage', { preHandler: app.requireAdmin, config: { rateLimit: { max: 10, timeWindow: config.rateLimitWindowMs } } }, async (request, reply) => {
    const parsed = coverageUpdateSchema.safeParse(request.body);
    if (!parsed.success || !request.accessToken) return reply.code(parsed.success ? 401 : 400).send({ error: 'Invalid coverage update.' });
    if (!getMarket(parsed.data.symbol)) return reply.code(400).send({ error: 'Invalid coverage update.' });
    let rejectionCode = 'unknown';
    try {
      const { error } = await getSupabaseClientWithToken(request.accessToken).rpc('admin_set_market_coverage_tier', {
        p_symbol: parsed.data.symbol,
        p_tier: parsed.data.tier,
        p_reason: parsed.data.reason,
        p_provider_mapping_verified: parsed.data.providerMappingVerified,
        p_provider_available: parsed.data.providerAvailable,
        p_session_calendar_verified: parsed.data.sessionCalendarVerified,
      });
      if (error) {
        rejectionCode = error.code ?? 'unknown';
        throw new Error('Coverage update rejected.');
      }
      await refreshMarketCoverageOverrides(true);
      return { updated: true };
    } catch {
      // Record the denied attempt separately so the failed tier transaction cannot roll its audit row back.
      if (request.authenticatedUserId && rejectionCode !== 'unknown') {
        try {
          const { error } = await getSupabaseClient().from('admin_audit_events').insert({
            actor_id: request.authenticatedUserId,
            action: 'market.coverage.update_denied',
            details: { symbol: parsed.data.symbol, tier: parsed.data.tier, rejectionCode },
          });
          if (error) request.log.warn({ code: error.code }, 'Coverage denial audit write failed');
        } catch { request.log.warn('Coverage denial audit service is unavailable.'); }
      }
      if (rejectionCode === 'PGRST202' || rejectionCode === '42883') {
        return reply.code(503).send({ error: 'Market coverage controls are not installed. Apply the coverage migration before editing tiers.' });
      }
      if (rejectionCode === '42501') return reply.code(403).send({ error: 'Coverage changes require administrator access with MFA.' });
      if (rejectionCode === '23514' || rejectionCode === '22023') {
        return reply.code(409).send({ error: 'Coverage change did not meet provider, session, or capacity safety requirements.' });
      }
      return reply.code(503).send({ error: 'Coverage settings could not be saved; verify the database migration and administrator MFA.' });
    }
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
