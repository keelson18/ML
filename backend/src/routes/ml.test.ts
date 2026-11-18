import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config';
const serviceMocks = vi.hoisted(() => ({ fetchMarketData: vi.fn(), isMarketAccessBlocked: vi.fn() }));
vi.mock('../services/marketDataService', () => ({
  fetchMarketData: serviceMocks.fetchMarketData,
  isTimeframe: (timeframe: string) => ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'].includes(timeframe),
  MarketDataProviderError: class MarketDataProviderError extends Error {
    constructor(readonly provider: string, readonly status: number, readonly retryAfter: string | null) { super('provider error'); }
  },
}));
vi.mock('../services/marketRestrictions', () => ({ isMarketAccessBlocked: serviceMocks.isMarketAccessBlocked }));
import { mlRoutes } from './ml';

const originalSupabaseUrl = config.supabaseUrl;
const originalAnonKey = config.supabaseAnonKey;
const originalMlServiceApiKey = config.mlServiceApiKey;
const fetchMock = vi.spyOn(globalThis, 'fetch');

beforeEach(() => {
  config.supabaseUrl = 'https://project.example.test';
  config.supabaseAnonKey = 'test-anon-key';
  config.mlServiceApiKey = 'm'.repeat(48);
  fetchMock.mockReset();
  serviceMocks.fetchMarketData.mockReset();
  serviceMocks.isMarketAccessBlocked.mockReset().mockResolvedValue(false);
});

afterEach(() => {
  config.supabaseUrl = originalSupabaseUrl;
  config.supabaseAnonKey = originalAnonKey;
  config.mlServiceApiKey = originalMlServiceApiKey;
});

async function createApp() {
  const app = Fastify();
  app.decorateRequest('authenticatedUserId', null);
  app.decorateRequest('accessToken', null);
  app.decorate('requireAuth', async (request, reply) => {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
    if (!token) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }
    request.authenticatedUserId = 'test-user';
    request.accessToken = token;
  });
  await app.register(mlRoutes);
  await app.ready();
  return app;
}

describe('authenticated ML prediction route', () => {
  it('requires authentication and validates the prediction input', async () => {
    const app = await createApp();
    const unauthorized = await app.inject({ method: 'POST', url: '/api/v1/ml/predict', payload: { pair: 'BTCUSD', timeframe: '1h' } });
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/ml/predict', headers: { authorization: 'Bearer user-token' }, payload: { pair: 'BTCUSD', timeframe: 'invalid' } });

    expect(unauthorized.statusCode).toBe(401);
    expect(invalid.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('forwards the user token and prediction request to the Edge Function', async () => {
    const prediction = { pair: 'BTCUSD', timeframe: '1h', prediction: 'up' };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(prediction), { status: 200 }));
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ml/predict',
      headers: { authorization: 'Bearer user-token' },
      payload: { pair: 'BTCUSD', timeframe: '1h' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(prediction);
    expect(fetchMock).toHaveBeenCalledWith('https://project.example.test/functions/v1/ml-predict/predict', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer user-token', apikey: 'test-anon-key' }),
      body: JSON.stringify({ pair: 'BTCUSD', timeframe: '1h' }),
    }));
    await app.close();
  });
});

describe('internal ML maintenance market-data route', () => {
  it('requires a configured long server key and compares supplied keys before fetching data', async () => {
    const app = await createApp();
    const validKey = 'm'.repeat(48);
    config.mlServiceApiKey = '';
    const unconfigured = await app.inject({ method: 'GET', url: '/api/v1/internal/ml/candles/BTCUSD?timeframe=1h' });
    config.mlServiceApiKey = validKey;
    const unauthorized = await app.inject({ method: 'GET', url: '/api/v1/internal/ml/candles/BTCUSD?timeframe=1h', headers: { 'x-ml-service-key': 'wrong' } });

    expect(unconfigured.statusCode).toBe(503);
    expect(unauthorized.statusCode).toBe(401);
    expect(serviceMocks.fetchMarketData).not.toHaveBeenCalled();
    await app.close();
  });

  it('validates market, timeframe and candle bounds before using the provider', async () => {
    const app = await createApp();
    const headers = { 'x-ml-service-key': config.mlServiceApiKey };
    const invalidSymbol = await app.inject({ method: 'GET', url: '/api/v1/internal/ml/candles/NOTREAL?timeframe=1h&limit=1000', headers });
    const invalidTimeframe = await app.inject({ method: 'GET', url: '/api/v1/internal/ml/candles/BTCUSD?timeframe=2h&limit=1000', headers });
    const insufficientHistory = await app.inject({ method: 'GET', url: '/api/v1/internal/ml/candles/BTCUSD?timeframe=1h&limit=200', headers });

    expect([invalidSymbol.statusCode, invalidTimeframe.statusCode, insufficientHistory.statusCode]).toEqual([400, 400, 400]);
    expect(serviceMocks.fetchMarketData).not.toHaveBeenCalled();
    await app.close();
  });

  it('uses the canonical provider service and returns the dataset lineage needed for model artifacts', async () => {
    serviceMocks.fetchMarketData.mockResolvedValue({
      candles: [{ time: 1, open: 100, high: 101, low: 99, close: 100, volume: 1 }],
      dataset: { id: 'dataset-1', provider: 'twelvedata', quoteCurrency: 'USD', sourceInstrument: 'BTC/USD' },
    });
    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/internal/ml/candles/BTCUSD?timeframe=1h&limit=1000',
      headers: { 'x-ml-service-key': config.mlServiceApiKey },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      candles: [{ time: 1 }],
      dataset: { id: 'dataset-1', provider: 'twelvedata', quoteCurrency: 'USD', sourceInstrument: 'BTC/USD' },
    });
    expect(serviceMocks.fetchMarketData).toHaveBeenCalledWith('BTCUSD', '1h', 1000, { priority: true });
    await app.close();
  });
});
