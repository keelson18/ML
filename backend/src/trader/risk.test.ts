// Validates stop-based equal-risk sizing, caps, and drawdown using marked equity.
import { describe, expect, it } from 'vitest';
import { calculatePositionSize, isLossStreakCooldownActive, markToMarket } from './risk';
import { riskIntelligenceEngine } from '../engines/risk-engine';

describe('Trader Desk risk calculations', () => {
  it('risks the same cash amount across narrow and wide stops when uncapped', () => {
    const narrow = calculatePositionSize({ equity: 100_000, entry: 10, invalidation: 9.5, cash: 100_000, grossExposure: 0, symbolExposure: 0 });
    const wide = calculatePositionSize({ equity: 100_000, entry: 10, invalidation: 8, cash: 100_000, grossExposure: 0, symbolExposure: 0 });
    expect(narrow.quantity * narrow.perUnitRisk).toBeCloseTo(500);
    expect(wide.quantity * wide.perUnitRisk).toBeCloseTo(500);
  });

  it('caps position size by available cash and exposure headroom', () => {
    const cashCapped = calculatePositionSize({ equity: 100_000, entry: 100, invalidation: 95, cash: 500, grossExposure: 0, symbolExposure: 0 });
    expect(cashCapped.accepted).toBe(true);
    expect(cashCapped.quantity * 100).toBeLessThan(500);
    const exposureCapped = calculatePositionSize({ equity: 100_000, entry: 100, invalidation: 99, cash: 100_000, grossExposure: 50_000, symbolExposure: 0 });
    expect(exposureCapped.accepted).toBe(false);
  });

  it('rejects a zero stop distance', () => {
    const result = calculatePositionSize({ equity: 100_000, entry: 100, invalidation: 100, cash: 100_000, grossExposure: 0, symbolExposure: 0 });
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('Invalid stop distance');
  });

  it.each([
    ['non-finite equity', { equity: Number.NaN }],
    ['negative cash', { cash: -1 }],
    ['missing exposure input', { grossExposure: Number.NaN }],
    ['negative exposure', { symbolExposure: -1 }],
    ['wrong-side stop', { invalidation: 101 }],
  ])('fails closed for %s', (_label, overrides) => {
    const result = calculatePositionSize({
      equity: 100_000, entry: 100, invalidation: 90, cash: 100_000, grossExposure: 0, symbolExposure: 0,
      ...overrides,
    });
    expect(result.accepted).toBe(false);
    expect(result.quantity).toBe(0);
  });

  it('includes unrealized losses in mark-to-market drawdown', () => {
    const snapshot = markToMarket({
      accountId: 'a', cash: 95_000, positions: [{
        id: 'p', symbol: 'BTCUSD', assetId: 'BTCUSD', side: 'buy', quantity: 50, entryPrice: 100,
        entryFee: 0, status: 'open', openedAt: new Date(0).toISOString(),
      }], trades: [],
    }, { BTCUSD: 80 });
    expect(snapshot.equity).toBe(99_000);
    expect(snapshot.unrealizedPnl).toBe(-1_000);
    expect(snapshot.drawdownPct).toBeCloseTo(1);
  });

  it('marks missing, zero, and non-finite position prices as incomplete risk inputs', () => {
    const account = {
      accountId: 'a', cash: 9_000, positions: [{
        id: 'p', symbol: 'BTCUSD', assetId: 'BTCUSD', side: 'buy' as const, quantity: 10, entryPrice: 100,
        entryFee: 0, status: 'open' as const, openedAt: new Date(0).toISOString(),
      }], trades: [],
    };

    expect(markToMarket(account, {}).missingMarkSymbols).toEqual(['BTCUSD']);
    expect(markToMarket(account, { BTCUSD: 0 }).missingMarkSymbols).toEqual(['BTCUSD']);
    expect(markToMarket(account, { BTCUSD: Number.POSITIVE_INFINITY }).missingMarkSymbols).toEqual(['BTCUSD']);
    expect(markToMarket(account, { BTCUSD: 80 }).missingMarkSymbols).toEqual([]);
  });

  it('starts a cooldown after the configured consecutive closed-position losses', () => {
    const trades = [
      { id: 't1', positionId: 'p1', symbol: 'BTCUSD', side: 'buy' as const, quantity: 1, entryPrice: 100, exitPrice: 99, fees: 0, slippage: 0, realizedPnl: -1, executionVersion: 'test', openedAt: '2026-01-01T00:00:00Z', closedAt: '2026-01-01T00:00:00Z', maeR: null, mfeR: null },
      { id: 't2', positionId: 'p2', symbol: 'BTCUSD', side: 'buy' as const, quantity: 1, entryPrice: 100, exitPrice: 99, fees: 0, slippage: 0, realizedPnl: -1, executionVersion: 'test', openedAt: '2026-01-01T00:15:00Z', closedAt: '2026-01-01T00:15:00Z', maeR: null, mfeR: null },
    ];
    const input = { trades, closedPositionIds: new Set(['p1', 'p2']), asOfMs: Date.parse('2026-01-01T00:30:00Z'), timeframe: '15m' as const, limit: 2, cooldownBars: 2 };
    expect(isLossStreakCooldownActive(input)).toBe(true);
    expect(isLossStreakCooldownActive({ ...input, asOfMs: Date.parse('2026-01-01T00:45:00Z') })).toBe(false);
  });

  it('does not count partial, future, or wins preceding the current losing streak', () => {
    const trade = (id: string, positionId: string, realizedPnl: number, closedAt: string) => ({
      id, positionId, symbol: 'BTCUSD', side: 'buy' as const, quantity: 1, entryPrice: 100, exitPrice: 99,
      fees: 0, slippage: 0, realizedPnl, executionVersion: 'test', openedAt: closedAt, closedAt, maeR: null, mfeR: null,
    });
    const trades = [
      trade('old-loss', 'p1', -1, '2026-01-01T00:00:00Z'),
      trade('win', 'p2', 1, '2026-01-01T00:15:00Z'),
      trade('latest-loss', 'p3', -1, '2026-01-01T00:30:00Z'),
      trade('future-loss', 'p4', -1, '2026-01-01T01:00:00Z'),
    ];
    expect(isLossStreakCooldownActive({ trades, closedPositionIds: new Set(['p1', 'p2', 'p3', 'p4']), asOfMs: Date.parse('2026-01-01T00:45:00Z'), timeframe: '15m', limit: 2, cooldownBars: 2 })).toBe(false);
    expect(isLossStreakCooldownActive({ trades: trades.slice(2, 3), closedPositionIds: new Set(), asOfMs: Date.parse('2026-01-01T00:45:00Z'), timeframe: '15m', limit: 1, cooldownBars: 2 })).toBe(false);
  });

  it('blocks a new proposal when the configured weekly loss stop is reached', () => {
    const result = riskIntelligenceEngine.analyze({
      inputContextId: 'weekly-stop', symbol: 'BTCUSD', timeframe: '1h', candles: [],
      risk: {
        trade: { size: 1, entryPrice: 100, stopLossPrice: 90, takeProfitPrice: 120, portfolioValue: 1_000 },
        state: { currentDailyPnL: 0, currentWeeklyPnL: -0.06, currentDrawdown: 0, currentExposure: 0, currentLeverage: 0 },
        limits: { maxDailyLoss: -0.02, maxWeeklyLoss: -0.05, maxDrawdown: -0.2, maxPortfolioExposure: 0.5, maxLeverage: 1, minRiskReward: 2 },
        ruleVersion: 'test',
      },
    });
    expect(result.result.approved).toBe(false);
    expect(result.result.violatedRules).toContain('Weekly loss limit reached');
  });
});
