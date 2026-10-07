import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config';
import { marketRoutes } from './market';

async function createApp() {
  const app = Fastify();
  app.decorateRequest('authenticatedUserId', null);
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.slice('Bearer '.length);
    if (!token || !['test-token', 'another-token'].includes(token)) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }
    request.authenticatedUserId = token === 'test-token' ? 'test-user' : 'another-user';
  });
  await app.register(rateLimit, {
    global: false,
    hook: 'preHandler',
    max: config.marketRateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    keyGenerator: (request) => request.authenticatedUserId ?? request.ip,
    errorResponseBuilder: () => ({ statusCode: 429, error: 'Too Many Requests', message: 'Too many requests. Please try again later.' }),
  });
  await app.register(marketRoutes);
  await app.ready();
  return app;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('market candle route', () => {
  it('requires authentication', async () => {
    const app = await createApp();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.inject('/api/v1/market/candles/BTCUSD?timeframe=1h');

    expect(response.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects unknown symbols and invalid limits before fetching', async () => {
    const app = await createApp();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const unknownSymbol = await app.inject({
      url: '/api/v1/market/candles/NOTREAL?timeframe=1h&limit=100',
      headers: { authorization: 'Bearer test-token' },
    });
    const invalidLimit = await app.inject({
      url: '/api/v1/market/candles/BTCUSD?timeframe=1h&limit=1001',
      headers: { authorization: 'Bearer test-token' },
    });
    const invalidTimeframe = await app.inject({
      url: '/api/v1/market/candles/BTCUSD?timeframe=2h&limit=100',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(unknownSymbol.statusCode).toBe(400);
    expect(invalidLimit.statusCode).toBe(400);
    expect(invalidTimeframe.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('rate limits requests by authenticated user with a generic response', async () => {
    const app = await createApp();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    let response = await app.inject({
      url: '/api/v1/market/candles/NOTREAL?timeframe=1h&limit=100',
      headers: { authorization: 'Bearer test-token' },
    });
    for (let index = 1; index <= config.marketRateLimitMax; index += 1) {
      response = await app.inject({
        url: '/api/v1/market/candles/NOTREAL?timeframe=1h&limit=100',
        headers: { authorization: 'Bearer test-token' },
      });
    }

    expect(response?.statusCode).toBe(429);
    expect(response?.json()).toEqual({ statusCode: 429, error: 'Too Many Requests', message: 'Too many requests. Please try again later.' });
    const separateUserResponse = await app.inject({
      url: '/api/v1/market/candles/NOTREAL?timeframe=1h&limit=100',
      headers: { authorization: 'Bearer another-token' },
    });
    expect(separateUserResponse.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns a generic error when the upstream provider fails', async () => {
    const app = await createApp();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream secret detail', { status: 503 })));

    const response = await app.inject({
      url: '/api/v1/market/candles/BTCUSD?timeframe=1h&limit=100',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: 'Market data unavailable.' });
    expect(response.body).not.toContain('upstream secret detail');
    await app.close();
  });
});
