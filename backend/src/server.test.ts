import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from './server';
import { config } from './config';

// Provide a deterministic authenticated user for route-security tests.
vi.mock('./db.js', () => ({
  getSupabaseClient: vi.fn(),
  getSupabaseClientWithToken: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'server-test-user' } }, error: null })) },
    from: vi.fn(),
  })),
}));

const originalNodeEnv = process.env.NODE_ENV;
const originalCorsOrigin = process.env.CORS_ORIGIN;
const originalMarketRateLimitMax = config.marketRateLimitMax;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = originalCorsOrigin;
  config.marketRateLimitMax = originalMarketRateLimitMax;
});

describe('Fastify security headers', () => {
  it('builds and serves health with standard security headers', async () => {
    process.env.NODE_ENV = 'test';
    const { app } = buildServer();

    const response = await app.inject('/health');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'quantum-api' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    await app.close();
  });

  it('enables HSTS in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.example.test';
    const { app } = buildServer();

    const response = await app.inject('/health');

    expect(response.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    await app.close();
  });

  it('rate limits authenticated market requests using configured quota', async () => {
    process.env.NODE_ENV = 'test';
    config.marketRateLimitMax = 2;
    const { app } = buildServer();
    const options = {
      url: '/api/v1/market/candles/NOTREAL?timeframe=1h',
      headers: { authorization: 'Bearer test-token' },
    };

    await app.inject(options);
    await app.inject(options);
    const response = await app.inject(options);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ statusCode: 429, error: 'Too Many Requests', message: 'Too many requests. Please try again later.' });
    await app.close();
  });
});
