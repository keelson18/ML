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

  it('requires authentication for the Trader Desk overview and plan resources', async () => {
    process.env.NODE_ENV = 'test';
    const { app } = buildServer();
    const overview = await app.inject('/api/v1/trader/overview');
    const plans = await app.inject('/api/v1/trader/plans');
    expect(overview.statusCode).toBe(401);
    expect(plans.statusCode).toBe(401);
    await app.close();
  });

  it('protects the admin user directory, role changes, and audit trail', async () => {
    process.env.NODE_ENV = 'test';
    const { app } = buildServer();
    const users = await app.inject('/api/v1/admin/users');
    const role = await app.inject({ method: 'PATCH', url: '/api/v1/admin/users/00000000-0000-4000-8000-000000000001/role', payload: { role: 'user' } });
    const audit = await app.inject('/api/v1/admin/audit-events');
    expect(users.statusCode).toBe(401);
    expect(role.statusCode).toBe(401);
    expect(audit.statusCode).toBe(401);
    await app.close();
  });
});
