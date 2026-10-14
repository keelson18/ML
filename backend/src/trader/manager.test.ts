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
const shortPosition: PaperPosition = {
  ...position, id: 'short-position', side: 'sell', stopLoss: 105,
  targets: [{ price: 90, fractionOfPosition: 0.5 }, { price: 80, fractionOfPosition: 0.5 }], initialRisk: 5,
};

function bar(values: Partial<Candle>): Candle {
  return { time: 60, open: 100, high: 100, low: 99, close: 100, volume: 1_000, ...values };
}

describe('paper position manager', () => {
  it('keeps stop-first behavior when stop and target are touched in one candle', () => {
    const result = managePaperPosition({ position, candle: bar({ low: 94, high: 111 }) });
    expect(result.exits).toEqual([{ quantity: 10, price: 95, reason: 'stop' }]);
    expect(result.position.status).toBe('closed');
  });

  it('scales out target fractions and moves the stop to fee-adjusted break-even after +1R', () => {
    const result = managePaperPosition({ position, candle: bar({ high: 111, close: 108 }) });
    expect(result.exits).toEqual([{ quantity: 5, price: 110, reason: 'target' }]);
    expect(result.position.quantity).toBe(5);
    expect(result.position.stopLoss).toBeGreaterThan(100);
    expect(result.position.targetsTaken).toEqual([0]);
  });

  it('advances the trailing stop without ever loosening it', () => {
    const first = managePaperPosition({ position, candle: bar({ high: 112, close: 110 }), atr: 2, swingLow: 105 });
    const second = managePaperPosition({ position: first.position, candle: bar({ high: 120, close: 117 }), atr: 1, swingLow: 114 });
    expect(first.position.stopLoss).toBeGreaterThan(95);
    expect(second.position.stopLoss).toBeGreaterThanOrEqual(first.position.stopLoss!);
  });

  it('accumulates MAE and MFE before early stop exits', () => {
    const first = managePaperPosition({ position, candle: bar({ high: 105, low: 98 }) });
    expect(first.position.maxFavorablePrice).toBe(105);
    expect(first.position.maxAdversePrice).toBe(98);
    const stopped = managePaperPosition({ position: first.position, candle: bar({ high: 110, low: 94 }) });
    expect(stopped.position.maxFavorablePrice).toBe(110);
    expect(stopped.position.maxAdversePrice).toBe(94);
  });

  it('exits after the configured time limit without progress', () => {
    const result = managePaperPosition({ position: { ...position, barsHeld: 95 }, candle: bar({ high: 100.2, close: 100 }) });
    expect(result.exits[0]?.reason).toBe('time-stop');
    expect(result.exits[0]?.quantity).toBe(10);
  });

  it('exits on the first management bar at or after a persisted thesis invalidation', () => {
    const invalidated = { ...position, thesisInvalidatedAt: new Date(120_000).toISOString() };
    const before = managePaperPosition({ position: invalidated, candle: bar({ time: 115, open: 99 }) });
    expect(before.exits).toHaveLength(0);
    const next = managePaperPosition({ position: invalidated, candle: bar({ time: 120, open: 98 }) });
    expect(next.exits[0]).toEqual({ quantity: 10, price: 98, reason: 'thesis-invalidated' });
  });

  it('gives a protective stop priority over thesis invalidation', () => {
    const result = managePaperPosition({
      position: { ...position, thesisInvalidatedAt: new Date(60_000).toISOString() },
      candle: bar({ time: 60, open: 94, low: 93 }),
    });
    expect(result.exits).toEqual([{ quantity: 10, price: 94, reason: 'stop' }]);
  });

  it('applies short stop-first rules and adverse gap pricing', () => {
    const result = managePaperPosition({ position: shortPosition, candle: bar({ open: 107, high: 108, low: 79 }) });
    expect(result.exits).toEqual([{ quantity: 10, price: 107, reason: 'stop' }]);
    expect(result.position.status).toBe('closed');
  });

  it('takes short targets on the candle low and covers at the worse opening price on a favorable gap', () => {
    const result = managePaperPosition({ position: shortPosition, candle: bar({ open: 87, high: 101, low: 79, close: 85 }) });
    expect(result.exits).toEqual([{ quantity: 5, price: 87, reason: 'target' }, { quantity: 5, price: 80, reason: 'target' }]);
    expect(result.position.status).toBe('closed');
  });

  it('moves a short stop down to fee-adjusted break-even and trails it without loosening', () => {
    const breakEven = managePaperPosition({ position: shortPosition, candle: bar({ high: 101, low: 94, close: 96 }) });
    expect(breakEven.position.stopLoss).toBeLessThan(100);
    const trailing = managePaperPosition({ position: shortPosition, candle: bar({ high: 100, low: 88, close: 90 }), atr: 1, swingHigh: 94 });
    expect(trailing.position.stopLoss).toBeLessThanOrEqual(94);
    const next = managePaperPosition({ position: trailing.position, candle: bar({ high: 91, low: 86, close: 88 }), atr: 1, swingHigh: 89 });
    expect(next.position.stopLoss).toBeLessThanOrEqual(trailing.position.stopLoss!);
  });

  it('measures short progress and favorable/adverse excursions in the correct direction', () => {
    const result = managePaperPosition({ position: shortPosition, candle: bar({ high: 103, low: 90, close: 94 }) });
    expect(result.position.maxFavorablePrice).toBe(90);
    expect(result.position.maxAdversePrice).toBe(103);
    expect(result.position.stopLoss).toBeLessThan(105);
  });
});
