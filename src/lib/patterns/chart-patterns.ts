import type { Candle, Signal, Overlay } from '../types';
import { findSwings } from '../indicators';

// ---- Extended Chart Pattern Detection ----

interface PatternMatch {
  name: string;
  side: 'buy' | 'sell' | 'neutral';
  confidence: number;
  reason: string;
  overlays: Overlay[];
}

// Triple Top: three swing highs at similar level, breakdown below most recent trough
function detectTripleTop(candles: Candle[]): PatternMatch | null {
  if (candles.length < 50) return null;
  const { highs } = findSwings(candles, 4, 4);
  if (highs.length < 3) return null;
  const last3 = highs.slice(-3);
  const avg = last3.reduce((s, h) => s + h.value, 0) / 3;
  const tolerance = avg * 0.025;
  const aligned = last3.every((h) => Math.abs(h.value - avg) < tolerance);
  if (!aligned) return null;
  const lastCandle = candles[candles.length - 1];
  const troughSinceLastHigh = Math.min(
    ...candles.slice(last3[0].index, last3[2].index).map((c) => c.low)
  );
  if (lastCandle.close < troughSinceLastHigh) {
    return {
      name: 'Triple Top',
      side: 'sell',
      confidence: 0.65,
      reason: 'Triple top confirmed — breakdown below neckline',
      overlays: [markerOverlay(last3, 'arrowDown', '3T')],
    };
  }
  return null;
}

// Triple Bottom: three swing lows at similar level, breakout above most recent peak
function detectTripleBottom(candles: Candle[]): PatternMatch | null {
  if (candles.length < 50) return null;
  const { lows } = findSwings(candles, 4, 4);
  if (lows.length < 3) return null;
  const last3 = lows.slice(-3);
  const avg = last3.reduce((s, l) => s + l.value, 0) / 3;
  const tolerance = avg * 0.025;
  const aligned = last3.every((l) => Math.abs(l.value - avg) < tolerance);
  if (!aligned) return null;
  const lastCandle = candles[candles.length - 1];
  const peakSinceLastLow = Math.max(
    ...candles.slice(last3[0].index, last3[2].index).map((c) => c.high)
  );
  if (lastCandle.close > peakSinceLastLow) {
    return {
      name: 'Triple Bottom',
      side: 'buy',
      confidence: 0.65,
      reason: 'Triple bottom confirmed — breakout above neckline',
      overlays: [markerOverlay(last3, 'arrowUp', '3B')],
    };
  }
  return null;
}

// Pennant: sharp move (flagpole) followed by converging triangle
function detectPennant(candles: Candle[]): PatternMatch | null {
  if (candles.length < 40) return null;
  const { highs, lows } = findSwings(candles, 2, 2);
  if (highs.length < 3 || lows.length < 3) return null;
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);
  // Check converging trendlines
  const hSlope = (recentHighs[2].value - recentHighs[0].value) / 
    (recentHighs[2].index - recentHighs[0].index || 1);
  const lSlope = (recentLows[2].value - recentLows[0].value) /
    (recentLows[2].index - recentLows[0].index || 1);
  const converging = hSlope < 0 && lSlope > 0;
  if (!converging) return null;
  // Check for flagpole: at least 5% move before pennant
  const prePennant = candles.slice(0, Math.max(0, recentLows[0].index - 5));
  if (prePennant.length < 5) return null;
  const preRange = Math.abs(
    prePennant[prePennant.length - 1].close - prePennant[0].close
  ) / prePennant[0].close;
  if (preRange < 0.03) return null;
  return {
    name: 'Pennant',
    side: 'neutral',
    confidence: 0.5,
    reason: 'Pennant formation — converging trendlines after sharp move',
    overlays: [
      lineOverlay([recentHighs[0], recentHighs[2]], '#f59e0b', 'resist'),
      lineOverlay([recentLows[0], recentLows[2]], '#f59e0b', 'support'),
    ],
  };
}

// Rectangle: parallel support and resistance
function detectRectangle(candles: Candle[]): PatternMatch | null {
  if (candles.length < 40) return null;
  const { highs, lows } = findSwings(candles, 3, 3);
  if (highs.length < 3 || lows.length < 3) return null;
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);
  const hAvg = recentHighs.reduce((s, h) => s + h.value, 0) / 3;
  const lAvg = recentLows.reduce((s, l) => s + l.value, 0) / 3;
  const hTolerance = hAvg * 0.03;
  const lTolerance = lAvg * 0.03;
  const hAligned = recentHighs.every((h) => Math.abs(h.value - hAvg) < hTolerance);
  const lAligned = recentLows.every((l) => Math.abs(l.value - lAvg) < lTolerance);
  if (!hAligned || !lAligned) return null;
  const last = candles[candles.length - 1].close;
  const side = last > hAvg ? 'buy' : last < lAvg ? 'sell' : 'neutral';
  return {
    name: 'Rectangle',
    side: side as 'buy' | 'sell',
    confidence: 0.45,
    reason: side !== 'neutral'
      ? 'Rectangle breakout direction'
      : 'Rectangle consolidation — awaiting breakout',
    overlays: [
      { type: 'hline' as const, id: 'rect-resist', price: hAvg, color: '#ef4444', label: 'R' },
      { type: 'hline' as const, id: 'rect-support', price: lAvg, color: '#22c55e', label: 'S' },
    ],
  };
}

// Cup and Handle: rounded bottom (cup) followed by small pullback (handle)
function detectCupAndHandle(candles: Candle[]): PatternMatch | null {
  if (candles.length < 60) return null;
  const { highs, lows } = findSwings(candles, 5, 5);
  if (lows.length < 3 || highs.length < 2) return null;
  const lastLow = lows[lows.length - 1];
  const prevLow = lows[lows.length - 2];
  const cupLow = Math.min(prevLow.value, lastLow.value);
  const cupHigh = highs[highs.length - 1]?.value ?? candles[candles.length - 1].close;
  const cupDepth = (cupHigh - cupLow) / cupHigh;
  // Cup should be 15-50% depth
  if (cupDepth < 0.1 || cupDepth > 0.5) return null;
  // Handle: small pullback from cup rim (< 1/3 of cup depth)
  const last = candles[candles.length - 1];
  const handlePullback = (cupHigh - last.close) / cupHigh;
  if (handlePullback > cupDepth * 0.33) return null;
  // Breakout above rim
  if (last.close > cupHigh * 0.99) {
    return {
      name: 'Cup & Handle',
      side: 'buy',
      confidence: 0.6,
      reason: 'Cup & Handle breakout — bullish continuation',
      overlays: [
        { type: 'hline' as const, id: 'cup-rim', price: cupHigh, color: '#22c55e', label: 'Rim' },
      ],
    };
  }
  return null;
}

// Rising Wedge (bearish reversal) / Falling Wedge (bullish reversal)
function detectWedge(candles: Candle[]): PatternMatch | null {
  if (candles.length < 40) return null;
  const { highs, lows } = findSwings(candles, 3, 3);
  if (highs.length < 3 || lows.length < 3) return null;
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);
  const hSlope = (recentHighs[2].value - recentHighs[0].value) /
    (recentHighs[2].index - recentHighs[0].index || 1);
  const lSlope = (recentLows[2].value - recentLows[0].value) /
    (recentLows[2].index - recentLows[0].index || 1);
  // Both trending same direction but converging
  const sameDirection = Math.sign(hSlope) === Math.sign(lSlope);
  const converging = Math.abs(hSlope) > Math.abs(lSlope);
  if (!sameDirection || !converging) return null;
  const rising = hSlope > 0;
  const falling = hSlope < 0;
  const last = candles[candles.length - 1].close;
  if (rising && last < recentLows[0].value) {
    return {
      name: 'Rising Wedge',
      side: 'sell',
      confidence: 0.55,
      reason: 'Rising wedge breakdown — bearish reversal',
      overlays: [
        lineOverlay([recentHighs[0], recentHighs[2]], '#ef4444', 'wedge-h'),
        lineOverlay([recentLows[0], recentLows[2]], '#ef4444', 'wedge-l'),
      ],
    };
  }
  if (falling && last > recentHighs[0].value) {
    return {
      name: 'Falling Wedge',
      side: 'buy',
      confidence: 0.55,
      reason: 'Falling wedge breakout — bullish reversal',
      overlays: [
        lineOverlay([recentHighs[0], recentHighs[2]], '#22c55e', 'wedge-h'),
        lineOverlay([recentLows[0], recentLows[2]], '#22c55e', 'wedge-l'),
      ],
    };
  }
  return null;
}

// Channel: parallel trendlines
function detectChannel(candles: Candle[]): PatternMatch | null {
  if (candles.length < 40) return null;
  const { highs, lows } = findSwings(candles, 3, 3);
  if (highs.length < 3 || lows.length < 3) return null;
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);
  const hSlope = (recentHighs[2].value - recentHighs[0].value) /
    (recentHighs[2].index - recentHighs[0].index || 1);
  const lSlope = (recentLows[2].value - recentLows[0].value) /
    (recentLows[2].index - recentLows[0].index || 1);
  const parallel = Math.abs(hSlope - lSlope) / (Math.abs(hSlope) + Math.abs(lSlope) + 0.001) < 0.3;
  if (!parallel) return null;
  const bullish = hSlope > 0;
  return {
    name: bullish ? 'Ascending Channel' : 'Descending Channel',
    side: bullish ? 'buy' : 'sell',
    confidence: 0.5,
    reason: `${bullish ? 'Ascending' : 'Descending'} channel detected`,
    overlays: [
      lineOverlay([recentHighs[0], recentHighs[2]], '#06b6d4', 'upper'),
      lineOverlay([recentLows[0], recentLows[2]], '#06b6d4', 'lower'),
    ],
  };
}

// ---- Helpers ----

function markerOverlay(
  swings: { time: number; value: number }[],
  shape: 'arrowUp' | 'arrowDown',
  label: string
): Overlay {
  return {
    type: 'markers' as const,
    id: label,
    markers: swings.map((s) => ({
      time: s.time,
      position: 'belowBar' as const,
      color: shape === 'arrowUp' ? '#22c55e' : '#ef4444',
      shape,
      text: label,
    })),
  };
}

function lineOverlay(
  points: { time: number; value: number }[],
  color: string,
  label: string
): Overlay {
  return {
    type: 'line' as const,
    id: label,
    points,
    color,
    label,
  };
}

// ---- Main export: detect all extended chart patterns ----

export function detectExtendedChartPatterns(candles: Candle[]): Signal[] {
  const patterns: (PatternMatch | null)[] = [
    detectTripleTop(candles),
    detectTripleBottom(candles),
    detectPennant(candles),
    detectRectangle(candles),
    detectCupAndHandle(candles),
    detectWedge(candles),
    detectChannel(candles),
  ];

  return patterns
    .filter((p): p is PatternMatch => p !== null)
    .map((p) => ({
      strategy: p.name,
      side: p.side,
      confidence: p.confidence,
      reason: p.reason,
      overlays: p.overlays,
    }));
}

