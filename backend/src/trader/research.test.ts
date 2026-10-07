// Covers sample-size honesty, deterministic confidence intervals, and measured calibration metrics.
import { describe, expect, it } from 'vitest';
import { computeResearchMetrics, createDailyReview, evaluateSetupPromotion, seededRandomEntryRuns, type JournalSample } from './research';
import { traderConfig } from './config';

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

  it('promotes only a pre-registered setup with enough forward evidence after costs and against both baselines', () => {
    const forwardTrades = Array.from({ length: traderConfig.MIN_FORWARD_TRADES }, () => ({ rMultipleAfterCosts: 0.2, costsIncluded: true }));
    const result = evaluateSetupPromotion({
      hypothesisRegisteredAt: '2026-01-01T00:00:00Z',
      forwardStartAt: '2026-01-02T00:00:00Z',
      forwardEndAt: new Date(Date.parse('2026-01-02T00:00:00Z') + traderConfig.MIN_FORWARD_DAYS * 86_400_000).toISOString(),
      forwardTrades,
      buyAndHoldExpectancyR: 0.05,
      randomBaselineExpectancyR: 0.1,
      randomBaselineRuns: traderConfig.MIN_RANDOM_BASELINE_RUNS,
      triedSetupCount: 4,
    });
    expect(result.promoted).toBe(true);
    expect(result.multipleTestingNote).toContain('4 setup/parameter variant(s) tried');
  });

  it('does not promote an in-sample hypothesis or a weak random baseline', () => {
    const result = evaluateSetupPromotion({
      hypothesisRegisteredAt: '2026-01-03T00:00:00Z',
      forwardStartAt: '2026-01-02T00:00:00Z',
      forwardEndAt: '2026-04-03T00:00:00Z',
      forwardTrades: Array.from({ length: traderConfig.MIN_FORWARD_TRADES }, () => ({ rMultipleAfterCosts: 0.2, costsIncluded: true })),
      buyAndHoldExpectancyR: 0.05,
      randomBaselineExpectancyR: 0.3,
      randomBaselineRuns: traderConfig.MIN_RANDOM_BASELINE_RUNS - 1,
      triedSetupCount: 2,
    });
    expect(result.promoted).toBe(false);
    expect(result.reasons).toContain('Hypothesis was not registered before the forward test began.');
    expect(result.reasons).toContain('Forward expectancy does not beat the random-entry baseline.');
  });

  it('generates seeded random-entry baselines reproducibly without duplicate entries', () => {
    const first = seededRandomEntryRuns({ candleCount: 30, entriesPerRun: 5, runs: 20, seed: 92 });
    expect(seededRandomEntryRuns({ candleCount: 30, entriesPerRun: 5, runs: 20, seed: 92 })).toEqual(first);
    expect(first.every((run) => run.length === 5 && new Set(run).size === 5)).toBe(true);
  });
});
