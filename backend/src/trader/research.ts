// Computes sample-aware research metrics from stored journal outcomes.
import { traderConfig } from './config';

export interface JournalSample {
  rMultiple: number;
  pnl: number;
  barsHeld: number;
  symbol: string;
  setupType: string;
  regime: string;
  grade: string;
  probability?: number;
  outcome?: 0 | 1;
}

export interface ResearchMetrics {
  sampleSize: number;
  insufficientSample: boolean;
  sampleWarning?: string;
  expectancyR: number | null;
  winRate?: number;
  averageWinR: number | null;
  averageLossR: number | null;
  profitFactor: number | null;
  maxDrawdownR: number;
  timeInMarket: number | null;
  bootstrapExpectancy95: { lower: number; upper: number } | null;
  brierScore: number | null;
  reliabilityBins: Array<{ lowerProbability: number; upperProbability: number; count: number; meanProbability: number; observedFrequency: number }>;
  bySetup: Record<string, { count: number; expectancyR: number }>;
  byRegime: Record<string, { count: number; expectancyR: number }>;
  bySymbol: Record<string, { count: number; expectancyR: number }>;
  byGrade: Record<string, { count: number; expectancyR: number }>;
}

function groupedExpectancy(samples: JournalSample[], key: (sample: JournalSample) => string): Record<string, { count: number; expectancyR: number }> {
  const groups = new Map<string, number[]>();
  for (const sample of samples) groups.set(key(sample), [...(groups.get(key(sample)) ?? []), sample.rMultiple]);
  return Object.fromEntries([...groups].map(([name, values]) => [name, {
    count: values.length,
    expectancyR: values.reduce((sum, value) => sum + value, 0) / values.length,
  }]));
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] ?? 0;
}

function bootstrapInterval(values: number[], iterations: number, seed: number, confidenceLevel: number): { lower: number; upper: number } | null {
  if (values.length === 0) return null;
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
  const means = Array.from({ length: iterations }, () => {
    let total = 0;
    for (let draw = 0; draw < values.length; draw += 1) total += values[Math.floor(random() * values.length)] ?? 0;
    return total / values.length;
  }).sort((left, right) => left - right);
  const tail = (1 - confidenceLevel) / 2;
  return { lower: percentile(means, tail), upper: percentile(means, 1 - tail) };
}

export function computeResearchMetrics(
  samples: JournalSample[],
  totalObservedBars: number,
  minimumTrades = traderConfig.MIN_TRADES_FOR_STATS,
  iterations = traderConfig.BOOTSTRAP_ITERATIONS,
  seed = traderConfig.RESEARCH_RANDOM_SEED,
): ResearchMetrics {
  const valid = samples.filter((sample) => Number.isFinite(sample.rMultiple) && Number.isFinite(sample.pnl) && Number.isFinite(sample.barsHeld));
  const count = valid.length;
  const wins = valid.filter((sample) => sample.rMultiple > 0).map((sample) => sample.rMultiple);
  const losses = valid.filter((sample) => sample.rMultiple < 0).map((sample) => sample.rMultiple);
  const grossWins = wins.reduce((sum, value) => sum + value, 0);
  const grossLosses = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const cumulativeR = valid.reduce<number[]>((curve, sample) => [...curve, (curve.at(-1) ?? 0) + sample.rMultiple], [0]);
  let peak = 0;
  let maxDrawdownR = 0;
  for (const value of cumulativeR) {
    peak = Math.max(peak, value);
    maxDrawdownR = Math.max(maxDrawdownR, peak - value);
  }
  const calibrated = valid.filter((sample) => sample.probability !== undefined && sample.outcome !== undefined
    && Number.isFinite(sample.probability) && sample.probability >= 0 && sample.probability <= 1);
  const brierScore = calibrated.length
    ? calibrated.reduce((sum, sample) => sum + (sample.probability! - sample.outcome!) ** 2, 0) / calibrated.length
    : null;
  const binCount = traderConfig.CALIBRATION_RELIABILITY_BINS;
  const reliabilityBins = Array.from({ length: binCount }, (_, index) => {
    const lowerProbability = index / binCount;
    const upperProbability = (index + 1) / binCount;
    const values = calibrated.filter((sample) => sample.probability! >= lowerProbability
      && (index === 9 ? sample.probability! <= upperProbability : sample.probability! < upperProbability));
    return {
      lowerProbability,
      upperProbability,
      count: values.length,
      meanProbability: values.length ? values.reduce((sum, sample) => sum + sample.probability!, 0) / values.length : 0,
      observedFrequency: values.length ? values.reduce((sum, sample) => sum + sample.outcome!, 0) / values.length : 0,
    };
  });
  const insufficientSample = count < minimumTrades;
  return {
    sampleSize: count,
    insufficientSample,
    sampleWarning: insufficientSample ? `INSUFFICIENT SAMPLE (n < ${minimumTrades})` : undefined,
    expectancyR: average(valid.map((sample) => sample.rMultiple)),
    winRate: insufficientSample || count === 0 ? undefined : wins.length / count,
    averageWinR: average(wins),
    averageLossR: average(losses),
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : null,
    maxDrawdownR,
    timeInMarket: totalObservedBars > 0 ? valid.reduce((sum, sample) => sum + sample.barsHeld, 0) / totalObservedBars : null,
    bootstrapExpectancy95: insufficientSample ? null : bootstrapInterval(valid.map((sample) => sample.rMultiple), iterations, seed, traderConfig.BOOTSTRAP_CONFIDENCE_LEVEL),
    brierScore,
    reliabilityBins,
    bySetup: groupedExpectancy(valid, (sample) => sample.setupType),
    byRegime: groupedExpectancy(valid, (sample) => sample.regime),
    bySymbol: groupedExpectancy(valid, (sample) => sample.symbol),
    byGrade: groupedExpectancy(valid, (sample) => sample.grade),
  };
}

export function createDailyReview(input: {
  accountId: string;
  reviewDate: string;
  planReasons: string[];
  metrics: ResearchMetrics;
}) {
  const noTradeReasons = input.planReasons.reduce<Record<string, number>>((counts, reason) => {
    counts[reason] = (counts[reason] ?? 0) + 1;
    return counts;
  }, {});
  return {
    accountId: input.accountId,
    reviewDate: input.reviewDate,
    metrics: input.metrics,
    noTradeReasons,
    generatedAt: new Date().toISOString(),
  };
}

export interface PromotionEvidence {
  hypothesisRegisteredAt: string;
  forwardStartAt: string;
  forwardEndAt: string;
  forwardTrades: Array<{ rMultipleAfterCosts: number; costsIncluded: boolean }>;
  buyAndHoldExpectancyR: number;
  randomBaselineExpectancyR: number;
  randomBaselineRuns: number;
  triedSetupCount: number;
}

export interface PromotionDecision {
  promoted: boolean;
  reasons: string[];
  forwardTradeCount: number;
  forwardDays: number;
  multipleTestingNote: string;
}

/** Reproducible bootstrap of random entry indices; callers score each index with the same replay core. */
export function seededRandomEntryRuns(input: { candleCount: number; entriesPerRun: number; runs?: number; seed?: number }): number[][] {
  const runs = input.runs ?? traderConfig.MIN_RANDOM_BASELINE_RUNS;
  if (![input.candleCount, input.entriesPerRun, runs].every(Number.isInteger)
    || input.candleCount < 1 || input.entriesPerRun < 1 || input.entriesPerRun > input.candleCount || runs < 1) {
    throw new Error('Random baseline sizes must be positive integers and entries cannot exceed candles.');
  }
  let state = (input.seed ?? traderConfig.RESEARCH_RANDOM_SEED) >>> 0;
  const random = () => { state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0; return state / 4_294_967_296; };
  return Array.from({ length: runs }, () => {
    const indices = Array.from({ length: input.candleCount }, (_, index) => index);
    for (let index = 0; index < input.entriesPerRun; index += 1) {
      const swapIndex = index + Math.floor(random() * (input.candleCount - index));
      [indices[index], indices[swapIndex]] = [indices[swapIndex]!, indices[index]!];
    }
    return indices.slice(0, input.entriesPerRun).sort((a, b) => a - b);
  });
}

export function evaluateSetupPromotion(evidence: PromotionEvidence): PromotionDecision {
  const registered = Date.parse(evidence.hypothesisRegisteredAt);
  const forwardStart = Date.parse(evidence.forwardStartAt);
  const forwardEnd = Date.parse(evidence.forwardEndAt);
  const forwardDays = Number.isFinite(forwardStart) && Number.isFinite(forwardEnd)
    ? Math.max(0, (forwardEnd - forwardStart) / 86_400_000)
    : 0;
  const trades = evidence.forwardTrades.filter((trade) => Number.isFinite(trade.rMultipleAfterCosts));
  const expectancy = trades.length ? trades.reduce((sum, trade) => sum + trade.rMultipleAfterCosts, 0) / trades.length : Number.NEGATIVE_INFINITY;
  const reasons: string[] = [];
  if (!Number.isFinite(registered) || !Number.isFinite(forwardStart) || registered >= forwardStart) reasons.push('Hypothesis was not registered before the forward test began.');
  if (trades.length < traderConfig.MIN_FORWARD_TRADES) reasons.push(`Forward trade count is below ${traderConfig.MIN_FORWARD_TRADES}.`);
  if (forwardDays < traderConfig.MIN_FORWARD_DAYS) reasons.push(`Forward test duration is below ${traderConfig.MIN_FORWARD_DAYS} days.`);
  if (trades.some((trade) => !trade.costsIncluded)) reasons.push('At least one forward result is missing fees or slippage.');
  if (!(expectancy > 0)) reasons.push('Forward expectancy after costs is not positive.');
  if (!(expectancy > evidence.buyAndHoldExpectancyR)) reasons.push('Forward expectancy does not beat buy-and-hold.');
  if (!(expectancy > evidence.randomBaselineExpectancyR)) reasons.push('Forward expectancy does not beat the random-entry baseline.');
  if (evidence.randomBaselineRuns < traderConfig.MIN_RANDOM_BASELINE_RUNS) reasons.push(`Random baseline has fewer than ${traderConfig.MIN_RANDOM_BASELINE_RUNS} seeded runs.`);
  if (!Number.isInteger(evidence.triedSetupCount) || evidence.triedSetupCount < 1) reasons.push('Tried setup count is missing.');
  return {
    promoted: reasons.length === 0,
    reasons,
    forwardTradeCount: trades.length,
    forwardDays,
    multipleTestingNote: `${evidence.triedSetupCount} setup/parameter variant(s) tried; multiple testing can inflate apparent results.`,
  };
}
