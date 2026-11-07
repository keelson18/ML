import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotStatus as ClientBotStatus } from '../../../src/lib/backend-api';
import { traderRoutes } from './trader';

const mocks = vi.hoisted(() => ({ buildBotStatus: vi.fn() }));

vi.mock('../services/botStatus', () => ({ buildBotStatus: mocks.buildBotStatus }));

async function createApp() {
  const app = Fastify();
  app.decorateRequest('authenticatedUserId', null);
  app.decorateRequest('accessToken', null);
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.slice('Bearer '.length);
    if (!token) { reply.code(401).send({ error: 'Authentication required.' }); return; }
    request.authenticatedUserId = token;
    request.accessToken = token;
  });
  app.decorate('requireAdmin', app.requireAuth);
  await app.register(traderRoutes);
  await app.ready();
  return app;
}

// Typed with the frontend contract so a backend/client drift fails compilation, not production.
function statusFixture(overrides: Partial<ClientBotStatus> = {}): ClientBotStatus {
  return {
    action: 'WAITING_FOR_TRIGGER', selectedSymbol: 'BTCUSD', assetClass: 'crypto', settlementCurrency: 'USD',
    timeframe: '15m', botEnabled: true, shadowMode: false,
    scheduler: { running: true, cycleInProgress: false, lastCycleAt: '2026-11-05T00:00:00.000Z', nextScheduledAt: null, lastError: null, leaseContentionCount: 0, leaseClaimFailureCount: 0, leaseRenewalFailureCount: 0, activeLeaseCount: 0 },
    enrollment: { enabled: true, symbols: ['BTCUSD'], pausedReason: null, lastRunAt: null },
    data: { providerSupported: true, provider: 'twelvedata', sourceInstrument: 'BTC/USD', status: 'verified', checkedAt: 1, reason: null, sessionOpen: true, sessionReason: '24/7' },
    analysis: { state: 'PLAN_AVAILABLE', marketBias: 'BUY' },
    plan: null,
    trigger: { state: 'WAITING', reason: null },
    risk: { state: 'APPROVED', reason: null },
    execution: { finalAction: 'NONE', orderStatus: 'NONE', orderSide: null, positionStatus: 'NONE', positionSide: null, positionEntry: null, positionQuantity: null },
    ledger: 'verified', lastProcessedCandleAt: null, lastClosedTradeAt: null, closedTradeCount: 0,
    blockingReason: 'Armed: price is in the zone, waiting for a closed trigger candle.',
    updatedAt: '2026-11-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('bot status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildBotStatus.mockResolvedValue(statusFixture());
  });

  it('requires authentication', async () => {
    const app = await createApp();
    const response = await app.inject('/api/v1/trader/bot-status?symbol=BTCUSD&timeframe=15m');
    expect(response.statusCode).toBe(401);
    expect(mocks.buildBotStatus).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects unknown instruments and unsupported timeframes before reading state', async () => {
    const app = await createApp();
    const unknown = await app.inject({ url: '/api/v1/trader/bot-status?symbol=NOTREAL&timeframe=15m', headers: { authorization: 'Bearer user-1' } });
    const timeframe = await app.inject({ url: '/api/v1/trader/bot-status?symbol=BTCUSD&timeframe=7m', headers: { authorization: 'Bearer user-1' } });
    expect(unknown.statusCode).toBe(400);
    expect(timeframe.statusCode).toBe(400);
    expect(mocks.buildBotStatus).not.toHaveBeenCalled();
    await app.close();
  });

  it('reads status for the authenticated account only', async () => {
    const app = await createApp();
    const response = await app.inject({ url: '/api/v1/trader/bot-status?symbol=BTCUSD&timeframe=15m', headers: { authorization: 'Bearer user-1' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: statusFixture() });
    expect(mocks.buildBotStatus).toHaveBeenCalledWith('user-1', 'BTCUSD', '15m');
    await app.close();
  });

  it('returns a safe error when status cannot be read', async () => {
    mocks.buildBotStatus.mockRejectedValueOnce(new Error('database offline'));
    const app = await createApp();
    const response = await app.inject({ url: '/api/v1/trader/bot-status?symbol=BTCUSD&timeframe=15m', headers: { authorization: 'Bearer user-1' } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Bot status is unavailable.' });
    await app.close();
  });
});
