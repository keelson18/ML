import { createHash } from 'node:crypto';
import type { Candle, Timeframe } from '../../../src/lib/types';
import { candleSeconds } from './candle-math';
import { replayClosedCandles, type ReplayResult } from './replay';
import { createTradePlan } from './planner';
import { traderConfig } from './config';
import { seededRandomEntryRuns } from './research';

export interface ResearchSeriesSnapshot {
  timeframe: Timeframe;
  provider: string;
  dataVersion: string;
  fetchedAt: number;
  candles: Candle[];
}

export interface ResearchRunInput {
  symbol: string;
  triggerTimeframe: Timeframe;
  series: ResearchSeriesSnapshot[];
  trainingEndIndex: number;
  testStartIndex: number;
  experimentCreatedAt: string;
  feeRate: number;
  slippageRate: number;
  codeRevision: string;
}

export interface ResearchRunArtifact {
  pipelineVersion: string;
  symbol: string;
  triggerTimeframe: Timeframe;
  datasetId: string;
  datasetVersions: Array<{ timeframe: Timeframe; provider: string; dataVersion: string; fetchedAt: number }>;
  codeRevision: string;
  strategyVersion: string;
  engineVersions: Record<string, string>;
  configHash: string;
  split: { trainingEndIndex: number; testStartIndex: number; trainingEndTime: number; testStartTime: number; testEndTime: number };
  costs: { feeRate: number; slippageRate: number };
  metrics: { barsProcessed: number; tradeCount: number; expectancyR: number | null; profitFactor: number | null; maxDrawdownR: number; netR: number; testDays: number };
  baselines: { buyAndHoldExpectancyR: number | null; randomEntryExpectancyR: number | null; randomRuns: number; randomHoldingBars: number };
  validation: { passed: boolean; promotionEligible: boolean; reasons: string[] };
  replay: Pick<ReplayResult, 'trades' | 'finalPlans'>;
  snapshot: Array<{ timeframe: Timeframe; candles: Candle[] }>;
}

const PIPELINE_VERSION = 'chronological-paper-replay-v1';

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function summarize(result: ReplayResult, testStartIndex: number, bars: Candle[], timeframe: Timeframe) {
  const trades = result.trades;
  const rs = trades.map((trade) => trade.rMultipleAfterCosts).filter(Number.isFinite);
  const winners = rs.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const losers = Math.abs(rs.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  let cumulative = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  for (const value of rs) {
    cumulative += value;
    peak = Math.max(peak, cumulative);
    maxDrawdownR = Math.max(maxDrawdownR, peak - cumulative);
  }
  const testStart = bars[testStartIndex]?.time;
  const lastBar = bars.at(-1);
  const testEnd = lastBar ? lastBar.time + candleSeconds(timeframe, lastBar.time) : undefined;
  const testDays = testStart !== undefined && testEnd !== undefined ? Math.max(0, (testEnd - testStart) / 86_400) : 0;
  return {
    barsProcessed: bars.length - testStartIndex,
    tradeCount: rs.length,
    expectancyR: rs.length ? rs.reduce((sum, value) => sum + value, 0) / rs.length : null,
    profitFactor: losers > 0 ? winners / losers : null,
    maxDrawdownR,
    netR: rs.reduce((sum, value) => sum + value, 0),
    testDays,
  };
}

function dailyRandomBaseline(input: {
  bars: Candle[]; startIndex: number; holdingBars: number; runs: number; feeRate: number; slippageRate: number;
}): number | null {
  const lastStart = input.bars.length - input.holdingBars - 2;
  const eligibleCount = lastStart - input.startIndex + 1;
  if (eligibleCount < 1) return null;
  const indices = seededRandomEntryRuns({ candleCount: eligibleCount, entriesPerRun: 1, runs: input.runs, seed: traderConfig.RESEARCH_RANDOM_SEED });
  const results = indices.map(([relativeIndex]) => {
    const entry = input.bars[input.startIndex + relativeIndex! + 1]!;
    const exit = input.bars[input.startIndex + relativeIndex! + 1 + input.holdingBars]!;
    const buyCost = entry.open * (1 + input.slippageRate) * (1 + input.feeRate);
    const sellRevenue = exit.close * (1 - input.slippageRate) * (1 - input.feeRate);
    const initialRisk = entry.open * traderConfig.RISK_PER_TRADE_PCT / 100;
    return (sellRevenue - buyCost) / initialRisk;
  });
  return results.reduce((sum, value) => sum + value, 0) / results.length;
}

/** Runs the fixed, versioned paper planner against a provider candle snapshot; it accepts no caller results. */
export function runResearchReplay(input: ResearchRunInput): ResearchRunArtifact {
  const trigger = input.series.find((series) => series.timeframe === input.triggerTimeframe);
  const daily = input.series.find((series) => series.timeframe === '1d');
  const fourHour = input.series.find((series) => series.timeframe === '4h');
  const setup = input.series.find((series) => series.timeframe === traderConfig.SETUP_TIMEFRAME);
  if (!trigger || !daily || !fourHour || !setup) throw new Error('Research requires provider data for the 1h setup, 15m trigger, 4h, and 1d timeframes.');
  if (input.series.some((series) => series.candles.length === 0 || !series.provider || !series.dataVersion)) throw new Error('Research dataset provenance is incomplete.');
  if (new Set(input.series.map((series) => series.timeframe)).size !== input.series.length) throw new Error('Research dataset contains duplicate timeframe series.');
  if (new Set(input.series.map((series) => series.provider)).size !== 1) throw new Error('Research timeframe series must come from one provider.');
  for (const series of input.series) {
    for (let index = 0; index < series.candles.length; index += 1) {
      const candle = series.candles[index]!;
      if (![candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)
        || candle.close <= 0 || candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close)
        || (index > 0 && candle.time <= series.candles[index - 1]!.time)) {
        throw new Error(`Research ${series.timeframe} candles are invalid or not strictly chronological.`);
      }
    }
  }
  const bars = trigger.candles;
  if (!Number.isInteger(input.trainingEndIndex) || !Number.isInteger(input.testStartIndex)
    || input.trainingEndIndex < 1 || input.testStartIndex <= input.trainingEndIndex || input.testStartIndex >= bars.length) {
    throw new Error('Research training and untouched test boundaries are invalid.');
  }
  if (![input.feeRate, input.slippageRate].every((rate) => Number.isFinite(rate) && rate >= 0 && rate < 1)) throw new Error('Research costs are invalid.');
  if (!input.codeRevision || input.codeRevision === 'unknown') throw new Error('A source revision is required to reproduce research runs.');

  const datasetVersions = input.series.map(({ timeframe, provider, dataVersion, fetchedAt }) => ({ timeframe, provider, dataVersion, fetchedAt }))
    .sort((left, right) => left.timeframe.localeCompare(right.timeframe));
  const datasetId = `research:${hash(input.series.map(({ timeframe, provider, candles }) => ({ timeframe, provider, candles })))}`;
  const engineVersions: Record<string, string> = {};
  const plannerAt = (allowedFrom: number, allowedThrough: number) => {
    const evaluatedSetups = new Set<string>();
    return (history: Candle[], index: number) => {
      if (index < allowedFrom || index > allowedThrough) return [];
      const triggerBar = history.at(-1)!;
      const triggerCloseMs = (triggerBar.time + candleSeconds(input.triggerTimeframe, triggerBar.time)) * 1000;
      const throughClosed = (series: ResearchSeriesSnapshot) => series.candles.filter((candle) =>
        (candle.time + candleSeconds(series.timeframe, candle.time)) * 1000 <= triggerCloseMs);
      const latestSetup = throughClosed(setup).at(-1);
      const latestDaily = throughClosed(daily).at(-1);
      const latestFourHour = throughClosed(fourHour).at(-1);
      if (!latestSetup || !latestDaily || !latestFourHour) return [];
      const setupKey = `${latestDaily.time}:${latestFourHour.time}:${latestSetup.time}`;
      if (evaluatedSetups.has(setupKey)) return [];
      evaluatedSetups.add(setupKey);
      const result = createTradePlan({
        accountId: `research:${datasetId}`,
        symbol: input.symbol,
        triggerTimeframe: input.triggerTimeframe,
        triggerCandles: history,
        htfCandles: { '1d': throughClosed(daily), '4h': throughClosed(fourHour) },
        setupCandles: throughClosed(setup),
        datasetId,
      });
      if (!result.plan) return [];
      Object.assign(engineVersions, result.plan.engineVersions);
      const deterministicTime = new Date(triggerBar.time * 1000).toISOString();
      return [{ ...result.plan, createdAt: deterministicTime, updatedAt: deterministicTime,
        createdAtBar: index, expiresAtBar: Math.min(result.plan.expiresAtBar, index + traderConfig.PLAN_EXPIRY_BARS) }];
    };
  };
  const replayOptions = { datasetId, config: { feeRate: input.feeRate, slippageRate: input.slippageRate }, shadowMode: false as const };
  const trainingBars = bars.slice(0, input.trainingEndIndex + 1);
  const trainingReplay = replayClosedCandles({
    ...replayOptions,
    candles: trainingBars,
    plansAt: plannerAt(0, input.trainingEndIndex),
  });
  const replay = replayClosedCandles({
    ...replayOptions,
    candles: bars,
    plansAt: plannerAt(input.testStartIndex, bars.length - 1),
  });
  const metrics = summarize(replay, input.testStartIndex, bars, input.triggerTimeframe);
  const trainingDurations = trainingReplay.trades.map((trade) => Math.max(1,
    Math.round((trade.exitTime - trade.entryTime) / candleSeconds(input.triggerTimeframe, trade.entryTime))));
  const randomHoldingBars = trainingDurations.length
    ? Math.max(1, Math.floor(trainingDurations.sort((left, right) => left - right)[Math.floor(trainingDurations.length / 2)]!))
    : Math.max(1, Math.floor(86_400 / candleSeconds(input.triggerTimeframe, bars[input.trainingEndIndex]!.time)));
  const randomEntryExpectancyR = dailyRandomBaseline({ bars, startIndex: input.testStartIndex,
    holdingBars: randomHoldingBars, runs: traderConfig.MIN_RANDOM_BASELINE_RUNS, feeRate: input.feeRate, slippageRate: input.slippageRate });
  const firstHoldBar = bars[input.testStartIndex + 1];
  const lastHoldBar = bars.at(-1);
  const buyAndHoldExpectancyR = firstHoldBar && lastHoldBar
    ? ((lastHoldBar.close * (1 - input.slippageRate) * (1 - input.feeRate))
      - (firstHoldBar.open * (1 + input.slippageRate) * (1 + input.feeRate)))
      / (firstHoldBar.open * traderConfig.RISK_PER_TRADE_PCT / 100)
    : null;
  const experimentCreated = Date.parse(input.experimentCreatedAt);
  const trainingEndBar = bars[input.trainingEndIndex];
  const trainingEndTime = trainingEndBar ? trainingEndBar.time + candleSeconds(input.triggerTimeframe, trainingEndBar.time) : undefined;
  const testStartTime = bars[input.testStartIndex]?.time;
  const lastBar = bars.at(-1);
  const testEndTime = lastBar ? lastBar.time + candleSeconds(input.triggerTimeframe, lastBar.time) : undefined;
  if (!Number.isFinite(experimentCreated) || trainingEndTime === undefined || testStartTime === undefined || testEndTime === undefined) throw new Error('Research experiment dates are invalid.');
  const reasons = [
    ...(trainingEndTime > testStartTime ? ['Training and test periods overlap.'] : []),
    ...(testStartTime * 1000 <= experimentCreated ? ['The untouched test period predates experiment registration and is historical, not forward evidence.'] : []),
    ...(metrics.tradeCount < traderConfig.MIN_FORWARD_TRADES ? [`Test trade count is below ${traderConfig.MIN_FORWARD_TRADES}.`] : []),
    ...(metrics.testDays < traderConfig.MIN_FORWARD_DAYS ? [`Test period is shorter than ${traderConfig.MIN_FORWARD_DAYS} days.`] : []),
    ...((metrics.expectancyR ?? Number.NEGATIVE_INFINITY) <= 0 ? ['After-cost test expectancy is not positive.'] : []),
    ...((metrics.profitFactor ?? 0) <= 1 ? ['After-cost test profit factor does not exceed one.'] : []),
    ...(buyAndHoldExpectancyR === null || (metrics.expectancyR ?? Number.NEGATIVE_INFINITY) <= buyAndHoldExpectancyR ? ['After-cost test expectancy does not beat buy-and-hold.'] : []),
    ...(randomEntryExpectancyR === null || (metrics.expectancyR ?? Number.NEGATIVE_INFINITY) <= randomEntryExpectancyR ? ['After-cost test expectancy does not beat the seeded random-entry baseline.'] : []),
    ...(traderConfig.MIN_RANDOM_BASELINE_RUNS < 1 ? ['Random-entry baseline run count is invalid.'] : []),
  ];
  const configHash = replay.configHash;
  return {
    pipelineVersion: PIPELINE_VERSION,
    symbol: input.symbol,
    triggerTimeframe: input.triggerTimeframe,
    datasetId,
    datasetVersions,
    codeRevision: input.codeRevision,
    strategyVersion: 'trend-pullback-v1',
    engineVersions,
    configHash,
    split: { trainingEndIndex: input.trainingEndIndex, testStartIndex: input.testStartIndex, trainingEndTime, testStartTime, testEndTime },
    costs: { feeRate: input.feeRate, slippageRate: input.slippageRate },
    metrics,
    baselines: { buyAndHoldExpectancyR, randomEntryExpectancyR, randomRuns: traderConfig.MIN_RANDOM_BASELINE_RUNS, randomHoldingBars },
    validation: { passed: reasons.length === 0, promotionEligible: reasons.length === 0, reasons },
    replay: { trades: replay.trades, finalPlans: replay.finalPlans },
    snapshot: input.series.map(({ timeframe, candles }) => ({ timeframe, candles })),
  };
}
