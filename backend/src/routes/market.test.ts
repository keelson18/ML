import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config';
import { MARKET_UNIVERSE, setMarketAvailability } from '../../../src/lib/markets';
import { marketRoutes } from './market';

const restrictedSymbols = vi.hoisted(() => ({ value: [] as Array<{ symbol: string }> }));

vi.mock('../db', () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        in: () => ({ eq: async () => ({ data: restrictedSymbols.value, error: null }) }),
      }),
    }),
  }),
}));

async function createApp() {
  const app = Fastify();
  app.decorateRequest('authenticatedUserId', null);
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.slice('Bearer '.length);
    if (!token) { reply.code(401).send({ error: 'Authentication required' }); return; }
    request.authenticatedUserId = 'test-user';
  });
  await app.register(rateLimit, { global: false, hook: 'preHandler', max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs, keyGenerator: (request) => request.authenticatedUserId ?? request.ip });
  await app.register(marketRoutes);
  await app.ready();
  return app;
}

afterEach(() => {
  vi.unstubAllGlobals();
  restrictedSymbols.value = [];
  setMarketAvailability(MARKET_UNIVERSE.map(({ symbol }) => ({ symbol, status: 'unverified', checkedAt: null })));
});

describe('market candle route', () => {
  it('requires authentication', async () => {
    const app = await createApp();
    const response = await app.inject('/api/v1/market/candles/BTCUSD?timeframe=1h');
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('rejects unknown, unsupported, and invalid requests before fetching', async () => {
    const app = await createApp();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const unknown = await app.inject({ url: '/api/v1/market/candles/NOTREAL?timeframe=1h', headers: { authorization: 'Bearer test-token' } });
    const unsupported = await app.inject({ url: '/api/v1/market/candles/JP225?timeframe=1h', headers: { authorization: 'Bearer test-token' } });
    const invalid = await app.inject({ url: '/api/v1/market/candles/BTCUSD?timeframe=2h', headers: { authorization: 'Bearer test-token' } });
    expect(unknown.statusCode).toBe(400);
    expect(unsupported.statusCode).toBe(400);
    expect(invalid.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('allows provider-backed commodity requests without coverage enrollment', async () => {
    const app = await createApp();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })));
    const response = await app.inject({ url: '/api/v1/market/candles/XAUUSD?timeframe=1h&limit=100', headers: { authorization: 'Bearer test-token' } });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: 'Market data unavailable.' });
    await app.close();
  });

  it('honors an explicit administrator restriction without contacting the provider', async () => {
    restrictedSymbols.value = [{ symbol: 'XAUUSD' }];
    const app = await createApp();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await app.inject({ url: '/api/v1/market/candles/XAUUSD?timeframe=1h', headers: { authorization: 'Bearer test-token' } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Market access is disabled by an administrator.' });
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });
});
