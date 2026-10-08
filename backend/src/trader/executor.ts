// Advances plan state only on a closed candle and fills orders on a later candle.
import { randomUUID } from 'node:crypto';
import type { Candle } from '../../../src/lib/types';
import { traderConfig } from './config';
import { ALLOWED_PLAN_TRANSITIONS } from './constants';
import type { PendingPaperOrder, PlanEvent, TradePlan } from './types';

export interface EntryGateResult {
  approved: boolean;
  quantity: number;
  reason?: string;
  activeEventIds?: string[];
}

export interface ExecutorStep {
  plan: TradePlan;
  pendingOrder?: PendingPaperOrder;
  events: PlanEvent[];
  fill?: { order: PendingPaperOrder; price: number; fee: number; slippage: number };
  reason: string;
}

function gateEvent(plan: TradePlan, reason: string, activeEventIds: string[], candle: Candle, timeframe: PlanEvent['timeframe']): PlanEvent {
  return {
    id: randomUUID(), planId: plan.id, accountId: plan.accountId,
    fromStatus: plan.status, toStatus: plan.status, actor: 'executor', reason,
    candle: { time: candle.time, open: candle.open, high: candle.high, low: candle.low, close: candle.close },
    timeframe, activeEventIds, occurredAt: new Date(candle.time * 1000).toISOString(),
  };
}

function eventFor(plan: TradePlan, toStatus: PlanEvent['toStatus'], actor: PlanEvent['actor'], reason: string, candle: Candle, timeframe: PlanEvent['timeframe']): PlanEvent {
  const fromStatus = plan.status;
  if (!ALLOWED_PLAN_TRANSITIONS[fromStatus].includes(toStatus)) throw new Error(`Illegal plan transition ${fromStatus} -> ${toStatus}.`);
  return { id: randomUUID(), planId: plan.id, accountId: plan.accountId, fromStatus, toStatus, actor, reason, candle, timeframe, occurredAt: new Date(candle.time * 1000).toISOString() };
}

function triggerConfirmed(plan: TradePlan, candle: Candle, previous: Candle | undefined, recent: Candle[]): boolean {
  switch (plan.trigger.kind) {
    case 'close_above_level': return candle.close > plan.trigger.level;
    case 'close_below_level': return candle.close < plan.trigger.level;
    case 'higher_low_break': return Boolean(previous && candle.low > previous.low && candle.close > previous.high);
    case 'bullish_engulfing': {
      const averageVolume = recent.slice(-20).reduce((sum, bar) => sum + bar.volume, 0) / Math.max(1, recent.slice(-20).length);
      return Boolean(previous && previous.close < previous.open && candle.close > candle.open
        && candle.open <= previous.close && candle.close >= previous.open
        && candle.volume >= averageVolume * plan.trigger.minVolumeMultiple);
    }
    case 'bearish_engulfing': {
      const averageVolume = recent.slice(-20).reduce((sum, bar) => sum + bar.volume, 0) / Math.max(1, recent.slice(-20).length);
      return Boolean(previous && previous.close > previous.open && candle.close < candle.open
        && candle.open >= previous.close && candle.close <= previous.open
        && candle.volume >= averageVolume * plan.trigger.minVolumeMultiple);
    }
  }
}

function fillPrice(order: PendingPaperOrder, candle: Candle): number | undefined {
  if (order.orderType === 'limit') {
    const touched = order.side === 'long' ? candle.low <= order.price : candle.high >= order.price;
    if (!touched) return undefined;
    const gapped = order.side === 'long' ? candle.open <= order.price : candle.open >= order.price;
    return gapped ? candle.open : order.price;
  }
  const touched = order.side === 'long' ? candle.high >= order.price : candle.low <= order.price;
  if (!touched) return undefined;
  const gapped = order.side === 'long' ? candle.open >= order.price : candle.open <= order.price;
  return gapped ? candle.open : order.price;
}

export function advanceTradePlan(input: {
  plan: TradePlan;
  candle: Candle;
  previousCandle?: Candle;
  recentCandles: Candle[];
  barIndex: number;
  timeframe: PlanEvent['timeframe'];
  pendingOrder?: PendingPaperOrder;
  costs?: { feeRate: number; slippageRate: number };
  gate: (entryPrice: number) => EntryGateResult;
}): ExecutorStep {
  const { plan, candle, previousCandle, recentCandles, barIndex, timeframe, pendingOrder } = input;
  const feeRate = input.costs?.feeRate ?? traderConfig.FEE_RATE;
  const slippageRate = input.costs?.slippageRate ?? traderConfig.SLIPPAGE_RATE;
  if (pendingOrder?.status === 'pending') {
    if (barIndex > pendingOrder.expiresAtBar) {
      const cancelled = { ...pendingOrder, status: 'cancelled' as const };
      const event = eventFor(plan, 'EXPIRED', 'executor', 'Pending order expired without a fill.', candle, timeframe);
      return { plan: { ...plan, status: 'EXPIRED', updatedAt: event.occurredAt }, pendingOrder: cancelled, events: [event], reason: event.reason };
    }
    if (barIndex <= pendingOrder.createdAtBar) return { plan, pendingOrder, events: [], reason: 'Pending orders cannot fill on their creation candle.' };
    if (plan.side === 'long' && candle.close < plan.invalidation) {
      const cancelled = { ...pendingOrder, status: 'cancelled' as const };
      const event = eventFor(plan, 'INVALIDATED', 'executor', 'Closed candle broke plan invalidation before fill.', candle, timeframe);
      return { plan: { ...plan, status: 'INVALIDATED', updatedAt: event.occurredAt }, pendingOrder: cancelled, events: [event], reason: event.reason };
    }
    const rawPrice = fillPrice(pendingOrder, candle);
    if (rawPrice === undefined) return { plan, pendingOrder, events: [], reason: 'Pending order was not touched by this candle.' };
    const fillGate = input.gate(pendingOrder.price);
    if (!fillGate.approved || !Number.isFinite(fillGate.quantity) || fillGate.quantity <= 0) {
      const reason = fillGate.reason ?? 'Entry gates rejected this pending fill.';
      return { plan: { ...plan, lastReason: reason, activeEventIds: fillGate.activeEventIds ?? [] }, pendingOrder, events: [gateEvent(plan, reason, fillGate.activeEventIds ?? [], candle, timeframe)], reason };
    }
    const price = rawPrice * (pendingOrder.side === 'long' ? 1 + slippageRate : 1 - slippageRate);
    const filledOrder = { ...pendingOrder, quantity: Math.min(pendingOrder.quantity, fillGate.quantity), status: 'filled' as const };
    const fee = price * filledOrder.quantity * feeRate;
    const event = eventFor(plan, 'OPEN', 'executor', 'Pending order filled on a later candle with configured costs.', candle, timeframe);
    return { plan: { ...plan, status: 'OPEN', updatedAt: event.occurredAt, lastReason: undefined, activeEventIds: fillGate.activeEventIds ?? [] }, pendingOrder: filledOrder, fill: { order: filledOrder, price, fee, slippage: Math.abs(price - rawPrice) }, events: [event], reason: event.reason };
  }

  if (!['WATCHING', 'ARMED'].includes(plan.status)) return { plan, events: [], reason: `Plan is ${plan.status}; executor made no change.` };
  if (plan.createdAtBar !== undefined && barIndex <= plan.createdAtBar) return { plan, events: [], reason: 'Plan cannot evaluate its creation candle; waiting for the next closed candle.' };
  if (barIndex > plan.expiresAtBar) {
    const event = eventFor(plan, 'EXPIRED', 'executor', 'Plan expired before a trigger was confirmed.', candle, timeframe);
    return { plan: { ...plan, status: 'EXPIRED', updatedAt: event.occurredAt }, events: [event], reason: event.reason };
  }
  if (plan.side === 'long' && candle.close < plan.invalidation) {
    const event = eventFor(plan, 'INVALIDATED', 'executor', 'Closed candle broke plan invalidation.', candle, timeframe);
    return { plan: { ...plan, status: 'INVALIDATED', updatedAt: event.occurredAt }, events: [event], reason: event.reason };
  }

  const touchedZone = candle.low <= plan.zone.high && candle.high >= plan.zone.low;
  let armedPlan = plan;
  let armEvent: PlanEvent | undefined;
  if (plan.status === 'WATCHING' && touchedZone) {
    armEvent = eventFor(plan, 'ARMED', 'executor', 'Closed candle entered the planned price zone.', candle, timeframe);
    armedPlan = { ...plan, status: 'ARMED', updatedAt: armEvent.occurredAt };
  }
  if (armedPlan.status !== 'ARMED' || !triggerConfirmed(armedPlan, candle, previousCandle, recentCandles)) {
    return { plan: armedPlan, events: armEvent ? [armEvent] : [], reason: armEvent?.reason ?? 'Plan is waiting for price to enter its zone or confirm its trigger.' };
  }
  const gate = input.gate(armedPlan.zone.high);
  if (!gate.approved || !Number.isFinite(gate.quantity) || gate.quantity <= 0) {
    const reason = gate.reason ?? 'Entry gates rejected this trigger.';
    return { plan: { ...armedPlan, lastReason: reason, activeEventIds: gate.activeEventIds ?? [] }, events: [...(armEvent ? [armEvent] : []), gateEvent(armedPlan, reason, gate.activeEventIds ?? [], candle, timeframe)], reason };
  }
  const event = eventFor(armedPlan, 'PENDING_ORDER', 'executor', 'Closed-candle trigger confirmed and entry gates passed.', candle, timeframe);
  const order: PendingPaperOrder = {
    id: randomUUID(), planId: plan.id, accountId: plan.accountId, symbol: plan.symbol, side: plan.side,
    orderType: 'stop_entry', price: armedPlan.trigger.kind === 'close_above_level' ? armedPlan.trigger.level : armedPlan.zone.high,
    quantity: gate.quantity, createdAtBar: barIndex, expiresAtBar: Math.min(armedPlan.expiresAtBar, barIndex + traderConfig.PLAN_EXPIRY_BARS), status: 'pending',
  };
  return { plan: { ...armedPlan, status: 'PENDING_ORDER', updatedAt: event.occurredAt, lastReason: undefined, activeEventIds: gate.activeEventIds ?? [] }, pendingOrder: order, events: [...(armEvent ? [armEvent] : []), event], reason: event.reason };
}
