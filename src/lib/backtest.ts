import type { Candle, Signal, Side, Timeframe, Recommendation, MLPrediction } from './types';

// Simple backtest: walk forward, generate a signal at each bar using a strategy fn,
// enter a position, exit after `hold` bars. Compute win rate over all trades.
export function backtest(
  candles: Candle[],
  strategyFn: (c: Candle[]) => Signal | null,
  hold = 5,
): { winRate: number; confidence: number; sampleSize: number; trades: number } {
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
  if (trades === 0) return { winRate: 0, confidence: 0, sampleSize: 0, trades: 0 };
  const winRate = wins / trades;
  // Confidence: blend of win rate and sample size (more trades → more reliable).
  const sampleConf = Math.min(1, trades / 50);
  const confidence = winRate * 0.7 + sampleConf * 0.3;
  return { winRate, confidence, sampleSize: trades, trades };
}

// Combine all signals (weighted by confidence) + ML prediction into one recommendation.
export function combineSignals(
  signals: Signal[],
  ml: MLPrediction | null,
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
): Recommendation {
  const contributors: Recommendation['contributors'] = [];
  let weighted = 0;
  let totalWeight = 0;

  for (const s of signals) {
    const w = s.confidence;
    const val = s.side === 'buy' ? 1 : s.side === 'sell' ? -1 : 0;
    weighted += val * w;
    totalWeight += w;
    contributors.push({ source: s.strategy, side: s.side, weight: w, confidence: s.confidence, reason: s.reason });
  }

  if (ml) {
    const mlWeight = ml.confidence === 'high' ? 0.8 : ml.confidence === 'medium' ? 0.6 : 0.4;
    const mlVal = ml.prediction === 'up' ? 1 : ml.prediction === 'down' ? -1 : 0;
    weighted += mlVal * mlWeight;
    totalWeight += mlWeight;
    contributors.push({
      source: `ML Model v${ml.model_version}`,
      side: ml.prediction === 'up' ? 'buy' : ml.prediction === 'down' ? 'sell' : 'neutral',
      weight: mlWeight,
      confidence: ml.probability,
      reason: `p=${ml.probability.toFixed(2)}, exp move ${ml.expected_move_pct.toFixed(2)}%`,
    });
  }

  const score = totalWeight > 0 ? weighted / totalWeight : 0;
  const side: Side = score > 0.15 ? 'buy' : score < -0.15 ? 'sell' : 'neutral';

  // ATR-based risk levels.
  let stopLoss: number | undefined;
  let takeProfit: number | undefined;
  let entry: number | undefined;
  let atrVal: number | undefined;
  if (candles.length >= 20) {
    const last = candles[candles.length - 1];
    entry = last.close;
    // Inline ATR calc to avoid circular import; matches indicators.atr logic.
    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const period = 14;
    const slice = trs.slice(-period);
    atrVal = slice.reduce((a, b) => a + b, 0) / slice.length;
    const dir = side === 'buy' ? 1 : side === 'sell' ? -1 : 0;
    if (dir !== 0) {
      stopLoss = entry - dir * atrVal * 1.5;
      takeProfit = entry + dir * atrVal * 3;
    }
  }

  return {
    symbol,
    timeframe,
    side,
    score,
    contributors,
    stopLoss,
    takeProfit,
    entry,
    atr: atrVal,
    updatedAt: Date.now(),
  };
}
