// Deterministic candle replay using the same trigger executor and position manager as paper mode.
import { createHash } from 'node:crypto';
import type { Candle } from '../../../src/lib/types';
import { reducePaperPosition, simulatePaperOrder, type PaperAccountState, type PaperPosition } from '../engines/paper-execution';
import { traderConfig } from './config';
import { advanceTradePlan, type EntryGateResult } from './executor';
import { managePaperPosition } from './manager';
import type { TradePlan } from './types';
import { calculatePositionSize, estimateOpenLongStopRisk, markToMarket } from './risk';
import { candleSeconds } from './candle-math';

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
  invalidationCandles?: Candle[];
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
  let replayAccount: PaperAccountState = { accountId: 'replay', cash: traderConfig.TRADER_STARTING_EQUITY, positions: [], trades: [] };
  const trades: ReplayTrade[] = [];
  const shadowSignals: ReplayResult['shadowSignals'] = [];
  const entryReservations = new Map<string, string>();
  const dailyEntries = new Map<string, number>();
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
    const dayKey = new Date(candle.time * 1000).toISOString().slice(0, 10);
    const replayGate = (plan: TradePlan, price: number) => {
      if (input.gate) return input.gate(plan, price);
      if (plan.side !== 'long') return { approved: false, quantity: 0, reason: 'Replay paper account only supports long entries.' };
      const otherReservations = [...entryReservations.entries()].filter(([planId]) => planId !== plan.id).map(([, symbol]) => symbol);
      const occupied = [...positions.filter((position) => position.status === 'open').map((position) => position.symbol), ...otherReservations];
      if (occupied.includes(plan.symbol)) return { approved: false, quantity: 0, reason: 'A paper position or pending entry is already reserved for this symbol.' };
      if (positions.filter((position) => position.status === 'open').length + otherReservations.length >= traderConfig.MAX_CONCURRENT_POSITIONS) return { approved: false, quantity: 0, reason: 'Maximum concurrent paper positions reached.' };
      if ((dailyEntries.get(dayKey) ?? 0) + otherReservations.length >= traderConfig.MAX_TRADES_PER_DAY) return { approved: false, quantity: 0, reason: 'Daily replay trade cap reached.' };
      const marked = markToMarket(replayAccount, Object.fromEntries(positions.filter((position) => position.status === 'open').map((position) => [position.symbol, candle.close])));
      if (marked.missingMarkSymbols.length) return { approved: false, quantity: 0, reason: 'Replay risk approval is missing current marks.' };
      const dayStart = Date.parse(`${dayKey}T00:00:00.000Z`);
      const weekStart = dayStart - ((new Date(dayStart).getUTCDay() + 6) % 7) * 86_400_000;
      const dailyPnl = replayAccount.trades.filter((trade) => Date.parse(trade.closedAt) >= dayStart).reduce((sum, trade) => sum + trade.realizedPnl, 0);
      const weeklyPnl = replayAccount.trades.filter((trade) => Date.parse(trade.closedAt) >= weekStart).reduce((sum, trade) => sum + trade.realizedPnl, 0);
      if (dailyPnl <= -(marked.equity * traderConfig.DAILY_LOSS_STOP_PCT / 100)) return { approved: false, quantity: 0, reason: 'Daily replay loss limit reached.' };
      if (weeklyPnl <= -(marked.equity * traderConfig.WEEKLY_LOSS_STOP_PCT / 100)) return { approved: false, quantity: 0, reason: 'Weekly replay loss limit reached.' };
      if (marked.drawdownPct >= traderConfig.MAX_DRAWDOWN_PCT) return { approved: false, quantity: 0, reason: 'Replay maximum drawdown reached.' };
      const sizing = calculatePositionSize({ equity: marked.equity, entry: price, invalidation: plan.invalidation,
        cash: replayAccount.cash, grossExposure: marked.grossExposure,
        symbolExposure: marked.positions.filter(({ position }) => position.symbol === plan.symbol).reduce((sum, item) => sum + item.currentPrice * item.position.quantity, 0),
        feeRate: costs.feeRate, slippageRate: costs.slippageRate });
      if (!sizing.accepted) return { approved: false, quantity: 0, reason: sizing.reason };
      const openRisk = positions.filter((position) => position.status === 'open')
        .reduce((sum, position) => sum + estimateOpenLongStopRisk(position, costs), 0);
      const heatHeadroom = Math.max(0, marked.equity * traderConfig.MAX_PORTFOLIO_HEAT_PCT / 100 - openRisk);
      const quantity = Math.min(sizing.quantity, heatHeadroom / sizing.perUnitRisk);
      if (!Number.isFinite(quantity) || quantity <= 0) return { approved: false, quantity: 0, reason: 'Replay portfolio heat limit reached.' };
      entryReservations.set(plan.id, plan.symbol);
      return { approved: true, quantity };
    };
    for (const [planIndex, plan] of plans.entries()) {
      if (!['WATCHING', 'ARMED', 'PENDING_ORDER'].includes(plan.status)) continue;
      const step = advanceTradePlan({
        plan, candle, previousCandle: candles[index - 1], recentCandles: candles.slice(Math.max(0, index - 20), index + 1),
        barIndex: index, timeframe: plan.triggerTimeframe ?? '15m', pendingOrder: pending.get(plan.id),
        gate: (price) => replayGate(plan, price),
        orderIdFactory: () => `replay-${createHash('sha256').update(`${input.datasetId}:${plan.id}:${index}`).digest('hex').slice(0, 32)}`,
      });
      nextPlans[planIndex] = step.plan;
      if (step.pendingOrder) pending.set(plan.id, step.pendingOrder);
      if (step.fill) {
        const order = step.fill.order;
        const openedAt = new Date(candle.time * 1000).toISOString();
        const opened = simulatePaperOrder(replayAccount, {
          orderId: order.id, positionId: order.id, decisionId: `plan-${plan.id}`, assetId: plan.symbol,
          symbol: plan.symbol, decision: { decision: 'BUY', entry: step.fill.price, invalidation: plan.invalidation,
            targets: plan.targets.map(({ price }) => ({ price })), timestamp: openedAt },
          riskApproved: true, portfolioApproved: true, quantity: order.quantity, requestedPrice: step.fill.price,
          feeRate: costs.feeRate, slippageRate: costs.slippageRate, stopLoss: plan.invalidation,
          takeProfit: plan.targets[0]?.price, targets: plan.targets, planId: plan.id,
          datasetId: plan.datasetId, executionVersion: 'paper-simulator-1.0.0', timestamp: openedAt,
        });
        if (opened.accepted) {
          replayAccount = opened.account;
          const position = replayAccount.positions.at(-1)!;
          openedOnBar.add(position.id);
          positions.push(position);
          entryReservations.delete(plan.id);
          dailyEntries.set(dayKey, (dailyEntries.get(dayKey) ?? 0) + 1);
        }
      }
      if (!['WATCHING', 'ARMED', 'PENDING_ORDER'].includes(step.plan.status)) entryReservations.delete(plan.id);
    }
    plans = nextPlans;
    const stillOpen: PaperPosition[] = [];
    for (const position of positions) {
      if (position.status !== 'open') continue;
      if (openedOnBar.has(position.id)) { stillOpen.push(position); continue; }
      const plan = plans.find((candidate) => candidate.id === position.planId);
      const invalidationCandle = position.thesisInvalidatedAt || plan?.side !== 'long' || position.side !== 'buy'
        ? undefined
        : input.invalidationCandles?.find((candidate) =>
          (candidate.time + candleSeconds('4h', candidate.time)) * 1000 > Date.parse(position.openedAt)
          && (candidate.time + candleSeconds('4h', candidate.time)) * 1000 <= candle.time * 1000
          && candidate.close < plan.invalidation);
      const thesisInvalidatedAt = position.thesisInvalidatedAt ?? (invalidationCandle
        ? new Date((invalidationCandle.time + candleSeconds('4h', invalidationCandle.time)) * 1000).toISOString()
        : undefined);
      const managed = managePaperPosition({
        position: thesisInvalidatedAt ? { ...position, thesisInvalidatedAt } : position,
        candle,
        thesisInvalidatedAt,
        feeRate: costs.feeRate,
      });
      const managedPosition = { ...managed.position, quantity: position.quantity, entryFee: position.entryFee, entrySlippage: position.entrySlippage, status: 'open' as const };
      replayAccount = { ...replayAccount, positions: replayAccount.positions.map((candidate) => candidate.id === position.id ? managedPosition : candidate) };
      for (const exit of managed.exits) {
        const reduced = reducePaperPosition(replayAccount, position.id, exit.quantity, exit.price, costs.feeRate,
          'paper-simulator-1.0.0', `replay-${index}-${position.id}-${trades.length}`, new Date(candle.time * 1000).toISOString(),
          exit.reason, candle, costs.slippageRate);
        if ('error' in reduced) continue;
        replayAccount = reduced.account;
        const trade = reduced.trade;
        const risk = (position.initialRisk ?? 0) * trade.quantity;
        trades.push({
          planId: position.planId ?? '', symbol: position.symbol, entryTime: Date.parse(position.openedAt) / 1000,
          exitTime: candle.time, entryPrice: position.entryPrice, exitPrice: trade.exitPrice, quantity: trade.quantity,
          fees: trade.fees, slippage: trade.slippage, pnlAfterCosts: trade.realizedPnl,
          rMultipleAfterCosts: risk > 0 ? trade.realizedPnl / risk : 0, maeR: trade.maeR, mfeR: trade.mfeR,
          exitReason: exit.reason,
        });
      }
      const current = replayAccount.positions.find((candidate) => candidate.id === position.id);
      if (current?.status === 'open') stillOpen.push(current);
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
