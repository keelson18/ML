import { describe, expect, it } from 'vitest';
import { calibratedExpectedMove, calibrateExpectedReturns, classificationMetrics, compareWithBaseline, momentumBaselineAccuracy, purgedChronologicalSplit } from './ml-baseline';

describe('ML held-out benchmark metrics', () => {
  it('scores the previous-candle momentum baseline against the same labels', () => {
    expect(momentumBaselineAccuracy([0.1, -0.2, 0, 0.03], [1, 0, 1, 0])).toBe(0.5);
  });

  it('reports binary accuracy, F1, and sample count', () => {
    expect(classificationMetrics([1, 1, 0, 0], [1, 0, 0, 0])).toEqual({ accuracy: 0.75, f1: 2 / 3, samples: 4 });
  });

  it('requires a large paired holdout and meaningful paired evidence before declaring a baseline win', () => {
    const labels = Array<number>(120).fill(1);
    const baseline = Array<number>(120).fill(0);
    const model = labels.map((_, index) => index < 70 ? 1 : 0);
    const comparison = compareWithBaseline(model, baseline, labels);
    expect(comparison).toMatchObject({ modelWins: 70, baselineWins: 0, discordantPairs: 70, beatsBaseline: true });
    expect(comparison.modelWinsLowerBound).toBeGreaterThan(0.5);

    expect(compareWithBaseline(model.slice(0, 99), baseline.slice(0, 99), labels.slice(0, 99)).beatsBaseline).toBe(false);
    const inconclusiveModel = labels.map((_, index) => index < 11 ? 1 : index < 20 ? 0 : 1);
    const inconclusiveBaseline = labels.map((_, index) => index < 11 ? 0 : index < 20 ? 1 : 1);
    expect(compareWithBaseline(inconclusiveModel, inconclusiveBaseline, labels).beatsBaseline).toBe(false);
  });

  it('rejects invalid paired benchmark samples', () => {
    expect(() => compareWithBaseline([1], [], [1])).toThrow(/same length/);
    expect(() => compareWithBaseline([2], [1], [1])).toThrow(/binary/);
    expect(() => compareWithBaseline([], [], [])).toThrow(/empty test set/);
  });

  it('purges forward-label windows across train, validation, and test boundaries', () => {
    const split = purgedChronologicalSplit(Array.from({ length: 95 }, (_, index) => index), 100, 5);
    expect(split.train.every((row) => row + 5 < split.trainBoundary)).toBe(true);
    expect(split.validation.every((row) => row >= split.trainBoundary && row + 5 < split.testBoundary)).toBe(true);
    expect(split.test.every((row) => row >= split.testBoundary)).toBe(true);
    expect(split.train.at(-1)).toBe(64);
    expect(split.validation.at(-1)).toBe(79);
  });

  it('rejects duplicate and out-of-order sample indices before splitting', () => {
    expect(() => purgedChronologicalSplit([10, 10, 11], 100, 5)).toThrow(/strictly increasing/);
    expect(() => purgedChronologicalSplit([11, 10], 100, 5)).toThrow(/strictly increasing/);
  });

  it('calibrates signed forward returns on validation probabilities and withholds sparse buckets', () => {
    const buckets = calibrateExpectedReturns(
      [...Array(10).fill(0.2), ...Array(3).fill(0.5), ...Array(10).fill(0.8)],
      [...Array(10).fill(0.01), ...Array(3).fill(-0.02), ...Array(10).fill(-0.03)],
    );
    expect(calibratedExpectedMove(0.2, buckets)).toBeCloseTo(1);
    expect(calibratedExpectedMove(0.5, buckets)).toBeNull();
    expect(calibratedExpectedMove(0.8, buckets)).toBeCloseTo(-3);
  });

  it('rejects mismatched and empty evaluation sets', () => {
    expect(() => momentumBaselineAccuracy([0.1], [])).toThrow(/same length/);
    expect(() => classificationMetrics([], [])).toThrow(/empty test set/);
  });
});
