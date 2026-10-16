export interface ClassificationMetrics { accuracy: number; f1: number; samples: number }
export interface ReturnCalibrationBucket { lowerProbability: number; upperProbability: number; samples: number; expectedReturnPct: number | null }
export interface ChronologicalSampleSplit { train: number[]; validation: number[]; test: number[]; trainBoundary: number; testBoundary: number }

export function purgedChronologicalSplit(sampleIndices: number[], candleCount: number, horizon: number): ChronologicalSampleSplit {
  if (!Number.isInteger(candleCount) || candleCount < 1 || !Number.isInteger(horizon) || horizon < 1) {
    throw new Error('Candle count and prediction horizon must be positive integers.');
  }
  const trainBoundary = Math.floor(candleCount * 0.7);
  const testBoundary = Math.floor(candleCount * 0.85);
  const train: number[] = [];
  const validation: number[] = [];
  const test: number[] = [];
  sampleIndices.forEach((index, row) => {
    if (!Number.isInteger(index) || index < 0 || index + horizon >= candleCount) throw new Error('Sample indices must identify a valid forward-label window.');
    if (index < trainBoundary && index + horizon < trainBoundary) train.push(row);
    else if (index >= trainBoundary && index < testBoundary && index + horizon < testBoundary) validation.push(row);
    else if (index >= testBoundary) test.push(row);
  });
  return { train, validation, test, trainBoundary, testBoundary };
}

export function classificationMetrics(predictions: number[], labels: number[]): ClassificationMetrics {
  if (predictions.length !== labels.length) throw new Error('Predictions and labels must have the same length.');
  if (labels.length === 0) throw new Error('Cannot evaluate an empty test set.');
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  for (let index = 0; index < labels.length; index += 1) {
    const predicted = predictions[index];
    const actual = labels[index];
    if ((predicted !== 0 && predicted !== 1) || (actual !== 0 && actual !== 1)) throw new Error('Classification values must be binary.');
    if (predicted === 1 && actual === 1) truePositive += 1;
    else if (predicted === 1) falsePositive += 1;
    else if (actual === 0) trueNegative += 1;
    else falseNegative += 1;
  }
  const precision = truePositive / (truePositive + falsePositive || 1);
  const recall = truePositive / (truePositive + falseNegative || 1);
  return {
    accuracy: (truePositive + trueNegative) / labels.length,
    f1: 2 * precision * recall / (precision + recall || 1),
    samples: labels.length,
  };
}

export function momentumBaselineAccuracy(lastCandleReturns: number[], labels: number[]): number {
  if (lastCandleReturns.length !== labels.length) throw new Error('Baseline returns and labels must have the same length.');
  return classificationMetrics(lastCandleReturns.map((value) => value > 0 ? 1 : 0), labels).accuracy;
}

export function modelHasNoEdge(testAccuracy: number, baselineAccuracy: number): boolean {
  if (![testAccuracy, baselineAccuracy].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error('Model and baseline accuracies must be between zero and one.');
  }
  return testAccuracy <= baselineAccuracy;
}

export function calibrateExpectedReturns(probabilities: number[], forwardReturns: number[], minimumBucketSamples = 10): ReturnCalibrationBucket[] {
  if (probabilities.length !== forwardReturns.length) throw new Error('Calibration probabilities and returns must have the same length.');
  if (!Number.isInteger(minimumBucketSamples) || minimumBucketSamples < 1) throw new Error('Minimum calibration bucket size must be a positive integer.');
  const buckets = [
    { lowerProbability: 0, upperProbability: 1 / 3 },
    { lowerProbability: 1 / 3, upperProbability: 2 / 3 },
    { lowerProbability: 2 / 3, upperProbability: 1.0000001 },
  ];
  return buckets.map(({ lowerProbability, upperProbability }) => {
    const values = probabilities.flatMap((probability, index) => {
      const value = forwardReturns[index]!;
      if (!Number.isFinite(probability) || probability < 0 || probability > 1 || !Number.isFinite(value)) throw new Error('Calibration inputs must be finite and in range.');
      return probability >= lowerProbability && probability < upperProbability ? [value] : [];
    });
    const expectedReturnPct = values.length >= minimumBucketSamples
      ? values.reduce((sum, value) => sum + value, 0) / values.length * 100
      : null;
    return { lowerProbability, upperProbability: Math.min(1, upperProbability), samples: values.length, expectedReturnPct };
  });
}

export function calibratedExpectedMove(probability: number, buckets: ReturnCalibrationBucket[]): number | null {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error('Prediction probability must be between zero and one.');
  const bucket = buckets.find((candidate, index) => probability >= candidate.lowerProbability
    && (probability < candidate.upperProbability || (index === buckets.length - 1 && probability === 1)));
  return bucket?.expectedReturnPct ?? null;
}
