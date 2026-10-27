import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { config } from '../config';
import { hasConfiguredProbeProvider, marketAvailabilityRoutes } from './market-availability';

const coverageRpc = vi.hoisted(() => vi.fn(async () => ({ error: null as { code: string } | null })));
const auditInsert = vi.hoisted(() => vi.fn(async () => ({ error: null as { code: string } | null })));
vi.mock('../db', () => ({
  getSupabaseClient: () => ({ from: () => ({ select: async () => ({ data: [], error: null }), insert: auditInsert }) }),
  getSupabaseClientWithToken: () => ({ rpc: coverageRpc }),
}));

async function createCoverageApp() {
  const app = Fastify();
  app.decorateRequest('accessToken', null);
  app.decorateRequest('authenticatedUserId', null);
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.slice('Bearer '.length);
    if (!token) { reply.code(401).send({ error: 'Authentication required.' }); return; }
    request.accessToken = token;
    request.authenticatedUserId = 'user-id';
  });
  app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.slice('Bearer '.length);
    if (!token) { reply.code(401).send({ error: 'Authentication required.' }); return; }
    if (request.headers['x-role'] !== 'admin') { reply.code(403).send({ error: 'Administrator access required.' }); return; }
    request.accessToken = 'admin-token';
    request.authenticatedUserId = 'admin-id';
  });
  await app.register(marketAvailabilityRoutes);
  await app.ready();
  return app;
}

describe('market availability probe configuration', () => {
  const originalMassiveKey = config.massiveApiKey;
  const originalTwelveDataKey = config.twelveDataApiKey;

  afterEach(() => {
    config.massiveApiKey = originalMassiveKey;
    config.twelveDataApiKey = originalTwelveDataKey;
  });

  it('allows probing a Twelve Data market without a Massive key', () => {
    config.massiveApiKey = '';
    config.twelveDataApiKey = 'test-twelve-data-key';
    expect(hasConfiguredProbeProvider(['BTCUSD'])).toBe(true);
  });

  it('requires a key for at least one configured market provider', () => {
    config.massiveApiKey = '';
    config.twelveDataApiKey = '';
    expect(hasConfiguredProbeProvider(['BTCUSD'])).toBe(false);
  });

  it('recognizes the mapped Twelve Data commodity provider independently', () => {
    config.massiveApiKey = '';
    config.twelveDataApiKey = 'test-twelve-data-key';
    expect(hasConfiguredProbeProvider(['XAUUSD'])).toBe(true);
  });

  it('validates the probe target and rejects unsupported market categories', async () => {
    const app = await createCoverageApp();
    const invalidBody = await app.inject({
      method: 'POST', url: '/api/v1/admin/markets/probe',
      headers: { authorization: `Bearer ${'invalid-body-test-token'}`, 'x-role': 'admin' }, payload: {},
    });
    const stock = await app.inject({
      method: 'POST', url: '/api/v1/admin/markets/probe',
      headers: { authorization: `Bearer ${'unsupported-market-test-token'}`, 'x-role': 'admin' }, payload: { symbol: 'AAPL' },
    });
    config.twelveDataApiKey = '';
    config.massiveApiKey = '';
    const commodityWithoutKey = await app.inject({
      method: 'POST', url: '/api/v1/admin/markets/probe',
      headers: { authorization: `Bearer ${'missing-provider-key-test-token'}`, 'x-role': 'admin' }, payload: { symbol: 'XAUUSD' },
    });

    expect(invalidBody.statusCode).toBe(400);
    expect(stock.statusCode).toBe(400);
    expect(commodityWithoutKey.statusCode).toBe(503);
    await app.close();
  });
});

describe('market coverage route authorization', () => {
  afterEach(() => {
    coverageRpc.mockReset();
    coverageRpc.mockResolvedValue({ error: null });
    auditInsert.mockClear();
  });

  it('requires authentication for user coverage and restricts admin coverage to admins', async () => {
    const app = await createCoverageApp();
    const anonymousUserRead = await app.inject('/api/v1/market/coverage');
    const normalAdminRead = await app.inject({ url: '/api/v1/admin/markets/coverage', headers: { authorization: 'Bearer user-token' } });
    const adminRead = await app.inject({ url: '/api/v1/admin/markets/coverage', headers: { authorization: 'Bearer admin-token', 'x-role': 'admin' } });

    expect(anonymousUserRead.statusCode).toBe(401);
    expect(normalAdminRead.statusCode).toBe(403);
    expect(adminRead.statusCode).toBe(200);
    expect(adminRead.json().instruments).toHaveLength(75);
    await app.close();
  });

  it('records rejected coverage edits and gives a safe MFA diagnosis', async () => {
    coverageRpc.mockResolvedValueOnce({ error: { code: '42501' } });
    const app = await createCoverageApp();
    const response = await app.inject({ method: 'PUT', url: '/api/v1/admin/markets/coverage', headers: { authorization: 'Bearer admin-token', 'x-role': 'admin' },
      payload: { symbol: 'XAUUSD', tier: 'C', reason: 'verified by admin', providerMappingVerified: true, providerAvailable: true, sessionCalendarVerified: true } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Coverage changes require administrator access with MFA.' });
    expect(auditInsert).toHaveBeenCalledWith({ actor_id: 'admin-id', action: 'market.coverage.update_denied', details: { symbol: 'XAUUSD', tier: 'C', rejectionCode: '42501' } });
    await app.close();
  });

  it('explains when the owner-applied coverage RPC migration is missing', async () => {
    coverageRpc.mockResolvedValueOnce({ error: { code: 'PGRST202' } });
    const app = await createCoverageApp();
    const response = await app.inject({ method: 'PUT', url: '/api/v1/admin/markets/coverage', headers: { authorization: 'Bearer admin-token', 'x-role': 'admin' },
      payload: { symbol: 'XRPUSD', tier: 'B', reason: 'verified mapping', providerMappingVerified: true, providerAvailable: false, sessionCalendarVerified: false } });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Market coverage controls are not installed. Apply the coverage migration before editing tiers.' });
    await app.close();
  });
});
