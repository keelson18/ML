// Applies closed-candle position rules; stop checks precede every discretionary adjustment.
import type { Candle } from '../../../src/lib/types';
import { traderConfig } from './config';
import type { PaperPosition } from '../engines/paper-execution';

export interface PositionExit {
  quantity: number;
  price: number;
  reason: 'stop' | 'target' | 'time-stop' | 'thesis-invalidated';
}

export interface ManagementResult {
  position: PaperPosition;
  exits: PositionExit[];
  actions: string[];
}

function positive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

export function managePaperPosition(input: {
  position: PaperPosition;
  candle: Candle;
  atr?: number;
  swingLow?: number;
  swingHigh?: number;
  thesisInvalidatedAt?: string;
  feeRate?: number;
}): ManagementResult {
  const { position, candle } = input;
  if (position.status !== 'open') return { position, exits: [], actions: [] };
  const maxFavorablePrice = position.side === 'buy'
    ? Math.max(position.maxFavorablePrice ?? position.entryPrice, candle.high)
    : Math.min(position.maxFavorablePrice ?? position.entryPrice, candle.low);
  const maxAdversePrice = position.side === 'buy'
    ? Math.min(position.maxAdversePrice ?? position.entryPrice, candle.low)
    : Math.max(position.maxAdversePrice ?? position.entryPrice, candle.high);
  let updated: PaperPosition = { ...position, barsHeld: (position.barsHeld ?? 0) + 1, maxFavorablePrice, maxAdversePrice };
  const exits: PositionExit[] = [];
  const actions: string[] = [];
  const currentStop = position.stopLoss;

  // Intrabar ordering is unknowable, so a touched stop wins over targets and management changes.
  const stopTouched = currentStop !== undefined && (position.side === 'buy'
    ? candle.low <= currentStop
    : candle.high >= currentStop);
  if (stopTouched && currentStop !== undefined) {
    const price = position.side === 'buy'
      ? candle.open <= currentStop ? candle.open : currentStop
      : candle.open >= currentStop ? candle.open : currentStop;
    exits.push({ quantity: position.quantity, price, reason: 'stop' });
    return { position: { ...updated, quantity: 0, status: 'closed' }, exits, actions: ['Initial or trailing stop touched.'] };
  }

  const invalidationObservedAt = input.thesisInvalidatedAt ?? position.thesisInvalidatedAt;
  if (invalidationObservedAt && candle.time * 1000 >= Date.parse(invalidationObservedAt)) {
    exits.push({ quantity: position.quantity, price: candle.open, reason: 'thesis-invalidated' });
    return { position: { ...updated, quantity: 0, status: 'closed' }, exits, actions: ['Thesis invalidation exited at the next bar open.'] };
  }

  const initialRisk = position.initialRisk ?? (currentStop === undefined ? undefined : Math.abs(position.entryPrice - currentStop));
  const originalQuantity = position.initialQuantity ?? position.quantity;
  const alreadyTaken = new Set(position.targetsTaken ?? []);
  let remaining = position.quantity;
  for (const [index, target] of (position.targets ?? []).entries()) {
    const targetTouched = position.side === 'buy' ? candle.high >= target.price : candle.low <= target.price;
    if (alreadyTaken.has(index) || !targetTouched) continue;
    const requested = target.fractionOfPosition >= 1
      ? remaining
      : Math.min(remaining, originalQuantity * target.fractionOfPosition);
    if (requested <= 0) continue;
    const price = position.side === 'buy' ? Math.max(target.price, candle.open) : Math.min(target.price, candle.open);
    exits.push({ quantity: requested, price, reason: 'target' });
    remaining -= requested;
    alreadyTaken.add(index);
    actions.push(`Target ${index + 1} partially or fully exited ${requested} units.`);
  }
  updated = { ...updated, quantity: remaining, targetsTaken: [...alreadyTaken] };
  if (remaining <= Number.EPSILON * Math.max(1, position.quantity)) {
    return { position: { ...updated, quantity: 0, status: 'closed' }, exits, actions };
  }

  if (positive(initialRisk)) {
    const favorableR = position.side === 'buy'
      ? (candle.high - position.entryPrice) / initialRisk
      : (position.entryPrice - candle.low) / initialRisk;
    if (favorableR >= traderConfig.BREAK_EVEN_R) {
      const feeRate = input.feeRate ?? traderConfig.FEE_RATE;
      const breakEven = feeRate < 1
        ? position.side === 'buy'
          ? position.entryPrice * (1 + feeRate) / (1 - feeRate)
          : position.entryPrice * (1 - feeRate) / (1 + feeRate)
        : position.entryPrice;
      const nextStop = position.side === 'buy'
        ? Math.max(updated.stopLoss ?? Number.NEGATIVE_INFINITY, breakEven)
        : Math.min(updated.stopLoss ?? Number.POSITIVE_INFINITY, breakEven);
      if (updated.stopLoss === undefined || (position.side === 'buy' ? nextStop > updated.stopLoss : nextStop < updated.stopLoss)) {
        updated = { ...updated, stopLoss: nextStop };
        actions.push(`Stop moved to fee-adjusted break-even after +${traderConfig.BREAK_EVEN_R}R.`);
      }
    }
    if (favorableR >= traderConfig.TRAIL_START_R && positive(input.atr)) {
      const atrStop = position.side === 'buy'
        ? candle.close - input.atr * traderConfig.TRAILING_ATR_MULTIPLE
        : candle.close + input.atr * traderConfig.TRAILING_ATR_MULTIPLE;
      const structureStop = position.side === 'buy'
        ? positive(input.swingLow) ? input.swingLow : Number.NEGATIVE_INFINITY
        : positive(input.swingHigh) ? input.swingHigh : Number.POSITIVE_INFINITY;
      const candidate = position.side === 'buy' ? Math.max(atrStop, structureStop) : Math.min(atrStop, structureStop);
      const nextStop = position.side === 'buy'
        ? Math.max(updated.stopLoss ?? Number.NEGATIVE_INFINITY, candidate)
        : Math.min(updated.stopLoss ?? Number.POSITIVE_INFINITY, candidate);
      if (Number.isFinite(nextStop) && (updated.stopLoss === undefined || (position.side === 'buy' ? nextStop > updated.stopLoss : nextStop < updated.stopLoss))) {
        updated = { ...updated, stopLoss: nextStop };
        actions.push('Trailing stop advanced under current structure/ATR.');
      }
    }
    const progressR = position.side === 'buy'
      ? (candle.close - position.entryPrice) / initialRisk
      : (position.entryPrice - candle.close) / initialRisk;
    if ((updated.barsHeld ?? 0) >= traderConfig.TIME_STOP_BARS && progressR < traderConfig.TIME_STOP_MIN_PROGRESS_R) {
      exits.push({ quantity: remaining, price: candle.close, reason: 'time-stop' });
      return { position: { ...updated, quantity: 0, status: 'closed' }, exits, actions: [...actions, 'Time stop closed a position without sufficient progress.'] };
    }
  }
  return { position: updated, exits, actions };
}
