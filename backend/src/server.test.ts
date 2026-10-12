import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer, readSchemaHealth } from './server';
import { config } from './config';
import { getSupabaseClient } from './db';

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
const originalSupabaseUrl = config.supabaseUrl;
const originalServiceRoleKey = config.supabaseServiceRoleKey;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = originalCorsOrigin;
  config.marketRateLimitMax = originalMarketRateLimitMax;
  config.supabaseUrl = originalSupabaseUrl;
  config.supabaseServiceRoleKey = originalServiceRoleKey;
  vi.mocked(getSupabaseClient).mockReset();
});

describe('database schema readiness', () => {
  it('reports missing server configuration instead of mislabeling it as an unapplied migration', async () => {
    config.supabaseUrl = '';
    config.supabaseServiceRoleKey = '';

    await expect(readSchemaHealth()).resolves.toEqual({
      ok: false,
      missing: ['SUPABASE_URL', 'SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY'],
      failure: 'configuration',
    });
  });

  it('distinguishes missing RPC permission from a missing migration', async () => {
    config.supabaseUrl = 'https://project.example.test';
    config.supabaseServiceRoleKey = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
    vi.mocked(getSupabaseClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } }),
    } as never);

    await expect(readSchemaHealth()).resolves.toEqual({
      ok: false,
      missing: ['database role cannot execute verify_paper_schema (check server key and RPC grants)'],
      failure: 'access',
    });
  });

  it('fails readiness when the server key is actually an anon JWT', async () => {
    config.supabaseUrl = 'https://project.example.test';
    config.supabaseServiceRoleKey = `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`;

    await expect(readSchemaHealth()).resolves.toEqual({
      ok: false,
      missing: ['Supabase server key must be an sb_secret_ key or a service_role JWT'],
      failure: 'configuration',
    });
  });

  it('labels a missing schema RPC as a schema failure', async () => {
    config.supabaseUrl = 'https://project.example.test';
    config.supabaseServiceRoleKey = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
    vi.mocked(getSupabaseClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202' } }),
    } as never);

    await expect(readSchemaHealth()).resolves.toEqual({
      ok: false,
      missing: ['verify_paper_schema'],
      failure: 'schema',
    });
  });
});

describe('Fastify security headers', () => {
  it('builds and serves health with standard security headers', async () => {
    process.env.NODE_ENV = 'test';
    const { app } = buildServer();

    const response = await app.inject('/health');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'quantum-api' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    await app.close();
  });

  it('allows only configured CORS origins', async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGIN = 'https://app.example.test';
    const { app } = buildServer();
    const preflight = (origin: string) => app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin, 'access-control-request-method': 'GET' },
    });

    const allowed = await preflight('https://app.example.test');
    const denied = await preflight('https://untrusted.example.test');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.test');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
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
    expect((await app.inject('/api/v1/me/health')).statusCode).toBe(401);
    expect((await app.inject('/api/v1/system/health')).statusCode).toBe(401);
    await app.close();
  });

  it('requires authentication for autopilot and does not expose browser-driven advancement', async () => {
    process.env.NODE_ENV = 'test';
    const { app } = buildServer();
    const settings = await app.inject('/api/v1/trader/autopilot');
    const run = await app.inject({ method: 'POST', url: '/api/v1/trader/autopilot/run' });
    const oldAdvance = await app.inject({ method: 'POST', url: '/api/v1/trader/advance' });
    expect(settings.statusCode).toBe(401);
    expect(run.statusCode).toBe(401);
    expect(oldAdvance.statusCode).toBe(404);
    await app.close();
  });

  it('protects the admin user directory, role changes, and audit trail', async () => {
    process.env.NODE_ENV = 'test';
    const { app } = buildServer();
    const users = await app.inject('/api/v1/admin/users');
    const role = await app.inject({ method: 'PATCH', url: '/api/v1/admin/users/00000000-0000-4000-8000-000000000001/role', payload: { role: 'user' } });
    const audit = await app.inject('/api/v1/admin/audit-events');
    const blackouts = await app.inject('/api/v1/admin/event-blackouts');
    const exportData = await app.inject('/api/v1/me/export');
    expect(users.statusCode).toBe(401);
    expect(role.statusCode).toBe(401);
    expect(audit.statusCode).toBe(401);
    expect(blackouts.statusCode).toBe(401);
    expect(exportData.statusCode).toBe(401);
    await app.close();
  });
});
