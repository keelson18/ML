import type { Candle, Signal, Side, Timeframe } from './types';
import { sma, rsi, bollinger, atr, findSwings } from './indicators';

// ---- Pattern detection helpers ----

// Head & shoulders / inverse: three peaks with the middle highest, neckline break.
function detectHeadShoulders(candles: Candle[]): Signal | null {
  if (candles.length < 40) return null;
  const { highs } = findSwings(candles, 3, 3);
  if (highs.length < 3) return null;
  const last3 = highs.slice(-3);
  const [a, b, c] = last3;
  const isRegular = b.value > a.value && b.value > c.value && Math.abs(a.value - c.value) / b.value < 0.08;
  const isInverse = b.value < a.value && b.value < c.value && Math.abs(a.value - c.value) / b.value < 0.08;
  if (!isRegular && !isInverse) return null;
  const last = candles[candles.length - 1].close;
  const neckline = Math.min(a.value, c.value);
  if (isRegular && last < neckline) {
    return { strategy: 'Head & Shoulders', side: 'sell', confidence: 0.62, reason: 'Bearish H&S confirmed, neckline broken', overlays: [markerOverlay(last3, 'arrowDown', 'H&S')] };
  }
  if (isInverse && last > neckline) {
    return { strategy: 'Inverse H&S', side: 'buy', confidence: 0.62, reason: 'Bullish inverse H&S confirmed, neckline broken', overlays: [markerOverlay(last3, 'arrowUp', 'iH&S')] };
  }
  return null;
}

function markerOverlay(swings: { time: number; value: number }[], shape: 'arrowUp' | 'arrowDown', label: string) {
  return {
    type: 'markers' as const,
    id: label,
    markers: swings.map((s) => ({ time: s.time, position: 'belowBar' as const, color: shape === 'arrowUp' ? '#22c55e' : '#ef4444', shape, text: label })),
  };
}

// Double top / bottom: two swing highs (or lows) near the same level.
function detectDoubleTopBottom(candles: Candle[]): Signal | null {
  if (candles.length < 30) return null;
  const { highs, lows } = findSwings(candles, 3, 3);
  if (highs.length >= 2) {
    const [a, b] = highs.slice(-2);
    if (Math.abs(a.value - b.value) / a.value < 0.03 && b.time - a.time > 0) {
      const last = candles[candles.length - 1].close;
      const trough = Math.min(...candles.slice(a.index, b.index + 1).map((c) => c.low));
      if (last < trough) {
        return { strategy: 'Double Top', side: 'sell', confidence: 0.58, reason: 'Double top confirmed by breakdown', overlays: [markerOverlay([a, b], 'arrowDown', 'DT')] };
      }
    }
  }
  if (lows.length >= 2) {
    const [a, b] = lows.slice(-2);
    if (Math.abs(a.value - b.value) / a.value < 0.03 && b.time - a.time > 0) {
      const last = candles[candles.length - 1].close;
      const peak = Math.max(...candles.slice(a.index, b.index + 1).map((c) => c.high));
      if (last > peak) {
        return { strategy: 'Double Bottom', side: 'buy', confidence: 0.58, reason: 'Double bottom confirmed by breakout', overlays: [markerOverlay([a, b], 'arrowUp', 'DB')] };
      }
    }
  }
  return null;
}

// Triangle / flag: converging or parallel trendlines from recent swings.
function detectTriangleFlag(candles: Candle[]): Signal | null {
  if (candles.length < 40) return null;
  const { highs, lows } = findSwings(candles, 2, 2);
  if (highs.length < 2 || lows.length < 2) return null;
  const hh = highs.slice(-2), ll = lows.slice(-2);
  const slopeHigh = (hh[1].value - hh[0].value) / (hh[1].index - hh[0].index || 1);
  const slopeLow = (ll[1].value - ll[0].value) / (ll[1].index - ll[0].index || 1);
  const converging = Math.sign(slopeHigh) !== Math.sign(slopeLow) && Math.abs(slopeHigh - slopeLow) > 0;
  const flagParallel = Math.sign(slopeHigh) === Math.sign(slopeLow) && Math.abs(slopeHigh - slopeLow) / (Math.abs(slopeHigh) + 1e-9) < 0.3;
  if (converging) {
    const last = candles[candles.length - 1].close;
    const side: Side = last > (hh[0].value + hh[1].value) / 2 ? 'buy' : 'neutral';
    return { strategy: 'Triangle', side, confidence: 0.5, reason: 'Converging trendlines — breakout pending', overlays: [lineOverlay([hh[0], hh[1]], '#f59e0b', 'resist'), lineOverlay([ll[0], ll[1]], '#f59e0b', 'support')] };
  }
  if (flagParallel) {
    const dir = slopeHigh > 0 ? 'buy' : 'sell';
    return { strategy: 'Flag', side: dir as Side, confidence: 0.48, reason: 'Parallel channel — flag continuation likely', overlays: [lineOverlay([hh[0], hh[1]], '#06b6d4', 'upper'), lineOverlay([ll[0], ll[1]], '#06b6d4', 'lower')] };
  }
  return null;
}

function lineOverlay(points: { time: number; value: number }[], color: string, label: string) {
  return { type: 'line' as const, id: label, points, color, label };
}

// ---- Strategy signals ----

// MA crossover: fast SMA crosses slow SMA.
function maCrossSignal(candles: Candle[]): Signal | null {
  if (candles.length < 55) return null;
  const closes = candles.map((c) => c.close);
  const fast = sma(closes, 20);
  const slow = sma(closes, 50);
  const i = closes.length - 1;
  const prev = i - 1;
  if (isNaN(fast[i]) || isNaN(slow[i]) || isNaN(fast[prev]) || isNaN(slow[prev])) return null;
  const crossUp = fast[prev] <= slow[prev] && fast[i] > slow[i];
  const crossDown = fast[prev] >= slow[prev] && fast[i] < slow[i];
  const side: Side = crossUp ? 'buy' : crossDown ? 'sell' : 'neutral';
  const confidence = crossUp || crossDown ? 0.6 : 0.42;
  return {
    strategy: 'MA Crossover',
    side,
    confidence,
    reason: crossUp ? '20 SMA crossed above 50 SMA (golden)' : crossDown ? '20 SMA crossed below 50 SMA (death)' : 'MAs trending, no fresh cross',
    overlays: [
      { type: 'line' as const, id: 'sma20', points: closes.map((c, j) => ({ time: candles[j].time, value: fast[j] })).filter((p) => !isNaN(p.value)), color: '#10a37f', label: 'SMA20' },
      { type: 'line' as const, id: 'sma50', points: closes.map((c, j) => ({ time: candles[j].time, value: slow[j] })).filter((p) => !isNaN(p.value)), color: '#f59e0b', label: 'SMA50' },
    ],
  };
}

// RSI divergence: price making higher highs while RSI makes lower highs (bearish), or vice versa.
function rsiDivergenceSignal(candles: Candle[]): Signal | null {
  if (candles.length < 35) return null;
  const closes = candles.map((c) => c.close);
  const r = rsi(closes, 14);
  const { highs, lows } = findSwings(candles, 3, 3);
  if (highs.length >= 2) {
    const [a, b] = highs.slice(-2);
    if (b.value > a.value && r[b.index] < r[a.index] && r[b.index] < 70) {
      return { strategy: 'RSI Divergence', side: 'sell', confidence: 0.55, reason: 'Bearish RSI divergence on swing highs', overlays: [markerOverlay([a, b], 'arrowDown', 'bear div')] };
    }
  }
  if (lows.length >= 2) {
    const [a, b] = lows.slice(-2);
    if (b.value < a.value && r[b.index] > r[a.index] && r[b.index] > 30) {
      return { strategy: 'RSI Divergence', side: 'buy', confidence: 0.55, reason: 'Bullish RSI divergence on swing lows', overlays: [markerOverlay([a, b], 'arrowUp', 'bull div')] };
    }
  }
  return null;
}

// Bollinger squeeze: width at multi-bar low → breakout direction.
function bollingerSignal(candles: Candle[]): Signal | null {
  if (candles.length < 60) return null;
  const closes = candles.map((c) => c.close);
  const { upper, lower, middle, width } = bollinger(closes, 20, 2);
  const i = closes.length - 1;
  const lookback = width.slice(Math.max(0, i - 50), i);
  const minW = Math.min(...lookback);
  const isSqueeze = width[i] <= minW * 1.2;
  const last = closes[i];
  let side: Side = 'neutral';
  let reason = 'Bollinger bands stable';
  if (isSqueeze) {
    reason = 'Bollinger squeeze — volatility expansion imminent';
    if (last > middle[i]) { side = 'buy'; reason = 'Squeeze breakout to the upside'; }
    else if (last < middle[i]) { side = 'sell'; reason = 'Squeeze breakout to the downside'; }
  } else {
    if (last > upper[i]) { side = 'sell'; reason = 'Price above upper band — overbought'; }
    else if (last < lower[i]) { side = 'buy'; reason = 'Price below lower band — oversold'; }
  }
  return {
    strategy: 'Bollinger',
    side,
    confidence: isSqueeze ? 0.5 : 0.45,
    reason,
    overlays: [
      { type: 'line' as const, id: 'bbu', points: closes.map((c, j) => ({ time: candles[j].time, value: upper[j] })).filter((p) => !isNaN(p.value)), color: '#6b7280', label: 'BB upper' },
      { type: 'line' as const, id: 'bbm', points: closes.map((c, j) => ({ time: candles[j].time, value: middle[j] })).filter((p) => !isNaN(p.value)), color: '#6b7280', label: 'BB mid' },
      { type: 'line' as const, id: 'bbl', points: closes.map((c, j) => ({ time: candles[j].time, value: lower[j] })).filter((p) => !isNaN(p.value)), color: '#6b7280', label: 'BB lower' },
    ],
  };
}

// Support / resistance zones from recent swing clusters.
function supportResistanceSignal(candles: Candle[]): Signal | null {
  if (candles.length < 40) return null;
  const { highs, lows } = findSwings(candles, 3, 3);
  const last = candles[candles.length - 1].close;
  const recentHighs = highs.slice(-3).map((h) => h.value);
  const recentLows = lows.slice(-3).map((l) => l.value);
  const resistance = recentHighs.length ? Math.max(...recentHighs) : last;
  const support = recentLows.length ? Math.min(...recentLows) : last;
  const range = resistance - support;
  if (range <= 0) return null;
  const pos = (last - support) / range;
  let side: Side = 'neutral';
  let reason = 'Price mid-range';
  if (pos > 0.92) { side = 'sell'; reason = 'Near resistance zone'; }
  else if (pos < 0.08) { side = 'buy'; reason = 'Near support zone'; }
  return {
    strategy: 'Support/Resistance',
    side,
    confidence: 0.48,
    reason,
    overlays: [
      { type: 'zone' as const, id: 'resist-zone', from: resistance, to: resistance * 1.01, color: 'rgba(239,68,68,0.12)', label: 'Resistance' },
      { type: 'zone' as const, id: 'support-zone', from: support * 0.99, to: support, color: 'rgba(34,197,94,0.12)', label: 'Support' },
    ],
  };
}

// Fibonacci retracement from most recent significant swing.
function fibonacciSignal(candles: Candle[]): Signal | null {
  if (candles.length < 40) return null;
  const { highs, lows } = findSwings(candles, 3, 3);
  if (!highs.length || !lows.length) return null;
  const lastHigh = highs[highs.length - 1];
  const lastLow = lows[lows.length - 1];
  const swingUp = lastHigh.index > lastLow.index;
  const high = swingUp ? lastHigh.value : lastLow.value;
  const low = swingUp ? lastLow.value : lastHigh.value;
  const diff = high - low;
  if (diff <= 0) return null;
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const last = candles[candles.length - 1].close;
  // In an uptrend swing, retracement levels are high - diff*level.
  const retr = swingUp ? levels.map((l) => high - diff * l) : levels.map((l) => low + diff * l);
  const golden = swingUp ? retr[4] : retr[2]; // 0.618
  let side: Side = 'neutral';
  let reason = 'Price between Fib levels';
  if (Math.abs(last - golden) / last < 0.01) {
    side = swingUp ? 'buy' : 'sell';
    reason = `At 0.618 golden pocket (${swingUp ? 'support' : 'resistance'})`;
  }
  return {
    strategy: 'Fibonacci',
    side,
    confidence: 0.5,
    reason,
    overlays: levels.map((l, idx) => ({
      type: 'hline' as const,
      id: `fib-${idx}`,
      price: retr[idx],
      color: idx === 4 ? '#10a37f' : '#9ca3af',
      label: `${(l * 100).toFixed(1)}%`,
    })),
  };
}

// Run all active strategies for a symbol. Returns array of signals with overlays.
export function runStrategies(candles: Candle[], _timeframe: Timeframe): Signal[] {
  const signals: (Signal | null)[] = [
    detectHeadShoulders(candles),
    detectDoubleTopBottom(candles),
    detectTriangleFlag(candles),
    maCrossSignal(candles),
    rsiDivergenceSignal(candles),
    bollingerSignal(candles),
    supportResistanceSignal(candles),
    fibonacciSignal(candles),
  ];
  return signals.filter((s): s is Signal => s !== null);
}

// ATR-based stop loss / take profit suggestion. Risk:Reward = 1:2 by default.
export function riskLevels(candles: Candle[], rr = 2): { atr: number; stopLoss: number; takeProfit: number; entry: number } | null {
  if (candles.length < 20) return null;
  const a = atr(candles, 14);
  const i = candles.length - 1;
  const atrVal = a[i] || (candles[i].high - candles[i].low);
  const entry = candles[i].close;
  return {
    atr: atrVal,
    entry,
    stopLoss: entry - atrVal * 1.5,
    takeProfit: entry + atrVal * 1.5 * rr,
  };
}

// Binance API ──→ fetchKlines() ──→ Candle[] ──→ runStrategies() ──→ Signal[]
//                                                         ↓
//             ML Client ←── fetchMLPrediction() ──→ combineSignals()
//                                                         ↓
//                                                 Recommendation
//                                               (side, score, SL, TP)
//                                                         ↓
//                                               Dashboard UI + PriceChart
