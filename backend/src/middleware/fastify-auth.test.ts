import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAuthGuards } from './fastify-auth';

const authState = vi.hoisted(() => ({ role: 'admin', aal: 'aal2', factorStatus: 'verified' as string | null }));

vi.mock('../db.js', () => ({
  getSupabaseClientWithToken: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-a', factors: authState.factorStatus ? [{ status: authState.factorStatus }] : [] } }, error: null })),
      getClaims: vi.fn(async () => ({ data: { claims: { aal: authState.aal } }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { role: authState.role }, error: null })) })),
      })),
    })),
  })),
}));

let originalRequireAdminMfa: string | undefined;

beforeEach(() => {
  authState.role = 'admin';
  authState.aal = 'aal2';
  authState.factorStatus = 'verified';
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
