import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { learningResearchRoutes } from './learning-research';
import { traderConfig } from '../trader/config';
import type { Candle, Timeframe } from '../../../src/lib/types';
import type { StoredResearchCandle } from '../trader/research-collection';
import { config } from '../config';

const dbMocks = vi.hoisted(() => ({ getSupabaseClient: vi.fn(), getSupabaseClientWithToken: vi.fn() }));
const marketMocks = vi.hoisted(() => ({ fetchMarketData: vi.fn() }));
vi.mock('../db', () => dbMocks);
vi.mock('../services/marketDataService', () => ({ fetchMarketData: marketMocks.fetchMarketData }));

const TEST_ID = 'a1b2c3d4-1111-4111-8111-111111111111';
let insert: ReturnType<typeof vi.fn>;

const INTERVALS: Record<Timeframe, number> = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14_400, '1d': 86_400, '1w': 604_800, '1M': 2_592_000 };

function providerFixtures(countOverrides: Partial<Record<'15m' | '1h' | '4h' | '1d', number>> = {}) {
  const now = Date.now();
  return (async (_symbol: string, timeframe: '15m' | '1h' | '4h' | '1d') => {
    const step = INTERVALS[timeframe];
    const count = countOverrides[timeframe] ?? ({ '15m': 700, '1h': 500, '4h': 100, '1d': 120 }[timeframe]);
    const latest = Math.floor(now / 1000 / step) * step - step * 2;
    const candles = Array.from({ length: count }, (_, index): Candle => {
      const close = 100 + index * 0.05;
      return { time: latest - (count - index - 1) * step, open: close - 0.02, high: close + 0.1, low: close - 0.1, close, volume: 100 + index };
    });
    return { timeframe, candles, stale: false, fetchedAt: now,
      dataset: { provider: 'unit-fixture', dataVersion: `${timeframe}-fixture-v1` } };
  });
}

function collectionRowsFromProvider(fetcher: ReturnType<typeof providerFixtures>) {
  return Promise.all((['15m', '1h', '4h', '1d'] as const).map(async (timeframe) => {
    const response = await fetcher('BTCUSD', timeframe);
    return response.candles.map((candle) => ({ timeframe, candle_time: candle.time, candle,
      provider: response.dataset.provider, source_data_version: response.dataset.dataVersion,
      source_fetched_at: new Date(response.fetchedAt).toISOString() } satisfies StoredResearchCandle));
  })).then((groups) => groups.flat());
}

function mockCollectionReader(rows: StoredResearchCandle[]) {
  return { from: vi.fn(() => {
    let timeframe: Timeframe | undefined;
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: string) => { if (column === 'timeframe') timeframe = value as Timeframe; return builder; }),
      order: vi.fn(() => builder),
      range: vi.fn((from: number, to: number) => Promise.resolve({ data: rows.filter((row) => row.timeframe === timeframe).slice(from, to + 1), error: null })),
    };
    return builder;
  }) };
}

async function createApp() {
  const app = Fastify();
  app.decorateRequest('authenticatedUserId', null);
  app.decorateRequest('accessToken', null);
  app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.slice('Bearer '.length);
    if (!token) return reply.code(401).send({ error: 'Authentication required.' });
    if (token === 'user-token') return reply.code(403).send({ error: 'Admin access required.' });
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
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    dbMocks.getSupabaseClientWithToken.mockReturnValue({ from: vi.fn().mockReturnValue(query), rpc: vi.fn().mockResolvedValue({ data: TEST_ID, error: null }) });
    dbMocks.getSupabaseClient.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: TEST_ID, error: null }) });
    marketMocks.fetchMarketData.mockReset();
  });

  it('stores an admin learning event through the audited database function', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/admin/ai/events', headers: { authorization: 'Bearer admin-token' },
      payload: { sourceType: 'paper_trade', observation: { result: 'loss' }, hypothesis: 'Review the setup after a loss.' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: TEST_ID });
    expect(dbMocks.getSupabaseClientWithToken).toHaveBeenCalledWith('admin-token');
    expect(dbMocks.getSupabaseClientWithToken.mock.results[0]?.value.rpc).toHaveBeenCalledWith('admin_create_learning_event', expect.objectContaining({ p_source_type: 'paper_trade', p_hypothesis: 'Review the setup after a loss.' }));
    expect(insert).not.toHaveBeenCalled();
    await app.close();
  });

  it('requires admin access for the AI review overview and learning event write', async () => {
    const app = await createApp();
    for (const method of ['GET', 'POST'] as const) {
      const url = method === 'GET' ? '/api/v1/admin/ai/overview' : '/api/v1/admin/ai/events';
      const payload = method === 'POST' ? { sourceType: 'research', observation: {}, hypothesis: 'Review evidence.' } : undefined;
      expect((await app.inject({ method, url, payload })).statusCode).toBe(401);
      expect((await app.inject({ method, url, headers: { authorization: 'Bearer user-token' }, payload })).statusCode).toBe(403);
      expect((await app.inject({ method, url, headers: { authorization: 'Bearer admin-token' }, payload })).statusCode).toBe(method === 'GET' ? 200 : 201);
    }
    await app.close();
  });

  it('returns bounded knowledge, run, journal, and collection sections from persisted sources', async () => {
    const app = await createApp();
    const response = await app.inject({ url: '/api/v1/admin/ai/overview', headers: { authorization: `Bearer ${'overview-test-token'}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      versions: [], strategyVersions: [], events: [], experiments: [], knowledge: [],
      runs: [], results: [], journal: [], collections: [],
    });
    expect(response.json().refreshedAt).toEqual(expect.any(String));
    await app.close();
  });

  it('rejects client supplied status and user ownership fields', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/admin/ai/events', headers: { authorization: 'Bearer admin-token' },
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
        parameters: { testStartTime: Math.ceil((Date.now() + config.researchCollectionStartLeadMs + 120_000) / 1000), transactionCostRate: 0.001, slippageRate: 0.001 },
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

  it('requires enough future lead time to initialize the immutable provider baseline', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/research/experiments', headers: { authorization: 'Bearer session-token' },
      payload: { name: 'too-soon', hypothesis: 'Initialize first', datasetId: 'new', parameters: {
        testStartTime: Math.ceil(Date.now() / 1000) + 60, transactionCostRate: 0.001, slippageRate: 0.001,
      } },
    });
    expect(response.statusCode).toBe(400);
    expect(insert).not.toHaveBeenCalled();
    await app.close();
  });

  it('initializes a durable collection from bounded provider responses before the registered holdout', async () => {
    const fetcher = providerFixtures();
    const rows = await collectionRowsFromProvider(fetcher);
    const start = Math.ceil(Date.now() / 1000 / 900) * 900 + 1800;
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: {
        id: TEST_ID, user_id: 'authenticated-user', name: 'collection', hypothesis: 'test', status: 'draft',
        created_at: new Date(Date.now() - 60_000).toISOString(),
        parameters: { testStartTime: start, transactionCostRate: 0.001, slippageRate: 0.0005 },
      }, error: null }),
    };
    dbMocks.getSupabaseClientWithToken.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    const serviceRpc = vi.fn().mockResolvedValue({ data: { newCandles: 1_420, initialized: true }, error: null });
    dbMocks.getSupabaseClient.mockReturnValue({ rpc: serviceRpc, ...mockCollectionReader(rows) });
    marketMocks.fetchMarketData.mockImplementation(fetcher);
    const app = await createApp();
    const response = await app.inject({
      method: 'POST', url: `/api/v1/research/experiments/${TEST_ID}/run`, headers: { authorization: 'Bearer session-token' },
      payload: { symbol: 'BTCUSD', timeframe: '15m', historyLimit: 1000 },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ state: 'collecting', initialized: true, collectedDays: 0, requiredDays: 90, requiredBars: 8_640 });
    expect(serviceRpc).toHaveBeenCalledWith('append_research_collection_batch', expect.objectContaining({
      p_experiment_id: TEST_ID, p_user_id: 'authenticated-user', p_symbol: 'BTCUSD', p_continuous: true,
    }));
    expect(serviceRpc.mock.calls.filter(([name]) => name === 'append_research_collection_batch')).toHaveLength(1);
    await app.close();
  });

  it('does not allow research replay to use a timeframe other than the validated 15m confirmation', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST', url: `/api/v1/research/experiments/${TEST_ID}/run`, headers: { authorization: 'Bearer session-token' },
      payload: { symbol: 'BTCUSD', timeframe: '4h', historyLimit: 1000 },
    });
    expect(response.statusCode).toBe(400);
    expect(marketMocks.fetchMarketData).not.toHaveBeenCalled();
    await app.close();
  });

  it('fails closed for non-crypto research until a provider session calendar is verified', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST', url: `/api/v1/research/experiments/${TEST_ID}/run`, headers: { authorization: 'Bearer session-token' },
      payload: { symbol: 'XAUUSD', timeframe: '15m', historyLimit: 1000 },
    });
    expect(response.statusCode).toBe(422);
    expect(marketMocks.fetchMarketData).not.toHaveBeenCalled();
    await app.close();
  });

  it('collects future holdout candles over time without persisting an underpowered run', async () => {
    const timeframe = '15m' as const;
    const step = 900;
    const latest = Math.floor(Date.now() / 1000 / step) * step - step * 2;
    const testStartTime = latest - 20 * step;
    const fetcher = providerFixtures();
    const rows = await collectionRowsFromProvider(fetcher);
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
    const serviceRpc = vi.fn().mockResolvedValue({ data: { newCandles: 1, initialized: true }, error: null });
    dbMocks.getSupabaseClient.mockReturnValue({ rpc: serviceRpc, ...mockCollectionReader(rows) });
    marketMocks.fetchMarketData.mockImplementation(fetcher);
    const app = await createApp();
    const oldRevision = process.env.APP_REVISION;
    const oldDays = traderConfig.MIN_FORWARD_DAYS;
    traderConfig.MIN_FORWARD_DAYS = 1;
    process.env.APP_REVISION = 'test-revision';
    try {
      const response = await app.inject({
        method: 'POST', url: `/api/v1/research/experiments/${TEST_ID}/run`, headers: { authorization: 'Bearer session-token' },
        payload: { symbol: 'BTCUSD', timeframe, historyLimit: 700 },
      });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toMatchObject({ state: 'collecting', initialized: true, requiredDays: traderConfig.MIN_FORWARD_DAYS });
      expect(response.json().collectedDays).toBeLessThan(traderConfig.MIN_FORWARD_DAYS);
      expect(response.json()).not.toHaveProperty('metrics');
      expect(serviceRpc.mock.calls.filter(([name]) => name === 'append_research_collection_batch')).toHaveLength(1);
      expect(serviceRpc.mock.calls[0]?.[0]).toBe('append_research_collection_batch');
    } finally {
      if (oldRevision === undefined) delete process.env.APP_REVISION;
      else process.env.APP_REVISION = oldRevision;
      traderConfig.MIN_FORWARD_DAYS = oldDays;
      await app.close();
    }
  });

  it('persists an immutable artifact only after configured evidence thresholds are reached', async () => {
    const timeframe = '15m' as const;
    const step = 900;
    const latest = Math.floor(Date.now() / 1000 / step) * step - step * 2;
    const testStartTime = latest - 20 * step;
    const fetcher = providerFixtures();
    const rows = await collectionRowsFromProvider(fetcher);
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
    const serviceRpc = vi.fn()
      .mockResolvedValueOnce({ data: { newCandles: 0, initialized: true }, error: null })
      .mockResolvedValueOnce({ data: TEST_ID, error: null })
      .mockResolvedValueOnce({ data: TEST_ID, error: null });
    dbMocks.getSupabaseClient.mockReturnValue({ rpc: serviceRpc, ...mockCollectionReader(rows) });
    marketMocks.fetchMarketData.mockImplementation(fetcher);
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
      expect(marketMocks.fetchMarketData).toHaveBeenCalledTimes(4);
      expect(serviceRpc.mock.calls.map(([name]) => name)).toEqual(['append_research_collection_batch', 'record_research_run', 'append_ai_learning_journal_event']);
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
