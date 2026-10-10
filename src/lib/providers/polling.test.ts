import { describe, expect, it } from 'vitest';
import type { Candle } from '../types';
import { shouldEmitLatestCandle } from './client';
import { getNewlyClosedCandles } from './polling';

// Keeps fixtures small while making candle timestamps explicit.
function candle(time: number): Candle {
  return { time, open: 1, high: 1, low: 1, close: 1, volume: 1 };
}

describe('getNewlyClosedCandles', () => {
  it('does not close candles on the first poll', () => {
    expect(getNewlyClosedCandles([candle(100), candle(200)], undefined)).toEqual([]);
  });

  it('closes the previously observed candle on a one-candle advance', () => {
    expect(getNewlyClosedCandles([candle(100), candle(200), candle(300)], 200)).toEqual([candle(200)]);
  });

  it('closes all observed candles after missed polls', () => {
    expect(getNewlyClosedCandles([candle(100), candle(200), candle(300), candle(400)], 100)).toEqual([
      candle(100), candle(200), candle(300),
    ]);
  });

  it('does not close anything when the latest candle has not advanced', () => {
    expect(getNewlyClosedCandles([candle(100), candle(200)], 200)).toEqual([]);
  });
});

describe('shouldEmitLatestCandle', () => {
  it('emits the latest candle only when a new bar arrived', () => {
    expect(shouldEmitLatestCandle(undefined, 100)).toBe(true);
    expect(shouldEmitLatestCandle(100, 200)).toBe(true);
    expect(shouldEmitLatestCandle(200, 200)).toBe(false);
  });
});
