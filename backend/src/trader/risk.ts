// Shared mark-to-market and stop-distance sizing calculations for paper and replay paths.
import type { PaperAccountState } from '../engines/paper-execution';
import { traderConfig } from './config';

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
  if (!Number.isFinite(input.entry) || input.entry <= 0 || !Number.isFinite(perUnitRisk) || perUnitRisk <= 0) {
    return { accepted: false, quantity: 0, riskCash, perUnitRisk, reason: 'Invalid stop distance.' };
  }
  if (!Number.isFinite(input.equity) || input.equity <= 0 || !Number.isFinite(input.cash) || input.cash <= 0) {
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
  positions: Array<{ position: PaperAccountState['positions'][number]; currentPrice: number; pnl: number; pnlPct: number; weight: number }>;
}

export function markToMarket(account: PaperAccountState, markPrices: Readonly<Record<string, number>>): MarkToMarketSnapshot {
  const positions = account.positions.filter((position) => position.status === 'open').map((position) => {
    const currentPrice = markPrices[position.symbol] ?? position.entryPrice;
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
    positions: positions.map((item) => ({ ...item, weight: equity > 0 ? item.currentPrice * item.position.quantity / equity : 0 })),
  };
}
