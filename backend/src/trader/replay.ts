// Deterministic candle replay using the same trigger executor and position manager as paper mode.
import { createHash } from 'node:crypto';
import type { Candle } from '../../../src/lib/types';
import type { PaperPosition } from '../engines/paper-execution';
import { traderConfig } from './config';
import { advanceTradePlan, type EntryGateResult } from './executor';
import { managePaperPosition } from './manager';
import type { TradePlan } from './types';

export interface ReplayTrade {
  planId: string;
  symbol: string;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  fees: number;
  slippage: number;
  pnlAfterCosts: number;
  rMultipleAfterCosts: number;
  maeR: number | null;
  mfeR: number | null;
  exitReason: string;
}

export interface ReplayResult {
  datasetId: string;
  configHash: string;
  engineVersions: Record<string, string>;
  barsProcessed: number;
  trades: ReplayTrade[];
  finalPlans: TradePlan[];
  shadowSignals: Array<{ barIndex: number; planId: string; reason: string }>;
}

export function replayClosedCandles(input: {
  candles: Candle[];
  datasetId: string;
  config?: { feeRate: number; slippageRate: number };
  plansAt?: (history: Candle[], barIndex: number) => TradePlan[];
  gate?: (plan: TradePlan, entryPrice: number) => EntryGateResult;
  shadowMode?: boolean;
  engineVersions?: Record<string, string>;
}): ReplayResult {
  const candles = input.candles;
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index]!;
    if (index > 0 && candle.time <= candles[index - 1]!.time) throw new Error('Replay candles must be strictly chronological.');
    if (![candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)) throw new Error('Replay candle contains non-finite data.');
    if (candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close)) throw new Error('Replay candle OHLC values are inconsistent.');
  }
  const costs = input.config ?? { feeRate: traderConfig.FEE_RATE, slippageRate: traderConfig.SLIPPAGE_RATE };
  if (![costs.feeRate, costs.slippageRate].every((value) => Number.isFinite(value) && value >= 0 && value < 1)) throw new Error('Replay costs must be rates from zero up to (but not including) one.');
  const configHash = createHash('sha256').update(JSON.stringify({ costs, traderConfig })).digest('hex');
  let plans: TradePlan[] = [];
  const pending: Map<string, NonNullable<ReturnType<typeof advanceTradePlan>['pendingOrder']>> = new Map();
  let positions: PaperPosition[] = [];
  const trades: ReplayTrade[] = [];
  const shadowSignals: ReplayResult['shadowSignals'] = [];
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index]!;
    // Planner receives a copy ending at the current closed candle; it cannot read future bars.
    const newPlans = input.plansAt?.(candles.slice(0, index + 1), index) ?? [];
    for (const plan of newPlans) if (!plans.some((existing) => existing.id === plan.id)) plans.push(plan);
    if (input.shadowMode ?? traderConfig.SHADOW_MODE_ENABLED) {
      for (const plan of newPlans) shadowSignals.push({ barIndex: index, planId: plan.id, reason: 'Would evaluate this pre-registered plan in shadow mode.' });
      continue;
    }
    const nextPlans = [...plans];
    const openedOnBar = new Set<string>();
    for (const [planIndex, plan] of plans.entries()) {
      if (!['WATCHING', 'ARMED', 'PENDING_ORDER'].includes(plan.status)) continue;
      const step = advanceTradePlan({
        plan, candle, previousCandle: candles[index - 1], recentCandles: candles.slice(Math.max(0, index - 20), index + 1),
        barIndex: index, timeframe: '15m', pendingOrder: pending.get(plan.id), costs,
        gate: (price) => input.gate?.(plan, price) ?? { approved: true, quantity: 1 },
      });
      nextPlans[planIndex] = step.plan;
      if (step.pendingOrder) pending.set(plan.id, step.pendingOrder);
      if (step.fill) {
        const order = step.fill.order;
        openedOnBar.add(order.id);
        positions.push({
          id: order.id, symbol: plan.symbol, assetId: plan.symbol, side: 'buy', quantity: order.quantity,
          entryPrice: step.fill.price, entryFee: step.fill.fee, stopLoss: plan.invalidation,
          initialRisk: Math.abs(step.fill.price - plan.invalidation), initialQuantity: order.quantity,
          targets: plan.targets, targetsTaken: [], barsHeld: 0, maxFavorablePrice: step.fill.price,
          planId: plan.id, status: 'open', openedAt: new Date(candle.time * 1000).toISOString(),
        });
      }
    }
    plans = nextPlans;
    const stillOpen: PaperPosition[] = [];
    for (const position of positions) {
      if (position.status !== 'open') continue;
      if (openedOnBar.has(position.id)) { stillOpen.push(position); continue; }
      const plan = plans.find((candidate) => candidate.id === position.planId);
      const managed = managePaperPosition({ position, candle, barIndex: index, feeRate: costs.feeRate });
      let remaining = position.quantity;
      for (const exit of managed.exits) {
        const quantity = Math.min(exit.quantity, remaining);
        remaining -= quantity;
        const exitFee = exit.price * quantity * costs.feeRate;
        const allocatedEntryFee = position.quantity > 0 ? position.entryFee * quantity / position.quantity : 0;
        const gross = (exit.price - position.entryPrice) * quantity;
        const pnl = gross - exitFee - allocatedEntryFee;
        const risk = (position.initialRisk ?? 0) * quantity;
        const initialRisk = position.initialRisk;
        const mfeR = initialRisk && initialRisk > 0
          ? position.side === 'buy' ? ((managed.position.maxFavorablePrice ?? position.entryPrice) - position.entryPrice) / initialRisk : (position.entryPrice - (managed.position.maxFavorablePrice ?? position.entryPrice)) / initialRisk
          : null;
        const maeR = initialRisk && initialRisk > 0
          ? position.side === 'buy' ? ((managed.position.maxAdversePrice ?? position.entryPrice) - position.entryPrice) / initialRisk : (position.entryPrice - (managed.position.maxAdversePrice ?? position.entryPrice)) / initialRisk
          : null;
        trades.push({
          planId: position.planId ?? '', symbol: position.symbol, entryTime: Date.parse(position.openedAt) / 1000,
          exitTime: candle.time, entryPrice: position.entryPrice, exitPrice: exit.price, quantity,
          fees: exitFee + allocatedEntryFee, slippage: Math.abs(position.entryPrice) * quantity * costs.slippageRate + exit.price * quantity * costs.slippageRate,
          pnlAfterCosts: pnl, rMultipleAfterCosts: risk > 0 ? pnl / risk : 0, maeR, mfeR,
          exitReason: exit.reason,
        });
      }
      if (remaining > 0 && managed.position.status === 'open') {
        const unallocatedEntryFee = position.quantity > 0 ? position.entryFee * remaining / position.quantity : 0;
        stillOpen.push({ ...managed.position, quantity: remaining, entryFee: unallocatedEntryFee });
      }
      else if (plan) {
        const planIndex = plans.indexOf(plan);
        if (planIndex >= 0 && plan.status === 'OPEN') plans[planIndex] = { ...plan, status: 'CLOSED', updatedAt: new Date(candle.time * 1000).toISOString() };
      }
    }
    positions = stillOpen;
  }
  return { datasetId: input.datasetId, configHash, engineVersions: input.engineVersions ?? {}, barsProcessed: candles.length, trades, finalPlans: plans, shadowSignals };
}

export function evaluateCostSensitivity(input: Parameters<typeof replayClosedCandles>[0]) {
  const base = input.config ?? { feeRate: traderConfig.FEE_RATE, slippageRate: traderConfig.SLIPPAGE_RATE };
  return {
    base: replayClosedCandles({ ...input, config: base }),
    doubledFees: replayClosedCandles({ ...input, config: { ...base, feeRate: Math.min(0.999999, base.feeRate * 2) } }),
    doubledSlippage: replayClosedCandles({ ...input, config: { ...base, slippageRate: Math.min(0.999999, base.slippageRate * 2) } }),
  };
}

export function walkForward<T>(input: { observations: T[]; trainSize: number; validationSize: number; testSize: number; stepSize?: number }) {
  const { observations, trainSize, validationSize, testSize } = input;
  const step = input.stepSize ?? testSize;
  if (![trainSize, validationSize, testSize, step].every((value) => Number.isInteger(value) && value > 0)) throw new Error('Walk-forward window sizes must be positive integers.');
  const folds: Array<{ train: T[]; validation: T[]; test: T[] }> = [];
  for (let start = 0; start + trainSize + validationSize + testSize <= observations.length; start += step) {
    folds.push({ train: observations.slice(start, start + trainSize), validation: observations.slice(start + trainSize, start + trainSize + validationSize), test: observations.slice(start + trainSize + validationSize, start + trainSize + validationSize + testSize) });
  }
  return folds;
}
