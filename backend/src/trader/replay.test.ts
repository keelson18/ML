import { describe, expect, it } from 'vitest';
import type { Candle } from '../../../src/lib/types';
import type { TradePlan } from './types';
import { evaluateCostSensitivity, replayClosedCandles, walkForward } from './replay';

const plan: TradePlan = {
  id: 'replay-plan', accountId: 'paper', symbol: 'BTCUSD', side: 'long', setupType: 'trend-pullback', htfBias: 'bull',
  zone: { low: 98, high: 100 }, trigger: { kind: 'close_above_level', level: 100 }, invalidation: 95,
  targets: [{ price: 110, fractionOfPosition: 1 }], minRR: 2, expiresAtBar: 20, thesis: 'pre-registered', falsification: 'close below 95',
  grade: 'A', status: 'WATCHING', contextSnapshot: {}, engineVersions: { planner: 'test-1' }, datasetId: 'fixture-v1',
  createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
};
const bar = (time: number, values: Partial<Candle> = {}): Candle => ({ time, open: 99, high: 101, low: 98, close: 101, volume: 1_000, ...values });

describe('shared replay core', () => {
  it('limits planner visibility to closed candles and enforces next-bar fills', () => {
    const observedLengths: number[] = [];
    const result = replayClosedCandles({
      candles: [bar(900), bar(1800, { open: 101, high: 105, low: 101, close: 104 }), bar(2700, { open: 104, high: 112, low: 103, close: 111 })],
      datasetId: 'fixture-v1', shadowMode: false,
      plansAt: (history) => { observedLengths.push(history.length); return history.length === 1 ? [plan] : []; },
      gate: () => ({ approved: true, quantity: 1 }),
    });
    expect(observedLengths).toEqual([1, 2, 3]);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]?.entryTime).toBe(1800);
    expect(result.trades[0]?.exitTime).toBe(2700);
    expect(result.datasetId).toBe('fixture-v1');
    expect(result.configHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps cost sensitivity reproducible and records higher costs', () => {
    const input = {
      candles: [bar(900), bar(1800, { open: 101, high: 105, low: 101, close: 104 }), bar(2700, { open: 104, high: 112, low: 103, close: 111 })],
      datasetId: 'fixture-v1', shadowMode: false, plansAt: (history: Candle[]) => history.length === 1 ? [plan] : [],
      gate: () => ({ approved: true, quantity: 1 }), config: { feeRate: 0.001, slippageRate: 0.0005 },
    };
    const results = evaluateCostSensitivity(input);
    expect(results.doubledFees.configHash).not.toBe(results.base.configHash);
    expect(results.doubledFees.trades[0]!.pnlAfterCosts).toBeLessThan(results.base.trades[0]!.pnlAfterCosts);
    expect(results.doubledSlippage.trades[0]!.slippage).toBeGreaterThan(results.base.trades[0]!.slippage);
  });

  it('rejects nonchronological candles and builds strictly ordered walk-forward folds', () => {
    expect(() => replayClosedCandles({ candles: [bar(2), bar(1)], datasetId: 'bad' })).toThrow('strictly chronological');
    const folds = walkForward({ observations: Array.from({ length: 10 }, (_, index) => index), trainSize: 4, validationSize: 2, testSize: 2 });
    expect(folds).toEqual([{ train: [0, 1, 2, 3], validation: [4, 5], test: [6, 7] }, { train: [2, 3, 4, 5], validation: [6, 7], test: [8, 9] }]);
  });
});
