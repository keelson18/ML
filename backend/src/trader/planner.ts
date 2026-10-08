// Plans only when the existing analysis engines agree on a closed higher-timeframe trend.
import { randomUUID } from 'node:crypto';
import type { Candle, Timeframe } from '../../../src/lib/types';
import { analyzeMarketIntelligence } from '../engines/orchestrator';
import type { TradeDecision } from '../engines/decision-engine';
import { liquidityIntelligenceEngine } from '../engines/liquidity-engine';
import type { HtfBias } from './constants';
import { traderConfig } from './config';
import type { PlannerInput, TradePlan } from './types';

export interface PlannerResult {
  plan?: TradePlan;
  bias: HtfBias;
  regime: string;
  keyLevels: number[];
  qualityScore: number;
  reason: string;
}

function biasFor(candles: Candle[], symbol: string, timeframe: Timeframe, id: string): HtfBias {
  if (candles.length < 50) return 'unclear';
  const intelligence = analyzeMarketIntelligence({ inputContextId: id, symbol, timeframe, candles });
  const structure = intelligence.structure.result.state;
  const regime = intelligence.regime.result.regime;
  const momentum = intelligence.indicators.result.momentumState;
  if (regime !== 'trending') return structure === 'ranging' || structure === 'consolidating' ? 'range' : 'unclear';
  if (structure === 'bullish' && momentum === 'bullish') return 'bull';
  if (structure === 'bearish' && momentum === 'bearish') return 'bear';
  return 'unclear';
}

function uniqueLevels(candles: Candle[], symbol: string, timeframe: Timeframe, id: string): number[] {
  const context = { inputContextId: id, symbol, timeframe, candles };
  const structure = analyzeMarketIntelligence(context).structure.result;
  const liquidity = liquidityIntelligenceEngine.analyze(context).result;
  return [...structure.highs, ...structure.lows].map((point) => point.value)
    .concat(liquidity.zones.map((zone) => zone.price))
    .filter((price, index, all) => Number.isFinite(price) && all.indexOf(price) === index)
    .sort((left, right) => left - right);
}

export function createTradePlan(input: PlannerInput): PlannerResult {
  const daily = input.htfCandles['1d'] ?? [];
  const fourHour = input.htfCandles['4h'] ?? [];
  const dailyBias = biasFor(daily, input.symbol, '1d', `${input.datasetId}:1d`);
  const fourHourBias = biasFor(fourHour, input.symbol, '4h', `${input.datasetId}:4h`);
  const bias: HtfBias = dailyBias === fourHourBias ? dailyBias : 'unclear';
  const latest = fourHour.at(-1);
  const levels = uniqueLevels(fourHour, input.symbol, '4h', `${input.datasetId}:levels`);
  const current = latest?.close;
  const supported = bias === 'bull' && input.symbol.endsWith('USD');
  const keyLevels = current === undefined ? [] : levels.filter((level) => level < current).slice(-5);
  if (!supported || !latest || !Number.isFinite(current) || keyLevels.length === 0) {
    return { bias, regime: 'uncertain', keyLevels, qualityScore: 0, reason: bias === 'unclear' ? 'No plan: higher-timeframe bias is unclear or disagrees.' : 'No plan: no eligible trend-pullback support level.' };
  }
  const currentPrice = current as number;
  const triggerTimeframe = input.triggerTimeframe ?? traderConfig.TRIGGER_TIMEFRAMES[0] as Timeframe;
  const triggerSeconds: Partial<Record<Timeframe, number>> = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800, '1M': 2592000 };
  const lastTriggerBar = Math.floor((input.triggerCandles.at(-1)?.time ?? latest.time) / (triggerSeconds[triggerTimeframe] ?? 900));

  const analysis = analyzeMarketIntelligence({ inputContextId: `${input.datasetId}:4h`, symbol: input.symbol, timeframe: '4h', candles: fourHour });
  const atr = analysis.indicators.result.latest.atr;
  const support = keyLevels.at(-1);
  if (!atr || atr <= 0 || support === undefined || currentPrice - support > atr * 3) {
    return { bias, regime: analysis.regime.result.regime, keyLevels, qualityScore: 0, reason: 'No plan: price is too far from a valid support level.' };
  }

  const entryZone = { low: support - atr * 0.25, high: support + atr * 0.25 };
  const invalidation = support - atr;
  const risk = entryZone.high - invalidation;
  // Derive the initial objective from the same explicit levels/volatility used by the decision engines.
  const resistance = levels.find((level) => level > entryZone.high + risk * traderConfig.MIN_RR);
  const targetPrice = resistance ?? entryZone.high + risk * traderConfig.MIN_RR;
  const decisionLevels: Pick<TradeDecision, 'entryZone' | 'invalidation' | 'targets' | 'strategy'> = {
    entryZone: { low: entryZone.low, high: entryZone.high },
    invalidation,
    targets: [{ price: targetPrice }],
    strategy: 'trend-pullback',
  };
  const decisionEntryZone = decisionLevels.entryZone ?? entryZone;
  const decisionStop = decisionLevels.invalidation ?? invalidation;
  const decisionTarget = decisionLevels.targets?.[0]?.price ?? targetPrice;
  const rr = Math.abs(decisionTarget - decisionEntryZone.high) / Math.abs(decisionEntryZone.high - decisionStop);
  const signalAgreement = analysis.strategy.result.signals.some((signal) => signal.side === 'buy');
  const qualityScore = Math.min(1, analysis.structure.result.trendStrength * 0.6 + (signalAgreement ? 0.2 : 0) + Math.min(0.2, analysis.liquidity.result.observedCount / 50));
  const grade = qualityScore >= 0.7 ? 'A' : 'B';
  if (rr < traderConfig.MIN_RR || !traderConfig.ALLOWED_GRADES.includes(grade)) {
    return { bias, regime: analysis.regime.result.regime, keyLevels, qualityScore, reason: rr < traderConfig.MIN_RR ? `No plan: risk/reward ${rr.toFixed(2)} is below ${traderConfig.MIN_RR}.` : `No plan: grade ${grade} is not allowed.` };
  }

  const engineVersions = Object.fromEntries([
    ['market-context', analysis.context.engineVersion], ['market-regime', analysis.regime.engineVersion],
    ['market-structure', analysis.structure.engineVersion], ['liquidity-intelligence', analysis.liquidity.engineVersion],
    ['pattern-intelligence', analysis.patterns.engineVersion], ['indicator-intelligence', analysis.indicators.engineVersion],
    ['strategy-intelligence', analysis.strategy.engineVersion],
  ]);
  const plan: TradePlan = {
    id: randomUUID(), accountId: input.accountId, symbol: input.symbol, side: 'long', setupType: 'trend-pullback', htfBias: bias,
    zone: entryZone, trigger: { kind: 'close_above_level', level: entryZone.high },
    invalidation, targets: [{ price: targetPrice, fractionOfPosition: 1 }],
    minRR: traderConfig.MIN_RR, createdAtBar: lastTriggerBar, expiresAtBar: lastTriggerBar + traderConfig.PLAN_EXPIRY_BARS,
    thesis: `${input.symbol} has aligned bullish 1d and 4h structure and is pulling back toward ${support}.`,
    falsification: `A closed 4h candle below ${invalidation} invalidates the bullish pullback thesis.`, grade, status: 'WATCHING',
    contextSnapshot: { currentPrice, support, atr, rr, qualityScore }, engineVersions, datasetId: input.datasetId,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  return { plan, bias, regime: analysis.regime.result.regime, keyLevels, qualityScore, reason: 'Plan created: aligned bullish trend, pullback level, and risk/reward gate passed.' };
}

export function rankPlannerResults(results: PlannerResult[]): PlannerResult[] {
  return results.sort((left, right) => right.qualityScore - left.qualityScore).slice(0, traderConfig.WATCHLIST_MAX_SIZE);
}
