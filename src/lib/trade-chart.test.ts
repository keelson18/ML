import { describe, expect, it } from 'vitest';
import { mapPaperTradesToDrawings } from './trade-chart';
import type { ChartPaperPosition, ChartPaperTrade } from './backend-api';

const trade: ChartPaperTrade = {
  id: 'trade-1', positionId: 'position-1', symbol: 'BTCUSD', side: 'buy', quantity: 2,
  entryPrice: 100, exitPrice: 110, realizedPnl: 18, fees: 2, slippage: 0.5,
  requestedEntryPrice: 99.5, confidenceAtEntry: 0.82, engineVersions: { strategy: 's1', execution: 'v1' },
  executionVersion: 'paper-v1', openedAt: '2026-01-01T00:00:00.000Z', closedAt: '2026-01-01T01:00:00.000Z',
  maeR: -0.2, mfeR: 1.2, exitReason: 'TP1',
};

describe('paper trade chart mapping', () => {
  it('maps closed fills to entry and exit markers with realized R', () => {
    const position: ChartPaperPosition = { id: 'position-1', symbol: 'BTCUSD', side: 'buy', quantity: 2, entryPrice: 100,
      entryFee: 1, initialRisk: 5, status: 'closed', openedAt: trade.openedAt, closedAt: trade.closedAt };
    const [drawing] = mapPaperTradesToDrawings([trade], [position]);
    expect(drawing).toMatchObject({ entryTime: 1767225600, entryPrice: 100, exitTime: 1767229200, exitPrice: 110, open: false, rMultiple: 1.8 });
  });

  it('extends open positions to the latest chart price and computes floating PnL', () => {
    const position: ChartPaperPosition = { id: 'position-1', symbol: 'BTCUSD', side: 'buy', quantity: 2, entryPrice: 100,
      entryFee: 1, initialRisk: 5, status: 'open', openedAt: trade.openedAt };
    const [drawing] = mapPaperTradesToDrawings([], [position], { time: 1767232800, close: 105 });
    expect(drawing).toMatchObject({ exitTime: 1767232800, exitPrice: 105, open: true, pnlPct: 5, rMultiple: 1, trade: { requestedEntryPrice: undefined } });
  });
});
