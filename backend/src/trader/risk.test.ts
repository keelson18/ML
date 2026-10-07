// Validates stop-based equal-risk sizing, caps, and drawdown using marked equity.
import { describe, expect, it } from 'vitest';
import { calculatePositionSize, markToMarket } from './risk';
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
