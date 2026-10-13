import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { learningResearchRoutes } from './learning-research';
import { traderConfig } from '../trader/config';

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
        parameters: { testStartTime: Math.ceil(Date.now() / 1000) + 120, transactionCostRate: 0.001, slippageRate: 0.001 },
      },
    });
    expect(response.statusCode).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'authenticated-user', status: 'draft' }));
    await app.close();
  });

  it('rejects a historical holdout boundary at experiment registration', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/research/experiments', headers: { authorization: 'Bearer session-token' },
      payload: { name: 'historical', hypothesis: 'No leakage', datasetId: 'old', parameters: {
        testStartTime: 1, transactionCostRate: 0.001, slippageRate: 0.001,
      } },
    });
    expect(response.statusCode).toBe(400);
    expect(insert).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuses a trigger timeframe whose bounded provider history cannot hold the full forward window', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: {
        id: TEST_ID, user_id: 'authenticated-user', name: 'too-short', hypothesis: 'test', status: 'draft',
        created_at: new Date(Date.now() - 60_000).toISOString(),
        parameters: { testStartTime: Math.ceil(Date.now() / 1000) + 120, transactionCostRate: 0.001, slippageRate: 0.0005 },
      }, error: null }),
    };
    dbMocks.getSupabaseClientWithToken.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    const app = await createApp();
    const response = await app.inject({
      method: 'POST', url: `/api/v1/research/experiments/${TEST_ID}/run`, headers: { authorization: 'Bearer session-token' },
      payload: { symbol: 'BTCUSD', timeframe: '15m', historyLimit: 1000 },
    });
    expect(response.statusCode).toBe(422);
    expect(marketMocks.fetchMarketData).not.toHaveBeenCalled();
    await app.close();
  });

  it('collects future holdout candles over time without persisting an underpowered run', async () => {
    const timeframe = '4h' as const;
    const step = 14_400;
    const latest = Math.floor(Date.now() / 1000 / step) * step - step * 2;
    const testStartTime = latest - 20 * step;
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: {
        id: TEST_ID, user_id: 'authenticated-user', name: 'forward-run', hypothesis: 'test', status: 'draft',
        created_at: new Date((testStartTime - 86_400) * 1000).toISOString(),
        parameters: { setupType: 'trend-pullback', testStartTime, transactionCostRate: 0.001, slippageRate: 0.0005 },
      }, error: null }),
    };
    dbMocks.getSupabaseClientWithToken.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    const serviceRpc = vi.fn();
    dbMocks.getSupabaseClient.mockReturnValue({ rpc: serviceRpc });
    marketMocks.fetchMarketData.mockImplementation(async (_symbol: string, requestedTimeframe: '4h' | '1d') => {
      const count = requestedTimeframe === '4h' ? 700 : 120;
      const interval = requestedTimeframe === '4h' ? step : 86_400;
      const end = Math.floor(Date.now() / 1000 / interval) * interval - interval * 2;
      const candles = Array.from({ length: count }, (_, index) => {
        const close = 100 + index * 0.01;
        return { time: end - (count - index - 1) * interval, open: close - 0.01, high: close + 0.1, low: close - 0.1, close, volume: 100 + index };
      });
      return { timeframe: requestedTimeframe, candles, stale: false, fetchedAt: Date.now(),
        dataset: { provider: 'unit-fixture', dataVersion: `${requestedTimeframe}-v1` } };
    });
    const app = await createApp();
    const oldRevision = process.env.APP_REVISION;
    process.env.APP_REVISION = 'test-revision';
    try {
      const response = await app.inject({
        method: 'POST', url: `/api/v1/research/experiments/${TEST_ID}/run`, headers: { authorization: 'Bearer session-token' },
        payload: { symbol: 'BTCUSD', timeframe, historyLimit: 700 },
      });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({ state: 'collecting', requiredDays: traderConfig.MIN_FORWARD_DAYS, tradeThresholdMet: false });
      expect(response.json()).not.toHaveProperty('metrics');
      expect(serviceRpc).not.toHaveBeenCalled();
    } finally {
      if (oldRevision === undefined) delete process.env.APP_REVISION;
      else process.env.APP_REVISION = oldRevision;
      await app.close();
    }
  });

  it('persists an immutable artifact only after configured evidence thresholds are reached', async () => {
    const timeframe = '4h' as const;
    const step = 14_400;
    const latest = Math.floor(Date.now() / 1000 / step) * step - step * 2;
    const testStartTime = latest - 20 * step;
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: {
        id: TEST_ID, user_id: 'authenticated-user', name: 'test-run', hypothesis: 'test', status: 'draft',
        created_at: new Date((testStartTime - 86_400) * 1000).toISOString(),
        parameters: { setupType: 'trend-pullback', testStartTime, transactionCostRate: 0.001, slippageRate: 0.0005 },
      }, error: null }),
    };
    dbMocks.getSupabaseClientWithToken.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    const serviceRpc = vi.fn().mockResolvedValue({ data: TEST_ID, error: null });
    dbMocks.getSupabaseClient.mockReturnValue({ rpc: serviceRpc });
    marketMocks.fetchMarketData.mockImplementation(async (_symbol: string, requestedTimeframe: '4h' | '1d') => {
      const count = requestedTimeframe === '4h' ? 700 : 120;
      const interval = requestedTimeframe === '4h' ? step : 86_400;
      const end = Math.floor(Date.now() / 1000 / interval) * interval - interval * 2;
      const candles = Array.from({ length: count }, (_, index) => {
        const close = 100 + index * 0.05;
        return { time: end - (count - index - 1) * interval, open: close - 0.02, high: close + 0.1, low: close - 0.1, close, volume: 100 + index };
      });
      return { timeframe: requestedTimeframe, candles, stale: false, fetchedAt: Date.now(),
        dataset: { provider: 'unit-fixture', dataVersion: `${requestedTimeframe}-v1` } };
    });
    const oldDays = traderConfig.MIN_FORWARD_DAYS;
    const oldTrades = traderConfig.MIN_FORWARD_TRADES;
    traderConfig.MIN_FORWARD_DAYS = 0;
    traderConfig.MIN_FORWARD_TRADES = 0;
    const oldRevision = process.env.APP_REVISION;
    process.env.APP_REVISION = 'test-revision';
    try {
      const app = await createApp();
      const response = await app.inject({
        method: 'POST', url: `/api/v1/research/experiments/${TEST_ID}/run`, headers: { authorization: 'Bearer session-token' },
        payload: { symbol: 'BTCUSD', timeframe, historyLimit: 700 },
      });
      expect(response.statusCode).toBe(201);
      expect(marketMocks.fetchMarketData).toHaveBeenCalledTimes(2);
      expect(serviceRpc).toHaveBeenCalledWith('record_research_run', expect.objectContaining({
        p_experiment_id: TEST_ID, p_user_id: 'authenticated-user', p_artifacts: expect.objectContaining({
          codeRevision: 'test-revision', strategyVersion: 'trend-pullback-v1',
          validation: expect.objectContaining({ promotionEligible: false }),
        }),
      }));
      await app.close();
    } finally {
      traderConfig.MIN_FORWARD_DAYS = oldDays;
      traderConfig.MIN_FORWARD_TRADES = oldTrades;
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
