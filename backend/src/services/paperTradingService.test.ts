import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceStoredTradePlans as advanceVerifiedTradePlans, assertPaperAccountIntegrity, closeOpenPaperPosition, getAccount, manageOpenPositions, markCandleProcessed, storeTradePlan, wasCandleProcessed } from './paperTradingService';
import { fetchMarketData } from './marketDataService';
import { getSupabaseClient } from '../db';
import type { TradePlan } from '../trader/types';
import { traderConfig } from '../trader/config';
import { calculatePositionSize } from '../trader/risk';

// Unit fixtures use historical synthetic candles; every normal fixture explicitly
// represents an upstream freshness-approved candle unless the test overrides it.
const advanceStoredTradePlans: typeof advanceVerifiedTradePlans = (input) => advanceVerifiedTradePlans({
  ...input,
  entriesAllowed: input.entriesAllowed ?? true,
});

let availabilityStatus = 'verified';
vi.mock('./marketAvailability', () => ({ getMarketAvailability: () => [{ symbol: 'BTCUSD', status: availabilityStatus, checkedAt: 1 }, { symbol: 'ETHUSD', status: availabilityStatus, checkedAt: 1 }] }));
vi.mock('./marketDataService', () => ({ fetchMarketData: vi.fn() }));
vi.mock('../db', () => ({ getSupabaseClient: vi.fn() }));
beforeEach(() => {
  vi.mocked(getSupabaseClient).mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [{ ok: true }], error: null }) } as never);
});

describe('paper account entry integrity gate', () => {
  it('requires both accounting reconciliation and a verified database ledger', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ok: true }], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never);
    const account = { accountId: 'integrity-ok', cash: traderConfig.TRADER_STARTING_EQUITY, positions: [], trades: [] };

    await expect(assertPaperAccountIntegrity(account.accountId, account)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('verify_decision_ledger', { p_account_id: account.accountId });
  });

  it('blocks entry when ledger verification fails or cannot be read', async () => {
    const account = { accountId: 'integrity-broken', cash: traderConfig.TRADER_STARTING_EQUITY, positions: [], trades: [] };
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [{ ok: false }], error: null }) } as never);
    await expect(assertPaperAccountIntegrity(account.accountId, account)).rejects.toThrow(/ledger verification failed/);

    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'unavailable' } }) } as never);
    await expect(assertPaperAccountIntegrity(account.accountId, account)).rejects.toThrow(/ledger verification failed/);
  });

  it('blocks entry when account cash and positions fail reconciliation', async () => {
    const rpc = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never);
    const account = { accountId: 'account-unbalanced', cash: 1, positions: [], trades: [] };

    await expect(assertPaperAccountIntegrity(account.accountId, account)).rejects.toThrow(/reconciliation is broken/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not advance an eligible plan when database ledger verification fails', async () => {
    const accountId = `ledger-gate-${Date.now()}`;
    const time = Math.floor(Date.parse('2026-01-06T00:00:00Z') / 1000 / 900) * 900;
    const plan: TradePlan = {
      id: `plan-${accountId}`, accountId, symbol: 'BTCUSD', side: 'long', setupType: 'trend-pullback', htfBias: 'bull',
      zone: { low: 98, high: 100 }, trigger: { kind: 'close_above_level', level: 100 }, invalidation: 95,
      targets: [{ price: 110, fractionOfPosition: 1 }], minRR: 2, expiresAtBar: time / 900 + 20,
      thesis: 'ledger gate test', falsification: 'close below stop', grade: 'A', status: 'WATCHING', contextSnapshot: {},
      engineVersions: {}, datasetId: 'ledger-gate-test', createdAt: new Date(time * 1000).toISOString(), updatedAt: new Date(time * 1000).toISOString(),
    };
    await storeTradePlan(accountId, plan);
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [{ ok: false }], error: null }) } as never);
    const candle = { time, open: 99, high: 101, low: 98, close: 101, volume: 100 };

    await expect(advanceVerifiedTradePlans({ accountId, symbol: plan.symbol, timeframe: '15m', candle, candles: [candle], entriesAllowed: true }))
      .rejects.toThrow(/ledger verification failed/);
    expect((await getAccount(accountId)).tradePlans?.[0]?.status).toBe('WATCHING');
    expect((await getAccount(accountId)).processedCandles?.['BTCUSD:executor:15m']).toBeUndefined();
  });
});

describe('backend paper position lifecycle', () => {
  it.each([
    { status: 'unavailable', reason: /unavailable/ },
    { status: 'stale', reason: /stale/ },
    { status: 'error', reason: /failed/ },
  ])('blocks a $status market through the stored-plan executor', async ({ status, reason }) => {
    const accountId = `availability-${status}-${Date.now()}`;
    const oldPromotions = traderConfig.PROMOTED_SETUP_TYPES;
    traderConfig.PROMOTED_SETUP_TYPES = ['trend-pullback'];
    availabilityStatus = status;
    const time = Math.floor(Date.parse('2026-01-03T00:00:00Z') / 1000 / 900) * 900;
    const plan: TradePlan = {
      id: `plan-${accountId}`, accountId, symbol: 'BTCUSD', side: 'long', setupType: 'trend-pullback', htfBias: 'bull',
      zone: { low: 98, high: 100 }, trigger: { kind: 'close_above_level', level: 100 }, invalidation: 95,
      targets: [{ price: 110, fractionOfPosition: 1 }], minRR: 2, expiresAtBar: time / 900 + 20,
      thesis: 'availability test', falsification: 'close below stop', grade: 'A', status: 'WATCHING', contextSnapshot: {},
      engineVersions: {}, datasetId: 'availability-test', createdAt: new Date(time * 1000).toISOString(), updatedAt: new Date(time * 1000).toISOString(),
    };
    try {
      await storeTradePlan(accountId, plan);
      const candle = { time, open: 99, high: 101, low: 98, close: 101, volume: 100 };
      const result = await advanceStoredTradePlans({ accountId, symbol: plan.symbol, timeframe: '15m', candle, candles: [candle], shadowMode: false });
      expect(result.filled).toBe(0);
      expect(result.orders.filter((order) => order.status === 'pending')).toHaveLength(0);
      expect((await getAccount(accountId)).tradePlans?.[0]?.lastReason).toMatch(reason);
      expect((await getAccount(accountId)).positions).toHaveLength(0);
    } finally {
      availabilityStatus = 'verified';
      traderConfig.PROMOTED_SETUP_TYPES = oldPromotions;
    }
  });

  it('rejects short plans because the paper account is spot long only', async () => {
    const accountId = `short-plan-${Date.now()}`;
    const oldPromotions = traderConfig.PROMOTED_SETUP_TYPES;
    traderConfig.PROMOTED_SETUP_TYPES = ['trend-pullback'];
    const time = Math.floor(Date.parse('2026-01-04T00:00:00Z') / 1000 / 900) * 900;
    const plan: TradePlan = {
      id: `plan-${accountId}`, accountId, symbol: 'BTCUSD', side: 'short', setupType: 'trend-pullback', htfBias: 'bear',
      zone: { low: 98, high: 100 }, trigger: { kind: 'close_above_level', level: 100 }, invalidation: 105,
      targets: [{ price: 90, fractionOfPosition: 1 }], minRR: 2, expiresAtBar: time / 900 + 20,
      thesis: 'short rejection test', falsification: 'close above stop', grade: 'A', status: 'WATCHING', contextSnapshot: {},
      engineVersions: {}, datasetId: 'short-test', createdAt: new Date(time * 1000).toISOString(), updatedAt: new Date(time * 1000).toISOString(),
    };
    try {
      await storeTradePlan(accountId, plan);
      const candle = { time, open: 99, high: 101, low: 98, close: 101, volume: 100 };
      const result = await advanceStoredTradePlans({ accountId, symbol: plan.symbol, timeframe: '15m', candle, candles: [candle], shadowMode: false });
      expect(result.filled).toBe(0);
      expect(result.orders).toHaveLength(0);
      expect((await getAccount(accountId)).tradePlans?.[0]?.lastReason).toMatch(/only support long/);
      expect((await getAccount(accountId)).positions).toHaveLength(0);
    } finally { traderConfig.PROMOTED_SETUP_TYPES = oldPromotions; }
  });

  it('enforces the daily entry cap in the stored-plan execution path', async () => {
    const accountId = `daily-cap-${Date.now()}`;
    const oldPromotions = traderConfig.PROMOTED_SETUP_TYPES;
    const oldDailyCap = traderConfig.MAX_TRADES_PER_DAY;
    traderConfig.PROMOTED_SETUP_TYPES = ['trend-pullback'];
    traderConfig.MAX_TRADES_PER_DAY = 1;
    const time = Math.floor(Date.parse('2026-01-05T00:00:00Z') / 1000 / 900) * 900;
    const makePlan = (symbol: 'BTCUSD' | 'ETHUSD'): TradePlan => ({
      id: `plan-${accountId}-${symbol}`, accountId, symbol, side: 'long', setupType: 'trend-pullback', htfBias: 'bull',
      zone: { low: 98, high: 100 }, trigger: { kind: 'close_above_level', level: 100 }, invalidation: 95,
      targets: [{ price: 110, fractionOfPosition: 1 }], minRR: 2, expiresAtBar: time / 900 + 20,
      thesis: 'daily cap test', falsification: 'close below stop', grade: 'A', status: 'WATCHING', contextSnapshot: {},
      engineVersions: {}, datasetId: 'daily-cap-test', createdAt: new Date(time * 1000).toISOString(), updatedAt: new Date(time * 1000).toISOString(),
    });
    try {
      const firstPlan = makePlan('BTCUSD');
      await storeTradePlan(accountId, firstPlan);
      const candle = { time, open: 99, high: 101, low: 98, close: 101, volume: 100 };
      expect((await advanceStoredTradePlans({ accountId, symbol: 'BTCUSD', timeframe: '15m', candle, candles: [candle], shadowMode: false })).orders).toHaveLength(1);
      const next = { ...candle, time: time + 900, open: 100, high: 105, low: 100, close: 104 };
      expect((await advanceStoredTradePlans({ accountId, symbol: 'BTCUSD', timeframe: '15m', candle: next, candles: [candle, next], shadowMode: false })).filled).toBe(1);
      const secondPlan = makePlan('ETHUSD');
      await storeTradePlan(accountId, secondPlan);
      const secondTrigger = { ...candle, time: time + 1800 };
      const result = await advanceStoredTradePlans({ accountId, symbol: 'ETHUSD', timeframe: '15m', candle: secondTrigger, candles: [candle, next, secondTrigger], shadowMode: false });
      expect(result.filled).toBe(0);
      expect(result.orders.filter((order) => order.status === 'pending')).toHaveLength(0);
      expect((await getAccount(accountId)).tradePlans?.find((candidate) => candidate.id === secondPlan.id)?.lastReason).toMatch(/Daily trade cap reached/);
    } finally {
      traderConfig.PROMOTED_SETUP_TYPES = oldPromotions;
      traderConfig.MAX_TRADES_PER_DAY = oldDailyCap;
    }
  });

  it('blocks a new plan after a losing paper position reaches the loss-streak threshold', async () => {
    const accountId = `loss-streak-${Date.now()}`;
    const previous = {
      promotions: traderConfig.PROMOTED_SETUP_TYPES,
      streakLimit: traderConfig.LOSS_STREAK_LIMIT,
      cooldownBars: traderConfig.LOSS_STREAK_COOLDOWN_BARS,
      dailyCap: traderConfig.MAX_TRADES_PER_DAY,
      symbolDailyCap: traderConfig.MAX_TRADES_PER_SYMBOL_PER_DAY,
    };
    traderConfig.PROMOTED_SETUP_TYPES = ['trend-pullback'];
    traderConfig.LOSS_STREAK_LIMIT = 1;
    traderConfig.LOSS_STREAK_COOLDOWN_BARS = 24;
    traderConfig.MAX_TRADES_PER_DAY = 10;
    traderConfig.MAX_TRADES_PER_SYMBOL_PER_DAY = 10;
    const start = Math.floor(Date.parse('2026-01-05T00:00:00Z') / 1000 / 900) * 900;
    const makePlan = (id: string, time: number): TradePlan => ({
      id, accountId, symbol: 'BTCUSD', side: 'long', setupType: 'trend-pullback', htfBias: 'bull',
      zone: { low: 98, high: 100 }, trigger: { kind: 'close_above_level', level: 100 }, invalidation: 95,
      targets: [{ price: 110, fractionOfPosition: 1 }], minRR: 2, expiresAtBar: time / 900 + 20,
      thesis: 'loss lockout test', falsification: 'close below stop', grade: 'A', status: 'WATCHING', contextSnapshot: {},
      engineVersions: {}, datasetId: 'loss-lockout-test', createdAt: new Date(time * 1000).toISOString(), updatedAt: new Date(time * 1000).toISOString(),
    });
    try {
      const firstPlan = makePlan('loss-plan-first', start);
      await storeTradePlan(accountId, firstPlan);
      const trigger = { time: start, open: 99, high: 101, low: 98, close: 101, volume: 100 };
      await advanceStoredTradePlans({ accountId, symbol: firstPlan.symbol, timeframe: '15m', candle: trigger, candles: [trigger], shadowMode: false });
      const fill = { time: start + 900, open: 100, high: 104, low: 100, close: 103, volume: 100 };
      expect((await advanceStoredTradePlans({ accountId, symbol: firstPlan.symbol, timeframe: '15m', candle: fill, candles: [trigger, fill], shadowMode: false })).filled).toBe(1);
      const stop = { time: start + 1800, open: 94, high: 96, low: 93, close: 94, volume: 100 };
      expect(await manageOpenPositions(accountId, firstPlan.symbol, stop, [stop], [], '5m')).toHaveLength(1);

      const nextPlan = makePlan('loss-plan-next', start + 2700);
      await storeTradePlan(accountId, nextPlan);
      const nextTrigger = { time: start + 2700, open: 99, high: 101, low: 98, close: 101, volume: 100 };
      await advanceStoredTradePlans({ accountId, symbol: nextPlan.symbol, timeframe: '15m', candle: nextTrigger, candles: [nextTrigger], shadowMode: false });
      expect((await getAccount(accountId)).tradePlans?.find((plan) => plan.id === nextPlan.id)?.lastReason).toContain('Consecutive-loss lockout active');
      expect((await getAccount(accountId)).positions.filter((position) => position.status === 'open')).toHaveLength(0);
    } finally {
      traderConfig.PROMOTED_SETUP_TYPES = previous.promotions;
      traderConfig.LOSS_STREAK_LIMIT = previous.streakLimit;
      traderConfig.LOSS_STREAK_COOLDOWN_BARS = previous.cooldownBars;
      traderConfig.MAX_TRADES_PER_DAY = previous.dailyCap;
      traderConfig.MAX_TRADES_PER_SYMBOL_PER_DAY = previous.symbolDailyCap;
    }
  });

  it('rejects a forming candle before loading plans or touching account state', async () => {
    const accountId = `forming-execution-${Date.now()}`;
    const forming = { time: Math.floor(Date.now() / 900_000) * 900, open: 99, high: 101, low: 98, close: 101, volume: 100 };
    await expect(advanceStoredTradePlans({ accountId, symbol: 'BTCUSD', timeframe: '15m', candle: forming, candles: [forming], shadowMode: false }))
      .rejects.toThrow('boundary-verified closed candle');
    expect((await getAccount(accountId)).positions).toHaveLength(0);
  });

  it('fails closed when the caller marks a trigger candle as stale for new entries', async () => {
    const accountId = `stale-entry-${Date.now()}`;
    const priorPromotions = traderConfig.PROMOTED_SETUP_TYPES;
    traderConfig.PROMOTED_SETUP_TYPES = ['trend-pullback'];
    const time = Math.floor(Date.parse('2026-01-06T00:00:00Z') / 1000 / 900) * 900;
    const plan: TradePlan = {
      id: `plan-${accountId}`, accountId, symbol: 'BTCUSD', side: 'long', setupType: 'trend-pullback', htfBias: 'bull',
      zone: { low: 98, high: 100 }, trigger: { kind: 'close_above_level', level: 100 }, invalidation: 95,
      targets: [{ price: 110, fractionOfPosition: 1 }], minRR: 2, expiresAtBar: time / 900 + 20,
      thesis: 'stale candle test', falsification: 'close below stop', grade: 'A', status: 'WATCHING', contextSnapshot: {},
      engineVersions: {}, datasetId: 'stale-entry-test', createdAt: new Date(time * 1000).toISOString(), updatedAt: new Date(time * 1000).toISOString(),
    };
    try {
      await storeTradePlan(accountId, plan);
      const candle = { time, open: 99, high: 101, low: 98, close: 101, volume: 100 };
      const result = await advanceStoredTradePlans({ accountId, symbol: plan.symbol, timeframe: '15m', candle, candles: [candle], shadowMode: false, entriesAllowed: false });
      expect(result.filled).toBe(0);
      expect(result.orders).toHaveLength(0);
      expect((await getAccount(accountId)).positions).toHaveLength(0);
      expect((await getAccount(accountId)).tradePlans?.[0]?.lastReason).toContain('freshness was not verified');
    } finally { traderConfig.PROMOTED_SETUP_TYPES = priorPromotions; }
  });

  it('rejects malformed or non-finite market prices before changing account state', async () => {
    const invalidCandle = { time: 1_767_244_800, open: 100, high: 99, low: 98, close: 101, volume: 100 };
    await expect(advanceStoredTradePlans({ accountId: `invalid-price-${Date.now()}`, symbol: 'BTCUSD', timeframe: '15m', candle: invalidCandle, candles: [invalidCandle] }))
      .rejects.toThrow('valid finite OHLCV market price');
    const extreme = { ...invalidCandle, high: Number.MAX_VALUE, close: Number.MAX_VALUE };
    expect(calculatePositionSize({ equity: 100_000, entry: extreme.close, invalidation: 95, cash: 100_000, grossExposure: 0, symbolExposure: 0 }).accepted).toBe(false);
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

      const next = { time: triggerTime + timeframeSeconds, open: 100, high: 105, low: 100, close: 104, volume: 100 };
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
      const closed = await manageOpenPositions(accountId, plan.symbol, exit, [first, next, exit], [], '5m');
      expect(closed).toHaveLength(1);
      expect((await getAccount(accountId)).tradePlans?.find((candidate) => candidate.id === plan.id)?.status).toBe('CLOSED');
      const journal = (await getAccount(accountId)).tradeJournal;
      expect(journal).toHaveLength(1);
      expect(journal?.[0]?.metrics).toMatchObject({ maeR: expect.any(Number), mfeR: expect.any(Number) });
      expect(journal?.[0]?.datasetId).toBe('dataset-test');
      expect(journal?.[0]?.engineVersions).toEqual({ planner: 'test' });
    } finally { traderConfig.PROMOTED_SETUP_TYPES = oldPromotions; }
  });

  it('persists a closed 4h thesis breach and exits on the next management bar', async () => {
    const accountId = `thesis-invalidation-${Date.now()}`;
    const oldPromotions = traderConfig.PROMOTED_SETUP_TYPES;
    traderConfig.PROMOTED_SETUP_TYPES = ['trend-pullback'];
    const fourHourStart = Math.floor(Date.parse('2026-01-02T00:00:00Z') / 14_400_000) * 14_400;
    const triggerTime = fourHourStart + 900;
    const plan: TradePlan = {
      id: `plan-${accountId}`, accountId, symbol: 'BTCUSD', side: 'long', setupType: 'trend-pullback', htfBias: 'bull',
      zone: { low: 98, high: 100 }, trigger: { kind: 'close_above_level', level: 100 }, invalidation: 95,
      targets: [{ price: 110, fractionOfPosition: 1 }], minRR: 2, expiresAtBar: Math.floor(triggerTime / 900) + 20,
      thesis: 'invalidation lifecycle test', falsification: 'closed 4h candle below 95', grade: 'A', status: 'WATCHING', contextSnapshot: {},
      engineVersions: {}, datasetId: 'thesis-invalidation-test', createdAt: new Date(triggerTime * 1000).toISOString(), updatedAt: new Date(triggerTime * 1000).toISOString(),
    };
    try {
      await storeTradePlan(accountId, plan);
      const trigger = { time: triggerTime, open: 99, high: 101, low: 98, close: 101, volume: 100 };
      await advanceStoredTradePlans({ accountId, symbol: plan.symbol, timeframe: '15m', candle: trigger, candles: [trigger], shadowMode: false });
      const fill = { time: triggerTime + 900, open: 100, high: 104, low: 100, close: 103, volume: 100 };
      expect((await advanceStoredTradePlans({ accountId, symbol: plan.symbol, timeframe: '15m', candle: fill, candles: [trigger, fill], shadowMode: false })).filled).toBe(1);

      const invalidation = { time: fourHourStart, open: 96, high: 97, low: 93, close: 94, volume: 100 };
      const before = { time: fourHourStart + 14_100, open: 100, high: 101, low: 99, close: 100, volume: 100 };
      expect(await manageOpenPositions(accountId, plan.symbol, before, [before], [invalidation], '5m')).toHaveLength(0);
      expect((await getAccount(accountId)).positions.find((position) => position.status === 'open')?.thesisInvalidatedAt).toBeUndefined();

      const next = { time: fourHourStart + 14_400, open: 96, high: 98, low: 96, close: 97, volume: 100 };
      const closed = await manageOpenPositions(accountId, plan.symbol, next, [before, next], [invalidation], '5m');
      expect(closed).toHaveLength(1);
      expect(closed[0]?.exitReason).toBe('thesis-invalidated');
      const account = await getAccount(accountId);
      expect(account.positions.find((position) => position.status === 'closed')?.thesisInvalidatedAt)
        .toBe(new Date((fourHourStart + 14_400) * 1000).toISOString());
      expect(await manageOpenPositions(accountId, plan.symbol, next, [before, next], [invalidation], '5m')).toHaveLength(0);
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
