import { describe, expect, it } from 'vitest';
import { calibratedExpectedMove, calibrateExpectedReturns, classificationMetrics, modelHasNoEdge, momentumBaselineAccuracy, purgedChronologicalSplit } from './ml-baseline';

describe('ML held-out benchmark metrics', () => {
  it('scores the previous-candle momentum baseline against the same labels', () => {
    expect(momentumBaselineAccuracy([0.1, -0.2, 0, 0.03], [1, 0, 1, 0])).toBe(0.5);
  });

  it('reports binary accuracy, F1, and sample count', () => {
    expect(classificationMetrics([1, 1, 0, 0], [1, 0, 0, 0])).toEqual({ accuracy: 0.75, f1: 2 / 3, samples: 4 });
  });

  it('marks a tie or a loss against momentum as no-edge', () => {
    expect(modelHasNoEdge(0.6, 0.6)).toBe(true);
    expect(modelHasNoEdge(0.55, 0.6)).toBe(true);
    expect(modelHasNoEdge(0.61, 0.6)).toBe(false);
  });

  it('purges forward-label windows across train, validation, and test boundaries', () => {
    const split = purgedChronologicalSplit(Array.from({ length: 95 }, (_, index) => index), 100, 5);
    expect(split.train.every((row) => row + 5 < split.trainBoundary)).toBe(true);
    expect(split.validation.every((row) => row >= split.trainBoundary && row + 5 < split.testBoundary)).toBe(true);
    expect(split.test.every((row) => row >= split.testBoundary)).toBe(true);
    expect(split.train.at(-1)).toBe(64);
    expect(split.validation.at(-1)).toBe(79);
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
