import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Candle } from '../../../src/lib/types';
import type { TradeDecision } from '../engines/decision-engine';
import { analyze } from '../services/decisionService';
import { executeDecision } from '../services/paperTradingService';
import { fetchMarketData } from '../services/marketDataService';
import { paperRoutes } from './paper';

vi.mock('../services/decisionService', () => ({ analyze: vi.fn() }));
vi.mock('../services/paperTradingService', () => ({ executeDecision: vi.fn() }));
vi.mock('../services/marketDataService', () => ({
  fetchMarketData: vi.fn(),
  isTimeframe: (value: unknown) => ['1m', '5m', '15m', '1h', '4h', '1d'].includes(String(value)),
}));

const candles: Candle[] = Array.from({ length: 61 }, (_, index) => ({
  time: 1_700_000_000 + index * 60,
  open: 100,
  high: 102,
  low: 98,
  close: 101,
  volume: 5,
}));

const serverDecision: TradeDecision = {
  decision: 'BUY', confidence: 0.9, entry: 101, invalidation: 98, targets: [{ price: 106 },
  ], strategy: 'server strategy', supportingEvidence: [], contradictions: [], reasoning: 'server analysis',
  explanation: 'server decision', engineVersions: {}, timestamp: '2026-10-03T12:00:00.000Z',
};

async function createApp() {
  const app = Fastify();
  app.decorateRequest('authenticatedUserId', null);
  app.decorateRequest('accessToken', null);
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers.authorization !== 'Bearer test-token') {
      return reply.code(401).send({ error: 'Authentication required.' });
    }
    request.authenticatedUserId = 'user-123';
    request.accessToken = 'test-token';
  });
  await app.register(paperRoutes);
  await app.ready();
  return app;
}

afterEach(() => vi.clearAllMocks());

describe('paper trade route', () => {
  it('ignores a client-provided decision and evaluates closed server candles', async () => {
    vi.mocked(fetchMarketData).mockResolvedValue({ candles } as never);
    vi.mocked(analyze).mockResolvedValue({ decision: { result: serverDecision } } as never);
    vi.mocked(executeDecision).mockResolvedValue({ accepted: true, status: 'filled' } as never);
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/paper/execute',
      headers: { authorization: 'Bearer test-token' },
      payload: { symbol: 'BTCUSDT', timeframe: '15m', decision: { decision: 'BUY', entry: 1 } },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMarketData).toHaveBeenCalledWith('BTCUSDT', '15m', 501);
    expect(analyze).toHaveBeenCalledWith({ symbol: 'BTCUSDT', timeframe: '15m', candles: candles.slice(0, -1) }, 'user-123', 'test-token');
    expect(executeDecision).toHaveBeenCalledWith({ symbol: 'BTCUSDT', decision: serverDecision, accountId: 'user-123', accessToken: 'test-token' });
    await app.close();
  });

  it('does not create an order when server analysis has no directional decision', async () => {
    vi.mocked(fetchMarketData).mockResolvedValue({ candles } as never);
    vi.mocked(analyze).mockResolvedValue({ decision: { result: { ...serverDecision, decision: 'NO_TRADE' } } } as never);
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/paper/execute',
      headers: { authorization: 'Bearer test-token' },
      payload: { symbol: 'BTCUSDT', timeframe: '15m' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ accepted: false, status: 'rejected' });
    expect(executeDecision).not.toHaveBeenCalled();
    await app.close();
  });
});
