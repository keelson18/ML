import type { ChartPaperPosition, ChartPaperTrade } from './backend-api';

export interface TradeDrawing {
  trade: ChartPaperTrade;
  position?: ChartPaperPosition;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  open: boolean;
  pnlPct: number;
  rMultiple: number | null;
}

export function mapPaperTradesToDrawings(
  trades: ChartPaperTrade[],
  positions: ChartPaperPosition[],
  latest?: { time: number; close: number },
): TradeDrawing[] {
  const positionById = new Map(positions.map((position) => [position.id, position]));
  const completed = trades.flatMap((trade) => {
    const position = positionById.get(trade.positionId);
    const entryTime = Math.floor(Date.parse(trade.openedAt) / 1000);
    const exitTime = Math.floor(Date.parse(trade.closedAt) / 1000);
    const exitPrice = trade.exitPrice;
    if (!Number.isFinite(entryTime) || !Number.isFinite(exitTime) || !Number.isFinite(exitPrice)) return [];
    const direction = trade.side === 'buy' ? 1 : -1;
    const riskCash = position?.initialRisk && position.initialRisk > 0 ? position.initialRisk * trade.quantity : 0;
    return [{
      trade, position, entryTime, entryPrice: trade.entryPrice, exitTime, exitPrice, open: false,
      pnlPct: ((exitPrice - trade.entryPrice) * direction / trade.entryPrice) * 100,
      rMultiple: riskCash ? trade.realizedPnl / riskCash : null,
    }];
  });
  const active = positions.filter((position) => position.status === 'open')
    .flatMap((position) => {
      const exitTime = latest?.time;
      const exitPrice = latest?.close;
      const entryTime = Math.floor(Date.parse(position.openedAt) / 1000);
      if (!Number.isFinite(entryTime) || exitTime === undefined || exitPrice === undefined) return [];
      const direction = position.side === 'buy' ? 1 : -1;
      const riskCash = position.initialRisk && position.initialRisk > 0 ? position.initialRisk * position.quantity : 0;
      const floating = (exitPrice - position.entryPrice) * direction * position.quantity;
      const trade: ChartPaperTrade = {
        id: `open:${position.id}`, positionId: position.id, symbol: position.symbol, side: position.side,
        quantity: position.quantity, entryPrice: position.entryPrice, exitPrice, realizedPnl: 0,
        requestedEntryPrice: position.requestedEntryPrice,
        confidenceAtEntry: position.confidenceAtEntry,
        engineVersions: position.engineVersions,
        fees: position.entryFee, slippage: position.entrySlippage ?? 0, executionVersion: position.engineVersions?.execution ?? 'paper',
        openedAt: position.openedAt, closedAt: '', maeR: null, mfeR: null,
      };
      return [{ trade, position, entryTime, entryPrice: position.entryPrice, exitTime, exitPrice, open: true,
        pnlPct: ((exitPrice - position.entryPrice) * direction / position.entryPrice) * 100,
        rMultiple: riskCash ? floating / riskCash : null }];
    });
  return [...completed, ...active];
}
