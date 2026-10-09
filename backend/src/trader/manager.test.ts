// Covers conservative stop order, partials, break-even, trailing, time and thesis exits.
import { describe, expect, it } from 'vitest';
import type { Candle } from '../../../src/lib/types';
import type { PaperPosition } from '../engines/paper-execution';
import { managePaperPosition } from './manager';

const position: PaperPosition = {
  id: 'position-1', symbol: 'BTCUSD', assetId: 'BTCUSD', side: 'buy', quantity: 10, entryPrice: 100, entryFee: 1,
  stopLoss: 95, takeProfit: 110, initialRisk: 5, initialQuantity: 10,
  targets: [{ price: 110, fractionOfPosition: 0.5 }, { price: 120, fractionOfPosition: 0.5 }], targetsTaken: [],
  barsHeld: 0, maxFavorablePrice: 100, status: 'open', openedAt: new Date(0).toISOString(),
};

function bar(values: Partial<Candle>): Candle {
  return { time: 60, open: 100, high: 100, low: 99, close: 100, volume: 1_000, ...values };
}

describe('paper position manager', () => {
  it('keeps stop-first behavior when stop and target are touched in one candle', () => {
    const result = managePaperPosition({ position, candle: bar({ low: 94, high: 111 }), barIndex: 1 });
    expect(result.exits).toEqual([{ quantity: 10, price: 95, reason: 'stop' }]);
    expect(result.position.status).toBe('closed');
  });

  it('scales out target fractions and moves the stop to fee-adjusted break-even after +1R', () => {
    const result = managePaperPosition({ position, candle: bar({ high: 111, close: 108 }), barIndex: 1 });
    expect(result.exits).toEqual([{ quantity: 5, price: 110, reason: 'target' }]);
    expect(result.position.quantity).toBe(5);
    expect(result.position.stopLoss).toBeGreaterThan(100);
    expect(result.position.targetsTaken).toEqual([0]);
  });

  it('advances the trailing stop without ever loosening it', () => {
    const first = managePaperPosition({ position, candle: bar({ high: 112, close: 110 }), atr: 2, swingLow: 105, barIndex: 1 });
    const second = managePaperPosition({ position: first.position, candle: bar({ high: 120, close: 117 }), atr: 1, swingLow: 114, barIndex: 2 });
    expect(first.position.stopLoss).toBeGreaterThan(95);
    expect(second.position.stopLoss).toBeGreaterThanOrEqual(first.position.stopLoss!);
  });

  it('accumulates MAE and MFE before early stop exits', () => {
    const first = managePaperPosition({ position, candle: bar({ high: 105, low: 98 }), barIndex: 1 });
    expect(first.position.maxFavorablePrice).toBe(105);
    expect(first.position.maxAdversePrice).toBe(98);
    const stopped = managePaperPosition({ position: first.position, candle: bar({ high: 110, low: 94 }), barIndex: 2 });
    expect(stopped.position.maxFavorablePrice).toBe(110);
    expect(stopped.position.maxAdversePrice).toBe(94);
  });

  it('exits after the configured time limit without progress', () => {
    const result = managePaperPosition({ position: { ...position, barsHeld: 95 }, candle: bar({ high: 100.2, close: 100 }), barIndex: 96 });
    expect(result.exits[0]?.reason).toBe('time-stop');
    expect(result.exits[0]?.quantity).toBe(10);
  });

  it('exits thesis invalidation at the next bar open', () => {
    const result = managePaperPosition({
      position, candle: bar({ open: 98, low: 97, high: 99, close: 98 }), barIndex: 3, invalidationObservedAtBar: 2,
    });
    expect(result.exits[0]).toEqual({ quantity: 10, price: 98, reason: 'thesis-invalidated' });
  });
});
