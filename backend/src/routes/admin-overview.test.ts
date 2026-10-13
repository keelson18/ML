import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../server';
import { config } from '../config';
import { resetAdminOverviewCacheForTests } from './admin-overview';

const { getSupabaseClient, getSupabaseClientWithToken } = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  getSupabaseClientWithToken: vi.fn(),
}));
vi.mock('../db.js', () => ({ getSupabaseClient, getSupabaseClientWithToken }));

function queryBuilder(table: string, role = 'admin') {
  const result = () => table === 'profiles' ? { data: { role }, error: null }
    : table === 'paper_sim_accounts' ? { data: [], error: null }
      : table === 'paper_autopilot' ? { data: [], error: null }
        : table === 'autopilot_settings' ? { data: { max_symbols_global: 5 }, error: null }
          : { data: null, count: 0, error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'gte', 'order', 'limit']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result());
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
  return builder;
}

const originalNodeEnv = process.env.NODE_ENV;
const originalMassiveKey = config.massiveApiKey;
const originalTwelveDataKey = config.twelveDataApiKey;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  getSupabaseClient.mockReset();
  getSupabaseClientWithToken.mockReset();
  config.massiveApiKey = originalMassiveKey;
  config.twelveDataApiKey = originalTwelveDataKey;
  resetAdminOverviewCacheForTests();
});

describe('GET /api/v1/admin/overview', () => {
  it('returns 401 anonymously and 403 to a regular user', async () => {
    process.env.NODE_ENV = 'test';
    getSupabaseClientWithToken.mockImplementation((token: string) => ({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'regular-user', factors: [] } }, error: null })),
        getClaims: vi.fn(async () => ({ data: { claims: { aal: 'aal2' } }, error: null })),
      },
      from: vi.fn((table: string) => queryBuilder(table, token === 'user-token' ? 'user' : 'admin')),
    }));
    const { app } = buildServer();
    const anonymous = await app.inject('/api/v1/admin/overview');
    const regular = await app.inject({ url: '/api/v1/admin/overview', headers: { authorization: 'Bearer user-token' } });
    expect(anonymous.statusCode).toBe(401);
    expect(regular.statusCode).toBe(403);
    await app.close();
  });

  it('returns a strict redacted overview for an admin, with failed sources unverified', async () => {
    process.env.NODE_ENV = 'test';
    config.massiveApiKey = 'test-secret-massive';
    config.twelveDataApiKey = 'test-secret-twelvedata';
    getSupabaseClient.mockReturnValue({
      rpc: vi.fn(async () => { throw new Error('upstream secret token'); }),
      from: vi.fn((table: string) => queryBuilder(table)),
    });
    getSupabaseClientWithToken.mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'admin-user', factors: [] } }, error: null })),
        getClaims: vi.fn(async () => ({ data: { claims: { aal: 'aal2' } }, error: null })),
      },
      from: vi.fn((table: string) => queryBuilder(table)),
    });
    const { app } = buildServer();
    const response = await app.inject({ url: '/api/v1/admin/overview', headers: { authorization: 'Bearer admin-token' } });
    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.schema.status).toBe('unverified');
    expect(body.ledger.hashChain.status).toBe('unverified');
    expect(body.ledger.accounting.status).toBe('unverified');
    expect(body.feeds.find((feed: { feed: string }) => feed.feed === 'Twelve Data').status).toBe('unverified');
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/apiKey|secret|access_token|@/i);
    expect(serialized).not.toContain('test-secret-massive');
    expect(serialized).not.toContain('test-secret-twelvedata');
    expect(serialized).not.toContain('upstream secret token');
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['environment', 'schema', 'ledger', 'scheduler', 'providers', 'feeds', 'freshness', 'autopilot']));
    await app.close();
  });

  it('returns 401 anonymously and 403 to non-admins for full verification', async () => {
    process.env.NODE_ENV = 'test';
    getSupabaseClientWithToken.mockImplementation(() => ({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'regular-user', factors: [] } }, error: null })),
        getClaims: vi.fn(async () => ({ data: { claims: { aal: 'aal2' } }, error: null })),
      },
      from: vi.fn((table: string) => queryBuilder(table, 'user')),
    }));
    const { app } = buildServer();
    const anonymous = await app.inject({ method: 'POST', url: '/api/v1/admin/overview/ledger/reverify', payload: { reason: 'Investigate ledger integrity' } });
    const regular = await app.inject({ method: 'POST', url: '/api/v1/admin/overview/ledger/reverify', headers: { authorization: 'Bearer user-token' }, payload: { reason: 'Investigate ledger integrity' } });
    expect(anonymous.statusCode).toBe(401);
    expect(regular.statusCode).toBe(403);
    await app.close();
  });

  it('requires AAL2 and records a denial before full verification', async () => {
    process.env.NODE_ENV = 'test';
    const audit = vi.fn(async () => ({ error: null }));
    getSupabaseClientWithToken.mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'admin-user', factors: [] } }, error: null })),
        getClaims: vi.fn(async () => ({ data: { claims: { aal: 'aal1' } }, error: null })),
      },
      from: vi.fn((table: string) => queryBuilder(table)),
      rpc: audit,
    });
    const { app } = buildServer();
    const response = await app.inject({ method: 'POST', url: '/api/v1/admin/overview/ledger/reverify', headers: { authorization: 'Bearer admin-token' }, payload: { reason: 'Investigate ledger integrity' } });
    expect(response.statusCode).toBe(403);
    expect(audit).toHaveBeenCalledWith('admin_record_health_audit', { p_action: 'admin.mfa_denied', p_reason: 'Full ledger verification requires AAL2.', p_checked_accounts: null });
    await app.close();
  });

  it('executes full verification through the service RPC after AAL2', async () => {
    process.env.NODE_ENV = 'test';
    const rpc = vi.fn(async () => ({ data: { status: 'verified', checkedAccounts: 1 }, error: null }));
    const audit = vi.fn(async () => ({ error: null }));
    getSupabaseClient.mockReturnValue({ rpc, from: vi.fn((table: string) => queryBuilder(table)) });
    getSupabaseClientWithToken.mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'admin-user', factors: [] } }, error: null })),
        getClaims: vi.fn(async () => ({ data: { claims: { aal: 'aal2' } }, error: null })),
      },
      from: vi.fn((table: string) => queryBuilder(table)),
      rpc: audit,
    });
    const { app } = buildServer();
    const response = await app.inject({ method: 'POST', url: '/api/v1/admin/overview/ledger/reverify', headers: { authorization: 'Bearer admin-token' }, payload: { reason: 'Investigate ledger integrity' } });
    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith('admin_reverify_paper_ledger', { p_actor_id: 'admin-user', p_reason: 'Investigate ledger integrity' });
    expect(audit).not.toHaveBeenCalled();
    await app.close();
  });
});
