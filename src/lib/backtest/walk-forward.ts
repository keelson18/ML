import type { Candle, Signal } from '../types';

// Walk-Forward Analysis: rolling optimization + out-of-sample validation

export interface WalkForwardResult {
  window: number;
  inSampleWinRate: number;
  outOfSampleWinRate: number;
  inSampleTrades: number;
  outOfSampleTrades: number;
  robustness: number; // 0-1, how consistent performance is across windows
}

export function walkForward(
  candles: Candle[],
  strategyFn: (c: Candle[], params: Record<string, number>) => Signal | null,
  paramSets: Record<string, number>[],
  windowSize = 200,
  stepSize = 50,
): WalkForwardResult[] {
  const results: WalkForwardResult[] = [];

  for (let start = 0; start + windowSize * 2 < candles.length; start += stepSize) {
    const inSample = candles.slice(start, start + windowSize);
    const outOfSample = candles.slice(start + windowSize, start + windowSize * 2);

    // Find best params on in-sample
    let bestParams = paramSets[0];
    let bestWinRate = 0;

    for (const params of paramSets) {
      const { winRate } = simulateTrades(inSample, (c) => strategyFn(c, params));
      if (winRate > bestWinRate) {
        bestWinRate = winRate;
        bestParams = params;
      }
    }

    // Test best params on out-of-sample
    const { winRate: oosWinRate, trades: oosTrades } = simulateTrades(outOfSample, (c) => strategyFn(c, bestParams));
    const { winRate: isWinRate, trades: isTrades } = simulateTrades(inSample, (c) => strategyFn(c, bestParams));

    // Robustness: OOS win rate / IS win rate (closer to 1 = more robust)
    const robustness = isWinRate > 0 ? Math.min(1, oosWinRate / isWinRate) : 0;

    results.push({
      window: start,
      inSampleWinRate: isWinRate,
      outOfSampleWinRate: oosWinRate,
      inSampleTrades: isTrades,
      outOfSampleTrades: oosTrades,
      robustness,
    });
  }

  return results;
}

function simulateTrades(
  candles: Candle[],
  strategyFn: (c: Candle[]) => Signal | null,
  hold = 5,
): { winRate: number; trades: number } {
  let wins = 0;
  let trades = 0;

  for (let i = 30; i < candles.length - hold; i++) {
    const slice = candles.slice(0, i + 1);
    const sig = strategyFn(slice);
    if (!sig || sig.side === 'neutral') continue;
    const entry = candles[i].close;
    const exit = candles[i + hold].close;
    const longWin = sig.side === 'buy' && exit > entry;
    const shortWin = sig.side === 'sell' && exit < entry;
    trades++;
    if (longWin || shortWin) wins++;
  }

  return {
    winRate: trades > 0 ? wins / trades : 0,
    trades,
  };
}

