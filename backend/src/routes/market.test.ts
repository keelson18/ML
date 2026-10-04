import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { marketRoutes } from './market';

async function createApp() {
  const app = Fastify();
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers.authorization !== 'Bearer test-token') {
      reply.code(401).send({ error: 'Authentication required' });
    }
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

    const response = await app.inject('/api/v1/market/candles/BTCUSDT?timeframe=1h');

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
      url: '/api/v1/market/candles/BTCUSDT?timeframe=1h&limit=1001',
      headers: { authorization: 'Bearer test-token' },
    });
    const invalidTimeframe = await app.inject({
      url: '/api/v1/market/candles/BTCUSDT?timeframe=2h&limit=100',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(unknownSymbol.statusCode).toBe(400);
    expect(invalidLimit.statusCode).toBe(400);
    expect(invalidTimeframe.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('falls back to synthetic data when the upstream provider fails', async () => {
    const app = await createApp();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream secret detail', { status: 503 })));

    const response = await app.inject({
      url: '/api/v1/market/candles/BTCUSDT?timeframe=1h&limit=100',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.candles).toHaveLength(100);
    expect(body.candles[0]).toHaveProperty('open');
    expect(body.candles[0]).toHaveProperty('high');
    expect(body.candles[0]).toHaveProperty('low');
    expect(body.candles[0]).toHaveProperty('close');
    expect(body.candles[0]).toHaveProperty('volume');
    expect(response.body).not.toContain('upstream secret detail');
    await app.close();
  });
});
