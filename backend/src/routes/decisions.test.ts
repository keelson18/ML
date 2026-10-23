import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutonomousPipeline } from '../autonomy/pipeline';
import { config } from '../config';
import { decisionRoutes } from './decisions';

const mocks = vi.hoisted(() => ({ fetchMarketData: vi.fn(), analyze: vi.fn(), availabilityStatus: 'available' as 'available' | 'unavailable' | 'unverified' }));

vi.mock('../services/marketDataService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/marketDataService')>()),
  fetchMarketData: mocks.fetchMarketData,
}));
vi.mock('../services/decisionService', () => ({ analyze: mocks.analyze }));
vi.mock('../services/marketAvailability', () => ({
  getMarketAvailability: () => [{ symbol: 'BTCUSD', status: mocks.availabilityStatus, checkedAt: 1 }],
}));

let lastClosedTime = 0;

function series() {
  const closed = Array.from({ length: 60 }, (_, index) => ({
    time: lastClosedTime - (59 - index) * 3600,
    open: 100, high: 101, low: 99, close: 100, volume: 1,
  }));
  const forming = { time: lastClosedTime + 10 * 3600, open: 100, high: 101, low: 99, close: 100, volume: 1 };
  return {
    candles: [...closed, forming],
    instrument: { marketType: 'crypto' },
    dataset: { id: 'test-provider:test-series', provider: 'massive' },
    fetchedAt: Date.now(),
    stale: false,
  };
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
    mocks.availabilityStatus = 'available';
    lastClosedTime = Math.floor(Date.now() / 3_600_000) * 3_600 - 3_600;
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

  it('rejects markets outside the verification registry', async () => {
    const app = await createApp();
    const response = await analyzeRequest(app, 'user-unconfigured', { symbol: 'AAPL', timeframe: '1h' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Market is not configured for verification.' });
    expect(mocks.fetchMarketData).not.toHaveBeenCalled();
    await app.close();
  });

  it('analyzes an unverified market only after fetching fresh validated candles', async () => {
    mocks.availabilityStatus = 'unverified';
    const app = await createApp();
    const response = await analyzeRequest(app, 'user-unverified');
    expect(response.statusCode).toBe(200);
    expect(mocks.fetchMarketData).toHaveBeenCalledWith('BTCUSD', '1h', 1000);
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('blocks a market known to be unavailable from its configured provider', async () => {
    mocks.availabilityStatus = 'unavailable';
    const app = await createApp();
    const response = await analyzeRequest(app, 'user-unavailable');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Market is unavailable from the configured provider.' });
    expect(mocks.fetchMarketData).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    await app.close();
  });

  it('blocks a fresh provider response whose latest closed candle is too old', async () => {
    // Keep the synthetic forming candle old too, so it cannot be mistaken for
    // a newly closed bar after the fixture is shifted backwards.
    lastClosedTime -= 30 * 3_600;
    const app = await createApp();
    const response = await analyzeRequest(app, 'user-old-candles');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Fresh market data is unavailable; analysis is blocked.' });
    expect(mocks.analyze).not.toHaveBeenCalled();
    await app.close();
  });

  it('blocks the stale-cache fallback flag even when its candle timestamps look recent', async () => {
    mocks.fetchMarketData.mockImplementation(async () => ({ ...series(), stale: true }));
    const app = await createApp();
    const response = await analyzeRequest(app, 'user-stale-fallback');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Fresh market data is unavailable; analysis is blocked.' });
    expect(mocks.analyze).not.toHaveBeenCalled();
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

  it('passes only boundary-verified closed candles with provider provenance to analysis', async () => {
    const app = await createApp();
    await analyzeRequest(app, 'user-closed-check');
    const [, userId] = mocks.analyze.mock.calls[0] ?? [];
    const [input] = mocks.analyze.mock.calls[0] ?? [];
    expect(userId).toBe('user-closed-check');
    expect(input).toMatchObject({
      candleClosure: 'verified_closed', dataState: 'ready',
      dataSource: { provider: 'massive', marketType: 'crypto', datasetId: 'test-provider:test-series' },
    });
    expect(input.candles.at(-1).time).toBe(lastClosedTime);
    await app.close();
  });

  it('charges the quota only for uncached analyses', async () => {
    const max = config.analyzeRateLimitMax;
    const originalWindowMs = config.rateLimitWindowMs;
    config.rateLimitWindowMs = 24 * 60 * 60 * 1000;
    const app = await createApp();
    const clock = vi.spyOn(Date, 'now');
    const realNow = Date.now();
    let elapsedMs = 0;
    clock.mockImplementation(() => realNow + elapsedMs);
    try {
      for (let index = 0; index < max + 5; index += 1) {
        expect((await analyzeRequest(app, 'user-quota')).statusCode).toBe(200);
      }
      for (let index = 1; index < max; index += 1) {
        lastClosedTime += 3600;
        elapsedMs += 3_600_000;
        expect((await analyzeRequest(app, 'user-quota')).statusCode).toBe(200);
      }
      lastClosedTime += 3600;
      elapsedMs += 3_600_000;
      const limited = await analyzeRequest(app, 'user-quota');
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toEqual({ error: 'Analysis is busy. Try again shortly.' });
      expect(mocks.analyze).toHaveBeenCalledTimes(max);
    } finally {
      config.rateLimitWindowMs = originalWindowMs;
      clock.mockRestore();
      await app.close();
    }
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
