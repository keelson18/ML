// Covers trigger-based transitions and strict next-candle order fills.
import { describe, expect, it } from 'vitest';
import type { Candle } from '../../../src/lib/types';
import type { TradePlan, PendingPaperOrder } from './types';
import { advanceTradePlan } from './executor';

const plan: TradePlan = {
  id: 'plan-1', accountId: 'account-1', symbol: 'BTCUSD', side: 'long', setupType: 'trend-pullback', htfBias: 'bull',
  zone: { low: 98, high: 100 }, trigger: { kind: 'close_above_level', level: 100 }, invalidation: 95,
  targets: [{ price: 110, fractionOfPosition: 1 }], minRR: 2, expiresAtBar: 50, thesis: 'test', falsification: 'close below stop',
  grade: 'A', status: 'WATCHING', contextSnapshot: {}, engineVersions: {}, datasetId: 'data-1',
  createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
};

function bar(time: number, values: Partial<Candle> = {}): Candle {
  return { time, open: 99, high: 101, low: 98, close: 101, volume: 1_000, ...values };
}

describe('plan executor', () => {
  it('creates a pending order after a trigger and cannot fill it on that candle', () => {
    const triggerBar = bar(900);
    const created = advanceTradePlan({
      plan, candle: triggerBar, recentCandles: [triggerBar], barIndex: 20, timeframe: '15m',
      gate: () => ({ approved: true, quantity: 2 }),
    });
    expect(created.plan.status).toBe('PENDING_ORDER');
    expect(created.pendingOrder?.status).toBe('pending');
    expect(created.events.map((event) => event.toStatus)).toEqual(['ARMED', 'PENDING_ORDER']);

    const sameCandle = advanceTradePlan({
      plan: created.plan, pendingOrder: created.pendingOrder, candle: triggerBar, recentCandles: [triggerBar], barIndex: 20, timeframe: '15m',
      gate: () => ({ approved: true, quantity: 2 }),
    });
    expect(sameCandle.fill).toBeUndefined();
    expect(sameCandle.reason).toContain('creation candle');
  });

  it('fills only on a later candle and applies slippage and fees', () => {
    const triggerBar = bar(900);
    const created = advanceTradePlan({
      plan, candle: triggerBar, recentCandles: [triggerBar], barIndex: 20, timeframe: '15m',
      gate: () => ({ approved: true, quantity: 2 }),
    });
    const nextBar = bar(1800, { open: 102, high: 104, low: 101, close: 103 });
    const filled = advanceTradePlan({
      plan: created.plan, pendingOrder: created.pendingOrder, candle: nextBar, recentCandles: [triggerBar, nextBar], barIndex: 21, timeframe: '15m',
      gate: () => ({ approved: true, quantity: 2 }),
    });
    expect(filled.plan.status).toBe('OPEN');
    expect(filled.pendingOrder?.status).toBe('filled');
    expect(filled.fill?.price).toBeGreaterThan(nextBar.open);
    expect(filled.fill?.fee).toBeGreaterThan(0);
  });

  it('fills a gapped limit order at the open before applying slippage', () => {
    const pendingOrder: PendingPaperOrder = {
      id: 'order-1', planId: plan.id, accountId: plan.accountId, symbol: plan.symbol, side: 'long',
      orderType: 'limit', price: 100, quantity: 1, createdAtBar: 3, expiresAtBar: 10, status: 'pending',
    };
    const gapBar = bar(240, { open: 97, low: 96, high: 99, close: 98 });
    const result = advanceTradePlan({
      plan: { ...plan, status: 'PENDING_ORDER' }, pendingOrder, candle: gapBar, recentCandles: [gapBar], barIndex: 4, timeframe: '15m',
      gate: () => ({ approved: true, quantity: 1 }),
    });
    expect(result.fill?.price).toBeLessThan(100);
  });

  it('rejects a pending fill when the current entry gate blocks it', () => {
    const pendingOrder: PendingPaperOrder = {
      id: 'order-event', planId: plan.id, accountId: plan.accountId, symbol: plan.symbol, side: 'long',
      orderType: 'stop_entry', price: 100, quantity: 1, createdAtBar: 19, expiresAtBar: 50, status: 'pending',
    };
    const result = advanceTradePlan({
      plan: { ...plan, status: 'PENDING_ORDER' }, pendingOrder, candle: bar(900), recentCandles: [bar(900)],
      barIndex: 20, timeframe: '15m',
      gate: () => ({ approved: false, quantity: 0, reason: 'Entry blocked by event blackout.', activeEventIds: ['event-1'] }),
    });
    expect(result.fill).toBeUndefined();
    expect(result.plan.status).toBe('PENDING_ORDER');
    expect(result.plan.lastReason).toBe('Entry blocked by event blackout.');
    expect(result.plan.activeEventIds).toEqual(['event-1']);
  });

  it('rejects an entry when gates fail and keeps the plan armed', () => {
    const result = advanceTradePlan({
      plan, candle: bar(900), recentCandles: [bar(900)], barIndex: 20, timeframe: '15m',
      gate: () => ({ approved: false, quantity: 0, reason: 'stale data' }),
    });
    expect(result.plan.status).toBe('ARMED');
    expect(result.pendingOrder).toBeUndefined();
    expect(result.reason).toBe('stale data');
  });
});
