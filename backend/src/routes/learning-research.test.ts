import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { learningResearchRoutes } from './learning-research';

const dbMocks = vi.hoisted(() => ({ getSupabaseClient: vi.fn(), getSupabaseClientWithToken: vi.fn() }));
const marketMocks = vi.hoisted(() => ({ fetchMarketData: vi.fn() }));
vi.mock('../db', () => dbMocks);
vi.mock('../services/marketDataService', () => ({ fetchMarketData: marketMocks.fetchMarketData }));

const TEST_ID = 'a1b2c3d4-1111-4111-8111-111111111111';
let insert: ReturnType<typeof vi.fn>;

async function createApp() {
  const app = Fastify();
  app.decorateRequest('authenticatedUserId', null);
  app.decorateRequest('accessToken', null);
  app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.slice('Bearer '.length);
    if (!token) return reply.code(401).send({ error: 'Authentication required.' });
    request.authenticatedUserId = 'admin-user';
    request.accessToken = token;
  });
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.slice('Bearer '.length);
    if (!token) return reply.code(401).send({ error: 'Authentication required.' });
    request.authenticatedUserId = 'authenticated-user';
    request.accessToken = token;
  });
  await app.register(learningResearchRoutes);
  await app.ready();
  return app;
}

describe('learning and research persistence routes', () => {
  beforeEach(() => {
    insert = vi.fn().mockReturnThis();
    const query = {
      insert,
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: { id: TEST_ID }, error: null }),
    };
    dbMocks.getSupabaseClientWithToken.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    dbMocks.getSupabaseClient.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: TEST_ID, error: null }) });
    marketMocks.fetchMarketData.mockReset();
  });

  it('stores an authenticated owner learning event as hypothesis without client status escalation', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/learning/events', headers: { authorization: 'Bearer session-token' },
      payload: { sourceType: 'paper_trade', observation: { result: 'loss' }, hypothesis: 'Review the setup after a loss.' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: TEST_ID });
    expect(dbMocks.getSupabaseClientWithToken).toHaveBeenCalledWith('session-token');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'authenticated-user', status: 'hypothesis' }));
    await app.close();
  });

  it('rejects client supplied status and user ownership fields', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/learning/events', headers: { authorization: 'Bearer session-token' },
      payload: { userId: 'other-user', sourceType: 'research', observation: {}, hypothesis: 'Test', status: 'approved' },
    });
    expect(response.statusCode).toBe(400);
    expect(insert).not.toHaveBeenCalled();
    await app.close();
  });

  it('creates research metadata as a draft and restricts parameter keys', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/research/experiments', headers: { authorization: 'Bearer session-token' },
      payload: {
        name: 'test-run', hypothesis: 'Test the setup', datasetId: 'provider:dataset-v1',
        parameters: { trainingEndIndex: 30, testStartIndex: 30, transactionCostRate: 0.001, slippageRate: 0.001 },
      },
    });
    expect(response.statusCode).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'authenticated-user', status: 'draft' }));
    await app.close();
  });

  it('runs only server-fetched candles and persists the immutable replay artifact', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: {
        id: TEST_ID, user_id: 'authenticated-user', name: 'test-run', hypothesis: 'test', status: 'draft',
        created_at: '2026-01-01T00:00:00.000Z',
        parameters: { setupType: 'trend-pullback', trainingEndIndex: 100, testStartIndex: 120, transactionCostRate: 0.001, slippageRate: 0.0005 },
      }, error: null }),
    };
    dbMocks.getSupabaseClientWithToken.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    const serviceRpc = vi.fn().mockResolvedValue({ data: TEST_ID, error: null });
    dbMocks.getSupabaseClient.mockReturnValue({ rpc: serviceRpc });
    marketMocks.fetchMarketData.mockImplementation(async (_symbol: string, timeframe: '15m' | '4h' | '1d') => {
      const count = timeframe === '15m' ? 220 : 60;
      const step = timeframe === '15m' ? 900 : timeframe === '4h' ? 14_400 : 86_400;
      const latest = Math.floor(Date.now() / 1000 / step) * step - step * 2;
      const first = latest - (count - 1) * step;
      const candles = Array.from({ length: count }, (_, index) => {
        const close = 100 + index * 0.05;
        return { time: first + index * step, open: close - 0.02, high: close + 0.1, low: close - 0.1, close, volume: 100 + index };
      });
      return { timeframe, candles, stale: false, fetchedAt: Date.now(),
        dataset: { provider: 'unit-fixture', dataVersion: `${timeframe}-v1` } };
    });
    const oldRevision = process.env.APP_REVISION;
    process.env.APP_REVISION = 'test-revision';
    try {
      const app = await createApp();
      const response = await app.inject({
        method: 'POST', url: `/api/v1/research/experiments/${TEST_ID}/run`, headers: { authorization: 'Bearer session-token' },
        payload: { symbol: 'BTCUSD', timeframe: '15m', historyLimit: 500 },
      });
      expect(response.statusCode).toBe(201);
      expect(marketMocks.fetchMarketData).toHaveBeenCalledTimes(3);
      expect(serviceRpc).toHaveBeenCalledWith('record_research_run', expect.objectContaining({
        p_experiment_id: TEST_ID, p_user_id: 'authenticated-user', p_artifacts: expect.objectContaining({
          codeRevision: 'test-revision', strategyVersion: 'trend-pullback-v1',
          validation: expect.objectContaining({ promotionEligible: false }),
        }),
      }));
      await app.close();
    } finally {
      if (oldRevision === undefined) delete process.env.APP_REVISION;
      else process.env.APP_REVISION = oldRevision;
    }
  });

  it('requires admin authorization and delegates promotion to the stored-evidence SQL gate', async () => {
    const serviceRpc = vi.fn().mockResolvedValue({ data: null, error: null });
    dbMocks.getSupabaseClient.mockReturnValue({ rpc: serviceRpc });
    const app = await createApp();
    const unauthorized = await app.inject({ method: 'POST', url: `/api/v1/admin/research/experiments/${TEST_ID}/promote`, payload: { runId: TEST_ID } });
    expect(unauthorized.statusCode).toBe(401);
    const approved = await app.inject({
      method: 'POST', url: `/api/v1/admin/research/experiments/${TEST_ID}/promote`,
      headers: { authorization: 'Bearer admin-token' }, payload: { runId: TEST_ID },
    });
    expect(approved.statusCode).toBe(200);
    expect(serviceRpc).toHaveBeenCalledWith('approve_research_strategy', {
      p_experiment_id: TEST_ID, p_run_id: TEST_ID, p_reviewer_id: 'admin-user',
    });
    await app.close();
  });
});
