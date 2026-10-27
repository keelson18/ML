import type { Candle } from './types';

export function normalizeCandles(candles: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const candle of candles) {
    if (!Number.isFinite(candle.time) || !Number.isFinite(candle.open) || !Number.isFinite(candle.high) || !Number.isFinite(candle.low) || !Number.isFinite(candle.close) || !Number.isFinite(candle.volume)) continue;
    if (candle.high < candle.low || candle.open < candle.low || candle.open > candle.high || candle.close < candle.low || candle.close > candle.high) continue;
    byTime.set(Math.floor(candle.time), { ...candle, time: Math.floor(candle.time) });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
