// Covers sample-size honesty, deterministic confidence intervals, and measured calibration metrics.
import { describe, expect, it } from 'vitest';
import { computeResearchMetrics, createDailyReview, type JournalSample } from './research';

const samples: JournalSample[] = [
  { rMultiple: 1, pnl: 100, barsHeld: 4, symbol: 'BTCUSD', setupType: 'trend-pullback', regime: 'trending', grade: 'A', probability: 0.8, outcome: 1 },
  { rMultiple: -0.5, pnl: -50, barsHeld: 2, symbol: 'ETHUSD', setupType: 'trend-pullback', regime: 'ranging', grade: 'B', probability: 0.7, outcome: 0 },
  { rMultiple: 0.5, pnl: 50, barsHeld: 3, symbol: 'BTCUSD', setupType: 'trend-pullback', regime: 'trending', grade: 'A', probability: 0.6, outcome: 1 },
];

describe('Trader Desk research metrics', () => {
  it('suppresses win rate and confidence intervals below the minimum sample', () => {
    const result = computeResearchMetrics(samples.slice(0, 2), 100, 3, 100, 42);
    expect(result.sampleWarning).toBe('INSUFFICIENT SAMPLE (n < 3)');
    expect(result.winRate).toBeUndefined();
    expect(result.bootstrapExpectancy95).toBeNull();
  });

  it('returns reproducible bootstrap intervals and grouped metrics at sufficient sample size', () => {
    const first = computeResearchMetrics(samples, 100, 3, 200, 17);
    const second = computeResearchMetrics(samples, 100, 3, 200, 17);
    expect(first.bootstrapExpectancy95).toEqual(second.bootstrapExpectancy95);
    expect(first.expectancyR).toBeCloseTo(1 / 3);
    expect(first.winRate).toBeCloseTo(2 / 3);
    expect(first.brierScore).toBeGreaterThan(0);
    expect(first.bySymbol.BTCUSD?.count).toBe(2);
  });

  it('builds a computed daily no-trade summary', () => {
    const metrics = computeResearchMetrics(samples, 100, 3, 100, 2);
    const review = createDailyReview({ accountId: 'owner-1', reviewDate: '2026-10-06', planReasons: ['No plan', 'No plan', 'RR too low'], metrics });
    expect(review.noTradeReasons).toEqual({ 'No plan': 2, 'RR too low': 1 });
    expect(review.metrics).toBe(metrics);
  });
});
