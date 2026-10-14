// Shared mark-to-market and stop-distance sizing calculations for paper and replay paths.
import type { PaperAccountState, PaperTrade } from '../engines/paper-execution';
import type { Timeframe } from '../../../src/lib/types';
import { candleSeconds } from './candle-math';
import { traderConfig } from './config';

export function isLossStreakCooldownActive(input: {
  trades: PaperTrade[];
  closedPositionIds: ReadonlySet<string>;
  asOfMs: number;
  timeframe: Timeframe;
  limit?: number;
  cooldownBars?: number;
}): boolean {
  const closedPositions = new Map<string, { pnl: number; closedAt: number }>();
  for (const trade of input.trades) {
    const closedAt = Date.parse(trade.closedAt);
    if (!input.closedPositionIds.has(trade.positionId) || !Number.isFinite(closedAt) || closedAt > input.asOfMs) continue;
    const aggregate = closedPositions.get(trade.positionId) ?? { pnl: 0, closedAt };
    aggregate.pnl += trade.realizedPnl;
    aggregate.closedAt = Math.max(aggregate.closedAt, closedAt);
    closedPositions.set(trade.positionId, aggregate);
  }
  const latestFirst = [...closedPositions.entries()]
    .sort(([leftId, left], [rightId, right]) => right.closedAt - left.closedAt || leftId.localeCompare(rightId))
    .map(([, position]) => position);
  let consecutiveLosses = 0;
  for (const position of latestFirst) {
    if (position.pnl >= 0) break;
    consecutiveLosses += 1;
  }
  const lossLimit = input.limit ?? traderConfig.LOSS_STREAK_LIMIT;
  const cooldownBars = input.cooldownBars ?? traderConfig.LOSS_STREAK_COOLDOWN_BARS;
  if (consecutiveLosses < lossLimit) return false;
  const mostRecentLoss = latestFirst[0];
  const barSeconds = candleSeconds(input.timeframe, mostRecentLoss!.closedAt / 1000);
  return (input.asOfMs - mostRecentLoss!.closedAt) < cooldownBars * barSeconds * 1000;
}

export function lossStreakCooldownReason(input: Parameters<typeof isLossStreakCooldownActive>[0]): string | undefined {
  if (!isLossStreakCooldownActive(input)) return undefined;
  return `Consecutive-loss lockout active for ${traderConfig.LOSS_STREAK_COOLDOWN_BARS} ${input.timeframe} bars after ${traderConfig.LOSS_STREAK_LIMIT} losing closed positions.`;
}

export interface PositionSizingInput {
  equity: number;
  entry: number;
  invalidation: number;
  cash: number;
  grossExposure: number;
  symbolExposure: number;
}

export interface PositionSizingResult {
  accepted: boolean;
  quantity: number;
  riskCash: number;
  perUnitRisk: number;
  reason?: string;
}

export function calculatePositionSize(input: PositionSizingInput): PositionSizingResult {
  const perUnitRisk = Math.abs(input.entry - input.invalidation);
  const riskCash = input.equity * traderConfig.RISK_PER_TRADE_PCT / 100;
  if (![input.equity, input.entry, input.invalidation, input.cash, input.grossExposure, input.symbolExposure].every(Number.isFinite)
    || input.entry <= 0 || input.invalidation <= 0 || input.invalidation >= input.entry || perUnitRisk <= 0
    || input.grossExposure < 0 || input.symbolExposure < 0) {
    return { accepted: false, quantity: 0, riskCash, perUnitRisk, reason: 'Invalid stop distance.' };
  }
  if (input.equity <= 0 || input.cash <= 0) {
    return { accepted: false, quantity: 0, riskCash, perUnitRisk, reason: 'Insufficient paper equity or cash.' };
  }
  const maxQtyByRisk = riskCash / perUnitRisk;
  const costPerUnit = input.entry * (1 + traderConfig.SLIPPAGE_RATE) * (1 + traderConfig.FEE_RATE);
  const maxQtyByCash = input.cash / costPerUnit;
  const grossHeadroom = Math.max(0, input.equity * traderConfig.MAX_GROSS_EXPOSURE_PCT / 100 - input.grossExposure);
  const symbolHeadroom = Math.max(0, input.equity * traderConfig.MAX_SYMBOL_EXPOSURE_PCT / 100 - input.symbolExposure);
  const quantity = Math.min(maxQtyByRisk, maxQtyByCash, grossHeadroom / input.entry, symbolHeadroom / input.entry);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { accepted: false, quantity: 0, riskCash, perUnitRisk, reason: 'Exposure or cash limits leave no available position size.' };
  }
  return { accepted: true, quantity, riskCash, perUnitRisk };
}

export interface MarkToMarketSnapshot {
  equity: number;
  grossExposure: number;
  unrealizedPnl: number;
  drawdownPct: number;
  /** Positions without a valid current mark are shown at entry for diagnostics, never treated as verified risk inputs. */
  missingMarkSymbols: string[];
  positions: Array<{ position: PaperAccountState['positions'][number]; currentPrice: number; pnl: number; pnlPct: number; weight: number }>;
}

export function markToMarket(account: PaperAccountState, markPrices: Readonly<Record<string, number>>): MarkToMarketSnapshot {
  const openPositions = account.positions.filter((position) => position.status === 'open');
  const missingMarkSymbols = [...new Set(openPositions.filter((position) =>
    !Number.isFinite(markPrices[position.symbol]) || (markPrices[position.symbol] ?? 0) <= 0,
  ).map((position) => position.symbol))];
  const positions = openPositions.map((position) => {
    const suppliedMark = markPrices[position.symbol];
    const currentPrice = Number.isFinite(suppliedMark) && suppliedMark > 0 ? suppliedMark : position.entryPrice;
    const pnl = position.side === 'buy'
      ? (currentPrice - position.entryPrice) * position.quantity
      : (position.entryPrice - currentPrice) * position.quantity;
    return { position, currentPrice, pnl, pnlPct: position.entryPrice > 0 ? pnl / (position.entryPrice * position.quantity) : 0, weight: 0 };
  });
  const grossExposure = positions.reduce((sum, item) => sum + item.currentPrice * item.position.quantity, 0);
  const equity = Math.max(0, account.cash + grossExposure);
  const unrealizedPnl = positions.reduce((sum, item) => sum + item.pnl, 0);
  const equityPoints = [traderConfig.TRADER_STARTING_EQUITY];
  let realizedEquity = traderConfig.TRADER_STARTING_EQUITY;
  for (const trade of account.trades) {
    realizedEquity += trade.realizedPnl;
    equityPoints.push(realizedEquity);
  }
  equityPoints.push(equity);
  let peak = traderConfig.TRADER_STARTING_EQUITY;
  let drawdownPct = 0;
  for (const point of equityPoints) {
    peak = Math.max(peak, point);
    if (peak > 0) drawdownPct = Math.max(drawdownPct, (peak - point) / peak * 100);
  }
  return {
    equity,
    grossExposure,
    unrealizedPnl,
    drawdownPct,
    missingMarkSymbols,
    positions: positions.map((item) => ({ ...item, weight: equity > 0 ? item.currentPrice * item.position.quantity / equity : 0 })),
  };
}
