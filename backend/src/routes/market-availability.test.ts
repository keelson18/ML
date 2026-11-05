import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { config } from '../config';
import { hasConfiguredProbeProvider, marketAvailabilityRoutes } from './market-availability';

const restrictions = vi.hoisted(() => ({ rows: [] as Array<{ symbol: string; blocked: boolean; reason: string; updated_at: string }>, rpcError: null as { code: string; message: string } | null, rpcCalls: [] as unknown[] }));

vi.mock('../db', () => ({
  getSupabaseClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: restrictions.rows, error: null }) }) }) }) }),
  getSupabaseClientWithToken: () => ({ rpc: async (_name: string, args: unknown) => { restrictions.rpcCalls.push(args); return { error: restrictions.rpcError }; } }),
}));

async function createAdminApp() {
  const app = Fastify();
  app.decorateRequest('accessToken', null);
  app.decorateRequest('authenticatedUserId', null);
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.headers.authorization) { reply.code(401).send({ error: 'Authentication required.' }); return; }
    request.accessToken = 'user-token';
    request.authenticatedUserId = 'user-id';
  });
  app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.headers.authorization) { reply.code(401).send({ error: 'Authentication required.' }); return; }
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

  it('allows probing a crypto market with a Twelve Data key', () => {
    config.massiveApiKey = '';
    config.twelveDataApiKey = 'test-twelve-data-key';
    expect(hasConfiguredProbeProvider(['BTCUSD'])).toBe(true);
  });

  it('recognizes the mapped commodity provider independently', () => {
    config.massiveApiKey = '';
    config.twelveDataApiKey = 'test-twelve-data-key';
    expect(hasConfiguredProbeProvider(['XAUUSD'])).toBe(true);
  });

  it('exposes probe candidates for all five asset classes and excludes unsupported providers', async () => {
    const { getProbeableMarketSymbols, isProbeableMarket } = await import('../services/marketAvailability');
    const symbols = new Set(getProbeableMarketSymbols());
    for (const symbol of ['BTCUSD', 'XAUUSD', 'EURUSD', 'SPX500', 'AAPL']) expect(symbols.has(symbol)).toBe(true);
    expect(isProbeableMarket('JP225')).toBe(false);
    expect(isProbeableMarket('US30')).toBe(true);
  });

  it('requires a configured provider key', () => {
    config.massiveApiKey = '';
    config.twelveDataApiKey = '';
    expect(hasConfiguredProbeProvider(['BTCUSD'])).toBe(false);
  });

  it('rejects probe bodies that are not a single known market', async () => {
    config.twelveDataApiKey = 'test-twelve-data-key';
    config.massiveApiKey = 'test-massive-key';
    const app = await createAdminApp();
    const emptyBody = await app.inject({ method: 'POST', url: '/api/v1/admin/markets/probe', headers: { authorization: 'Bearer admin', 'x-role': 'admin' }, payload: {} });
    const unsupported = await app.inject({ method: 'POST', url: '/api/v1/admin/markets/probe', headers: { authorization: 'Bearer admin', 'x-role': 'admin' }, payload: { symbol: 'JP225' } });
    expect(emptyBody.statusCode).toBe(400);
    expect(unsupported.statusCode).toBe(400);
    await app.close();
  });
});

describe('market access restriction routes', () => {
  afterEach(() => {
    restrictions.rows = [];
    restrictions.rpcError = null;
    restrictions.rpcCalls = [];
  });

  it('requires an administrator to read or change restrictions', async () => {
    const app = await createAdminApp();
    const anonymous = await app.inject('/api/v1/admin/markets/restrictions');
    const user = await app.inject({ url: '/api/v1/admin/markets/restrictions', headers: { authorization: 'Bearer user' } });
    const userWrite = await app.inject({ method: 'PUT', url: '/api/v1/admin/markets/restrictions', headers: { authorization: 'Bearer user' }, payload: { symbol: 'XAUUSD', blocked: true, reason: 'test' } });
    expect(anonymous.statusCode).toBe(401);
    expect(user.statusCode).toBe(403);
    expect(userWrite.statusCode).toBe(403);
    expect(restrictions.rpcCalls).toEqual([]);
    await app.close();
  });

  it('returns only explicitly blocked instruments', async () => {
    restrictions.rows = [{ symbol: 'XAUUSD', blocked: true, reason: 'Owner restriction', updated_at: '2026-11-01T00:00:00.000Z' }];
    const app = await createAdminApp();
    const response = await app.inject({ url: '/api/v1/admin/markets/restrictions', headers: { authorization: 'Bearer admin', 'x-role': 'admin' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ restrictions: restrictions.rows });
    await app.close();
  });

  it('updates a restriction through the AAL2-guarded RPC', async () => {
    const app = await createAdminApp();
    const response = await app.inject({ method: 'PUT', url: '/api/v1/admin/markets/restrictions', headers: { authorization: 'Bearer admin', 'x-role': 'admin' }, payload: { symbol: 'XAUUSD', blocked: true, reason: 'Owner restriction' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(restrictions.rpcCalls).toEqual([{ p_symbol: 'XAUUSD', p_blocked: true, p_reason: 'Owner restriction' }]);
    await app.close();
  });

  it('reports a safe MFA diagnosis when the RPC rejects the caller', async () => {
    restrictions.rpcError = { code: '42501', message: 'Administrator MFA required.' };
    const app = await createAdminApp();
    const response = await app.inject({ method: 'PUT', url: '/api/v1/admin/markets/restrictions', headers: { authorization: 'Bearer admin', 'x-role': 'admin' }, payload: { symbol: 'XAUUSD', blocked: true, reason: 'Owner restriction' } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Market restriction changes require administrator access with MFA.' });
    await app.close();
  });

  it('rejects malformed restriction payloads', async () => {
    const app = await createAdminApp();
    const response = await app.inject({ method: 'PUT', url: '/api/v1/admin/markets/restrictions', headers: { authorization: 'Bearer admin', 'x-role': 'admin' }, payload: { symbol: 'XAUUSD', blocked: 'yes' } });
    expect(response.statusCode).toBe(400);
    expect(restrictions.rpcCalls).toEqual([]);
    await app.close();
  });
});
