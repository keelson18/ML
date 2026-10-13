import { describe, expect, it, vi } from 'vitest';
import { advanceStoredTradePlans, closeOpenPaperPosition, getAccount, manageOpenPositions, markCandleProcessed, storeTradePlan, wasCandleProcessed } from './paperTradingService';
import { fetchMarketData } from './marketDataService';
import type { TradePlan } from '../trader/types';
import { traderConfig } from '../trader/config';

vi.mock('./marketAvailability', () => ({ getMarketAvailability: () => [{ symbol: 'BTCUSD', status: 'available', checkedAt: 1 }] }));
vi.mock('./marketDataService', () => ({ fetchMarketData: vi.fn() }));

describe('backend paper position lifecycle', () => {
  it('rejects a forming candle before loading plans or touching account state', async () => {
    const accountId = `forming-execution-${Date.now()}`;
    const forming = { time: Math.floor(Date.now() / 900_000) * 900, open: 99, high: 101, low: 98, close: 101, volume: 100 };
    await expect(advanceStoredTradePlans({ accountId, symbol: 'BTCUSD', timeframe: '15m', candle: forming, candles: [forming], shadowMode: false }))
      .rejects.toThrow('boundary-verified closed candle');
    expect((await getAccount(accountId)).positions).toHaveLength(0);
  });

  it('connects stored plans to gated, next-candle paper fills and records the order', async () => {
    const accountId = `plan-fill-${Date.now()}`;
    const oldPromotions = traderConfig.PROMOTED_SETUP_TYPES;
    traderConfig.PROMOTED_SETUP_TYPES = ['trend-pullback'];
    const timeframeSeconds = 900;
    const triggerTime = Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000 / timeframeSeconds) * timeframeSeconds;
    const plan: TradePlan = {
      id: `plan-${accountId}`, accountId, symbol: 'BTCUSD', side: 'long', setupType: 'trend-pullback', htfBias: 'bull',
      zone: { low: 98, high: 100 }, trigger: { kind: 'close_above_level', level: 100 }, invalidation: 95,
      targets: [{ price: 110, fractionOfPosition: 1 }], minRR: 2, expiresAtBar: Math.floor(triggerTime / timeframeSeconds) + 20,
      thesis: 'registered test plan', falsification: 'close below 95', grade: 'A', status: 'WATCHING',
      contextSnapshot: {}, engineVersions: { planner: 'test' }, datasetId: 'dataset-test',
      createdAt: new Date(triggerTime * 1000).toISOString(), updatedAt: new Date(triggerTime * 1000).toISOString(),
    };
    try {
      await storeTradePlan(accountId, plan);
      const first = { time: triggerTime, open: 99, high: 101, low: 98, close: 101, volume: 100 };
      const armed = await advanceStoredTradePlans({ accountId, symbol: plan.symbol, timeframe: '15m', candle: first, candles: [first], shadowMode: false });
      expect(armed.plans[0]?.status).toBe('PENDING_ORDER');
      expect(armed.orders[0]?.status).toBe('pending');
      expect((await getAccount(accountId)).positions).toHaveLength(0);

      const next = { time: triggerTime + timeframeSeconds, open: 101, high: 105, low: 101, close: 104, volume: 100 };
      const filled = await advanceStoredTradePlans({ accountId, symbol: plan.symbol, timeframe: '15m', candle: next, candles: [first, next], shadowMode: false });
      expect(filled.filled).toBe(1);
      expect(filled.plans[0]?.status).toBe('OPEN');
      expect(filled.orders[0]?.status).toBe('filled');
      expect((await getAccount(accountId)).positions[0]).toMatchObject({ status: 'open', planId: plan.id, stopLoss: 95 });
      const retry = await advanceStoredTradePlans({ accountId, symbol: plan.symbol, timeframe: '15m', candle: next, candles: [first, next], shadowMode: false });
      expect(retry.filled).toBe(0);
      expect((await getAccount(accountId)).positions.filter((position) => position.status === 'open')).toHaveLength(1);

      const now = Date.now();
      const forming = { time: Math.floor(now / 60_000) * 60, open: 104, high: 112, low: 103, close: 111, volume: 100 };
      vi.mocked(fetchMarketData).mockResolvedValue({ candles: [forming], stale: true } as never);
      await expect(closeOpenPaperPosition(accountId, plan.symbol)).rejects.toThrow('fresh, closed market price');
      vi.mocked(fetchMarketData).mockResolvedValue({ candles: [forming], stale: false } as never);
      await expect(closeOpenPaperPosition(accountId, plan.symbol)).rejects.toThrow('fresh, closed market price');
      expect((await getAccount(accountId)).positions.find((position) => position.status === 'open')).toBeDefined();

      const exit = { time: triggerTime + timeframeSeconds * 2, open: 104, high: 112, low: 103, close: 111, volume: 100 };
      const closed = await manageOpenPositions(accountId, plan.symbol, exit, [first, next, exit], false, '5m');
      expect(closed).toHaveLength(1);
      expect((await getAccount(accountId)).tradePlans?.find((candidate) => candidate.id === plan.id)?.status).toBe('CLOSED');
      const journal = (await getAccount(accountId)).tradeJournal;
      expect(journal).toHaveLength(1);
      expect(journal?.[0]?.metrics).toMatchObject({ maeR: expect.any(Number), mfeR: expect.any(Number) });
      expect(journal?.[0]?.datasetId).toBe('dataset-test');
      expect(journal?.[0]?.engineVersions).toEqual({ planner: 'test' });
    } finally { traderConfig.PROMOTED_SETUP_TYPES = oldPromotions; }
  });

  it('keeps a would-have-filled order in shadow mode without creating a position', async () => {
    const accountId = `plan-shadow-${Date.now()}`;
    const oldPromotions = traderConfig.PROMOTED_SETUP_TYPES;
    traderConfig.PROMOTED_SETUP_TYPES = ['trend-pullback'];
    const triggerTime = Math.floor(Date.parse('2026-01-02T00:00:00Z') / 1000 / 900) * 900;
    const plan: TradePlan = {
      id: `plan-${accountId}`, accountId, symbol: 'BTCUSD', side: 'long', setupType: 'trend-pullback', htfBias: 'bull',
      zone: { low: 98, high: 100 }, trigger: { kind: 'close_above_level', level: 100 }, invalidation: 95,
      targets: [{ price: 110, fractionOfPosition: 1 }], minRR: 2, expiresAtBar: Math.floor(triggerTime / 900) + 20,
      thesis: 'shadow plan', falsification: 'close below 95', grade: 'A', status: 'WATCHING', contextSnapshot: {},
      engineVersions: {}, datasetId: 'dataset-shadow', createdAt: new Date(triggerTime * 1000).toISOString(), updatedAt: new Date(triggerTime * 1000).toISOString(),
    };
    try {
      await storeTradePlan(accountId, plan);
      const candle = { time: triggerTime, open: 99, high: 101, low: 98, close: 101, volume: 100 };
      const result = await advanceStoredTradePlans({ accountId, symbol: plan.symbol, timeframe: '15m', candle, candles: [candle], shadowMode: true });
      expect(result.shadowSignals).toHaveLength(1);
      expect((await getAccount(accountId)).positions).toHaveLength(0);
      expect((await getAccount(accountId)).shadowSignals).toHaveLength(1);
    } finally { traderConfig.PROMOTED_SETUP_TYPES = oldPromotions; }
  });
  it('keeps planner, executor, and manager candle checkpoints independent', async () => {
    const accountId = `roles-${Date.now()}`;
    await markCandleProcessed(accountId, 'BTCUSD', '15m', 900, 'executor');
    expect(await wasCandleProcessed(accountId, 'BTCUSD', '15m', 900, 'executor')).toBe(true);
    expect(await wasCandleProcessed(accountId, 'BTCUSD', '15m', 900, 'planner')).toBe(false);
    expect(await wasCandleProcessed(accountId, 'BTCUSD', '15m', 900, 'manager')).toBe(false);
  });
});
