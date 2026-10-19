import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config';
import { mlRoutes } from './ml';

const originalSupabaseUrl = config.supabaseUrl;
const originalAnonKey = config.supabaseAnonKey;
const fetchMock = vi.spyOn(globalThis, 'fetch');

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
  beforeEach(() => {
    config.supabaseUrl = 'https://project.example.test';
    config.supabaseAnonKey = 'test-anon-key';
    fetchMock.mockReset();
  });

  afterEach(() => {
    config.supabaseUrl = originalSupabaseUrl;
    config.supabaseAnonKey = originalAnonKey;
  });

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
