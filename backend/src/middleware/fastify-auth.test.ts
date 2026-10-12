import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAuthGuards } from './fastify-auth';

const authState = vi.hoisted(() => ({
  role: 'admin', aal: 'aal2', factorStatus: 'verified' as string | null,
  authenticated: true, unavailable: false,
}));

vi.mock('../db.js', () => ({
  getSupabaseClientWithToken: vi.fn(() => {
    if (authState.unavailable) throw new Error('test-only auth outage');
    return {
      auth: {
        getUser: vi.fn(async () => authState.authenticated
          ? { data: { user: { id: 'user-a', factors: authState.factorStatus ? [{ status: authState.factorStatus }] : [] } }, error: null }
          : { data: { user: null }, error: { message: 'test-only invalid token' } }),
        getClaims: vi.fn(async () => ({ data: { claims: { aal: authState.aal } }, error: null })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { role: authState.role }, error: null })) })),
        })),
      })),
    };
  }),
}));

let originalRequireAdminMfa: string | undefined;

beforeEach(() => {
  authState.role = 'admin';
  authState.aal = 'aal2';
  authState.factorStatus = 'verified';
  authState.authenticated = true;
  authState.unavailable = false;
  originalRequireAdminMfa = process.env.REQUIRE_ADMIN_MFA;
});

afterEach(() => {
  if (originalRequireAdminMfa === undefined) delete process.env.REQUIRE_ADMIN_MFA;
  else process.env.REQUIRE_ADMIN_MFA = originalRequireAdminMfa;
});

async function createApp() {
  const app = Fastify();
  registerAuthGuards(app);
  app.get('/admin', { preHandler: app.requireAdmin }, async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('admin authentication assurance', () => {
  it('authenticates before checking administrator role', async () => {
    const app = await createApp();
    const response = await app.inject('/admin');
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('rejects invalid sessions without leaking the provider error', async () => {
    authState.authenticated = false;
    const app = await createApp();
    const response = await app.inject({ url: '/admin', headers: { authorization: 'Bearer invalid-token' } });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Invalid or expired session' });
    await app.close();
  });

  it('fails closed with a sanitized response when auth is unavailable', async () => {
    authState.unavailable = true;
    const app = await createApp();
    const response = await app.inject({ url: '/admin', headers: { authorization: 'Bearer test-token' } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Authentication service unavailable' });
    await app.close();
  });

  it('requires aal2 for an admin with a verified TOTP factor', async () => {
    authState.aal = 'aal1';
    const app = await createApp();
    const response = await app.inject({ url: '/admin', headers: { authorization: 'Bearer valid-token' } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Two-factor authentication required' });
    await app.close();
  });

  it('enforces aal2 when REQUIRE_ADMIN_MFA is enabled', async () => {
    process.env.REQUIRE_ADMIN_MFA = 'true';
    authState.factorStatus = null;
    authState.aal = 'aal1';
    const app = await createApp();
    const response = await app.inject({ url: '/admin', headers: { authorization: 'Bearer valid-token' } });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('allows an admin with aal2 and denies non-admins', async () => {
    const app = await createApp();
    const allowed = await app.inject({ url: '/admin', headers: { authorization: 'Bearer valid-token' } });
    expect(allowed.statusCode).toBe(200);
    authState.role = 'user';
    const denied = await app.inject({ url: '/admin', headers: { authorization: 'Bearer valid-token' } });
    expect(denied.statusCode).toBe(403);
    await app.close();
  });
});
