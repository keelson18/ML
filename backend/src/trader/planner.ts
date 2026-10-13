// Plans only when the existing analysis engines agree on a closed higher-timeframe trend.
import { createHash } from 'node:crypto';
import type { Candle, Timeframe } from '../../../src/lib/types';
import { analyzeMarketIntelligence } from '../engines/orchestrator';
import type { TradeDecision } from '../engines/decision-engine';
import { liquidityIntelligenceEngine } from '../engines/liquidity-engine';
import type { HtfBias } from './constants';
import { traderConfig } from './config';
import type { PlannerInput, TradePlan } from './types';
import { candleIndex, candleSeconds } from './candle-math';

export interface PlannerResult {
  plan?: TradePlan;
  bias: HtfBias;
  regime: string;
  keyLevels: number[];
  qualityScore: number;
  reason: string;
}

export function stablePlanId(accountId: string, symbol: string, triggerTimeframe: Timeframe, triggerBar: number): string {
  return `plan-${createHash('sha256').update([accountId, symbol, triggerTimeframe, triggerBar, 'trend-pullback-v1'].join(':')).digest('hex').slice(0, 32)}`;
}

export function detectTrendPullbackSetup(candles: Candle[], zone: { low: number; high: number }, invalidation: number) {
  if (candles.length < 50) return { valid: false, reason: 'The 1h setup needs at least 50 closed candles.' };
  const candle = candles.at(-1)!;
  if (candle.low < invalidation) return { valid: false, reason: 'The latest 1h candle breached setup invalidation.' };
  if (candle.low > zone.high || candle.high < zone.low) return { valid: false, reason: 'The latest 1h candle did not test the higher-timeframe pullback zone.' };
  if (candle.close <= candle.open || candle.close <= zone.high) return { valid: false, reason: 'The latest 1h candle did not close bullishly back above the pullback zone.' };
  return { valid: true, reason: 'A closed 1h candle tested the pullback zone and reclaimed it with a bullish close.', candle };
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
  const setupCandles = input.setupCandles;
  const latestSetup = setupCandles.at(-1);
  const latestTrigger = input.triggerCandles.at(-1);
  if (!latestSetup || !latestTrigger) {
    return { bias: 'unclear', regime: 'uncertain', keyLevels: [], qualityScore: 0, reason: 'No plan: closed 1h setup and 15m confirmation history are both required.' };
  }
  const setupClose = latestSetup.time + candleSeconds(traderConfig.SETUP_TIMEFRAME, latestSetup.time);
  const triggerClose = latestTrigger.time + candleSeconds(traderConfig.TRIGGER_TIMEFRAMES[0] as Timeframe, latestTrigger.time);
  const dailyClose = daily.at(-1) && daily.at(-1)!.time + candleSeconds('1d', daily.at(-1)!.time);
  const fourHourClose = fourHour.at(-1) && fourHour.at(-1)!.time + candleSeconds('4h', fourHour.at(-1)!.time);
  if (setupClose > triggerClose || dailyClose === undefined || dailyClose > setupClose || fourHourClose === undefined || fourHourClose > setupClose) {
    return { bias: 'unclear', regime: 'uncertain', keyLevels: [], qualityScore: 0, reason: 'No plan: timeframe snapshots are incomplete or not chronologically aligned.' };
  }
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
  if (triggerTimeframe !== traderConfig.TRIGGER_TIMEFRAMES[0]) {
    return { bias, regime: 'uncertain', keyLevels, qualityScore: 0, reason: 'No plan: this setup is validated only for its configured 15m confirmation timeframe.' };
  }
  const lastTriggerBar = candleIndex(triggerTimeframe, input.triggerCandles.at(-1)?.time ?? latest.time);
  const planId = stablePlanId(input.accountId, input.symbol, triggerTimeframe, lastTriggerBar);

  const analysis = analyzeMarketIntelligence({ inputContextId: `${input.datasetId}:4h`, symbol: input.symbol, timeframe: '4h', candles: fourHour });
  const atr = analysis.indicators.result.latest.atr;
  const support = keyLevels.at(-1);
  if (!atr || atr <= 0 || support === undefined || currentPrice - support > atr * 3) {
    return { bias, regime: analysis.regime.result.regime, keyLevels, qualityScore: 0, reason: 'No plan: price is too far from a valid support level.' };
  }

  const entryZone = { low: support - atr * 0.25, high: support + atr * 0.25 };
  const invalidation = support - atr;
  const setupBias = biasFor(setupCandles, input.symbol, traderConfig.SETUP_TIMEFRAME, `${input.datasetId}:setup-1h`);
  if (setupBias !== 'bull') {
    return { bias, regime: analysis.regime.result.regime, keyLevels, qualityScore: 0, reason: 'No plan: 1h setup structure and momentum are not bullish.' };
  }
  const setup = detectTrendPullbackSetup(setupCandles, entryZone, invalidation);
  if (!setup.valid) return { bias, regime: analysis.regime.result.regime, keyLevels, qualityScore: 0, reason: `No plan: ${setup.reason}` };
  const entryReference = Math.max(entryZone.high, latestSetup.high);
  const risk = entryReference - invalidation;
  // Derive the initial objective from the same explicit levels/volatility used by the decision engines.
  const resistance = levels.find((level) => level > entryReference + risk * traderConfig.MIN_RR);
  const targetPrice = resistance ?? entryReference + risk * traderConfig.MIN_RR;
  const decisionLevels: Pick<TradeDecision, 'entryZone' | 'invalidation' | 'targets' | 'strategy'> = {
    entryZone: { low: entryZone.low, high: entryZone.high },
    invalidation,
    targets: [{ price: targetPrice }],
    strategy: 'trend-pullback',
  };
  const decisionStop = decisionLevels.invalidation ?? invalidation;
  const decisionTarget = decisionLevels.targets?.[0]?.price ?? targetPrice;
  const rr = Math.abs(decisionTarget - entryReference) / Math.abs(entryReference - decisionStop);
  const signalAgreement = analysis.strategy.result.signals.some((signal) => signal.side === 'buy');
  const qualityScore = Math.min(1, analysis.structure.result.trendStrength * 0.6 + (signalAgreement ? 0.2 : 0) + Math.min(0.2, analysis.liquidity.result.observedCount / 50));
  const grade = qualityScore >= 0.7 ? 'A' : 'B';
  if (rr < traderConfig.MIN_RR || !traderConfig.ALLOWED_GRADES.includes(grade)) {
    return { bias, regime: analysis.regime.result.regime, keyLevels, qualityScore, reason: rr < traderConfig.MIN_RR ? `No plan: risk/reward ${rr.toFixed(2)} is below ${traderConfig.MIN_RR}.` : `No plan: grade ${grade} is not allowed.` };
  }

  const engineVersions = Object.fromEntries([
    ['market-context', analysis.context.engineVersion], ['market-regime', analysis.regime.engineVersion],
    ['market-structure', analysis.structure.engineVersion], ['liquidity-intelligence', analysis.liquidity.engineVersion],
    ['1h-setup', 'trend-pullback-1h-v1'],
    ['pattern-intelligence', analysis.patterns.engineVersion], ['indicator-intelligence', analysis.indicators.engineVersion],
    ['strategy-intelligence', analysis.strategy.engineVersion],
  ]);
  const plan: TradePlan = {
    id: planId, accountId: input.accountId, symbol: input.symbol, side: 'long', setupType: 'trend-pullback', htfBias: bias,
    zone: entryZone, trigger: { kind: 'close_above_level', level: latestSetup.high }, triggerTimeframe,
    invalidation, targets: [{ price: targetPrice, fractionOfPosition: 1 }],
    minRR: traderConfig.MIN_RR, createdAtBar: lastTriggerBar,
    expiresAtBar: lastTriggerBar + Math.min(traderConfig.PLAN_EXPIRY_BARS,
      Math.ceil(traderConfig.SETUP_EXPIRY_BARS * candleSeconds(traderConfig.SETUP_TIMEFRAME, latestSetup.time) / candleSeconds(triggerTimeframe, latestTrigger.time))),
    thesis: `${input.symbol} has aligned bullish 1d and 4h context, a bullish 1h reclaim of ${support}, and awaits a 15m close above ${latestSetup.high}.`,
    falsification: `A closed 4h candle below ${invalidation} invalidates the bullish pullback thesis.`, grade, status: 'WATCHING',
    contextSnapshot: { currentPrice, support, atr, rr, qualityScore, setupTime: latestSetup.time, setupHigh: latestSetup.high, setupLow: latestSetup.low, triggerLevel: latestSetup.high }, engineVersions, datasetId: input.datasetId,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  return { plan, bias, regime: analysis.regime.result.regime, keyLevels, qualityScore, reason: 'Plan created: aligned bullish trend, pullback level, and risk/reward gate passed.' };
}

export function rankPlannerResults(results: PlannerResult[]): PlannerResult[] {
  return results.sort((left, right) => right.qualityScore - left.qualityScore).slice(0, traderConfig.WATCHLIST_MAX_SIZE);
}
