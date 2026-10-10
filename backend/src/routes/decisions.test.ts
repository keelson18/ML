import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutonomousPipeline } from '../autonomy/pipeline';
import { config } from '../config';
import { decisionRoutes } from './decisions';

const mocks = vi.hoisted(() => ({ fetchMarketData: vi.fn(), analyze: vi.fn() }));

vi.mock('../services/marketDataService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/marketDataService')>()),
  fetchMarketData: mocks.fetchMarketData,
}));
vi.mock('../services/decisionService', () => ({ analyze: mocks.analyze }));

let lastClosedTime = 0;

function series() {
  const closed = Array.from({ length: 60 }, (_, index) => ({
    time: lastClosedTime - (59 - index) * 3600,
    open: 100, high: 101, low: 99, close: 100, volume: 1,
  }));
  const forming = { time: lastClosedTime + 3600, open: 100, high: 101, low: 99, close: 100, volume: 1 };
  return { candles: [...closed, forming] };
}

async function createApp() {
  const app = Fastify();
  app.decorateRequest('authenticatedUserId', null);
  app.decorateRequest('accessToken', null);
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.slice('Bearer '.length);
    if (!token) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }
    request.authenticatedUserId = token;
    request.accessToken = token;
  });
  app.decorate('requireAdmin', app.requireAuth);
  await app.register(decisionRoutes, new AutonomousPipeline({ symbols: [] }));
  await app.ready();
  return app;
}

function analyzeRequest(app: Awaited<ReturnType<typeof createApp>>, token: string, payload: unknown = { symbol: 'BTCUSD', timeframe: '1h' }) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/decisions/analyze',
    headers: { authorization: `Bearer ${token}` },
    payload: payload as Record<string, unknown>,
  });
}

describe('server-side decision analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastClosedTime = 1_700_000_000;
    mocks.fetchMarketData.mockImplementation(async () => series());
    mocks.analyze.mockImplementation(async () => ({ decision: { result: { decision: 'NO_TRADE' } } }));
  });

  it('rejects candles sent from the browser', async () => {
    const app = await createApp();
    const response = await analyzeRequest(app, 'user-reject', { symbol: 'BTCUSD', timeframe: '1h', candles: [] });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Candles are not accepted; send symbol and timeframe only.' });
    expect(mocks.fetchMarketData).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects unknown symbols before fetching', async () => {
    const app = await createApp();
    const response = await analyzeRequest(app, 'user-unknown', { symbol: 'NOTREAL', timeframe: '1h' });
    expect(response.statusCode).toBe(400);
    expect(mocks.fetchMarketData).not.toHaveBeenCalled();
    await app.close();
  });

  it('serves repeats for the same closed bar from cache without re-analysing', async () => {
    const app = await createApp();
    const first = await analyzeRequest(app, 'user-cache');
    const second = await analyzeRequest(app, 'user-cache');
    expect(first.json()).toMatchObject({ cached: false });
    expect(second.json()).toMatchObject({ cached: true });
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('charges the quota only for uncached analyses', async () => {
    const app = await createApp();
    const max = config.analyzeRateLimitMax;
    for (let index = 0; index < max + 5; index += 1) {
      expect((await analyzeRequest(app, 'user-quota')).statusCode).toBe(200);
    }
    for (let index = 1; index < max; index += 1) {
      lastClosedTime += 3600;
      expect((await analyzeRequest(app, 'user-quota')).statusCode).toBe(200);
    }
    lastClosedTime += 3600;
    const limited = await analyzeRequest(app, 'user-quota');
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: 'Analysis is busy. Try again shortly.' });
    expect(mocks.analyze).toHaveBeenCalledTimes(max);
    await app.close();
  });

  it('keeps cache entries separate per user', async () => {
    const app = await createApp();
    await analyzeRequest(app, 'user-a');
    const other = await analyzeRequest(app, 'user-b');
    expect(other.json()).toMatchObject({ cached: false });
    expect(mocks.analyze).toHaveBeenCalledTimes(2);
    await app.close();
  });
});
