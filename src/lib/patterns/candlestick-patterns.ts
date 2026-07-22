import type { Candle, Signal, Overlay } from '../types';

// ---- Candlestick Pattern Detection Library ----
// Detects 17+ individual candlestick patterns with context-aware scoring.

interface CandlePattern {
  name: string;
  side: 'buy' | 'sell' | 'neutral';
  confidence: number;
  reason: string;
}

// Helper: true if candle is bullish (close > open)
function isBullish(c: Candle): boolean {
  return c.close > c.open;
}

// Helper: true if candle is bearish (close < open)
function isBearish(c: Candle): boolean {
  return c.close < c.open;
}

// Helper: body size (absolute)
function body(c: Candle): number {
  return Math.abs(c.close - c.open);
}

// Helper: upper wick
function upperWick(c: Candle): number {
  return c.high - Math.max(c.open, c.close);
}

// Helper: lower wick
function lowerWick(c: Candle): number {
  return Math.min(c.open, c.close) - c.low;
}

// Helper: total range
function range(c: Candle): number {
  return c.high - c.low;
}

// 1. Hammer: small body, long lower wick (2x+ body), little/no upper wick
function detectHammer(candles: Candle[], i: number): CandlePattern | null {
  if (i < 1) return null;
  const c = candles[i];
  const b = body(c);
  const lw = lowerWick(c);
  const uw = upperWick(c);
  if (b > 0 && lw >= b * 2 && uw <= b * 0.3 && !isBearish(c)) {
    return {
      name: 'Hammer',
      side: 'buy',
      confidence: 0.55,
      reason: 'Hammer at support — potential bullish reversal',
    };
  }
  return null;
}

// 2. Inverted Hammer: small body, long upper wick, little/no lower wick
function detectInvertedHammer(candles: Candle[], i: number): CandlePattern | null {
  if (i < 1) return null;
  const c = candles[i];
  const b = body(c);
  const lw = lowerWick(c);
  const uw = upperWick(c);
  if (b > 0 && uw >= b * 2 && lw <= b * 0.3) {
    return {
      name: 'Inverted Hammer',
      side: 'buy',
      confidence: 0.5,
      reason: 'Inverted hammer — potential bullish reversal after downtrend',
    };
  }
  return null;
}

// 3. Shooting Star: small body at lower end, long upper wick (2x+), little lower wick
function detectShootingStar(candles: Candle[], i: number): CandlePattern | null {
  if (i < 1) return null;
  const c = candles[i];
  const b = body(c);
  const lw = lowerWick(c);
  const uw = upperWick(c);
  if (b > 0 && uw >= b * 2 && lw <= b * 0.3 && !isBullish(c)) {
    return {
      name: 'Shooting Star',
      side: 'sell',
      confidence: 0.55,
      reason: 'Shooting star at resistance — potential bearish reversal',
    };
  }
  return null;
}

// 4. Hanging Man: small body, long lower wick, little upper wick (appears in uptrend)
function detectHangingMan(candles: Candle[], i: number): CandlePattern | null {
  if (i < 1) return null;
  const c = candles[i];
  const b = body(c);
  const lw = lowerWick(c);
  const uw = upperWick(c);
  if (b > 0 && lw >= b * 2 && uw <= b * 0.3 && !isBullish(c)) {
    return {
      name: 'Hanging Man',
      side: 'sell',
      confidence: 0.5,
      reason: 'Hanging man after uptrend — potential bearish reversal',
    };
  }
  return null;
}

// 5. Bullish Engulfing: green body fully engulfs previous red body
function detectBullishEngulfing(candles: Candle[], i: number): CandlePattern | null {
  if (i < 1) return null;
  const curr = candles[i];
  const prev = candles[i - 1];
  if (isBearish(prev) && isBullish(curr) && body(curr) > body(prev) &&
      curr.close > prev.open && curr.open < prev.close) {
    return {
      name: 'Bullish Engulfing',
      side: 'buy',
      confidence: 0.6,
      reason: 'Bullish engulfing — strong buying pressure',
    };
  }
  return null;
}

// 6. Bearish Engulfing: red body fully engulfs previous green body
function detectBearishEngulfing(candles: Candle[], i: number): CandlePattern | null {
  if (i < 1) return null;
  const curr = candles[i];
  const prev = candles[i - 1];
  if (isBullish(prev) && isBearish(curr) && body(curr) > body(prev) &&
      curr.close < prev.open && curr.open > prev.close) {
    return {
      name: 'Bearish Engulfing',
      side: 'sell',
      confidence: 0.6,
      reason: 'Bearish engulfing — strong selling pressure',
    };
  }
  return null;
}

// 7. Morning Star: large red, small body (doji-like), large green
function detectMorningStar(candles: Candle[], i: number): CandlePattern | null {
  if (i < 2) return null;
  const c1 = candles[i - 2];
  const c2 = candles[i - 1];
  const c3 = candles[i];
  if (isBearish(c1) && body(c2) <= body(c1) * 0.3 && isBullish(c3) &&
      c3.close >= (c1.open + c1.close) / 2) {
    return {
      name: 'Morning Star',
      side: 'buy',
      confidence: 0.65,
      reason: 'Morning star — strong bullish reversal pattern',
    };
  }
  return null;
}

// 8. Evening Star: large green, small body (doji-like), large red
function detectEveningStar(candles: Candle[], i: number): CandlePattern | null {
  if (i < 2) return null;
  const c1 = candles[i - 2];
  const c2 = candles[i - 1];
  const c3 = candles[i];
  if (isBullish(c1) && body(c2) <= body(c1) * 0.3 && isBearish(c3) &&
      c3.close <= (c1.open + c1.close) / 2) {
    return {
      name: 'Evening Star',
      side: 'sell',
      confidence: 0.65,
      reason: 'Evening star — strong bearish reversal pattern',
    };
  }
  return null;
}

// 9. Doji: open and close nearly equal
function detectDoji(candles: Candle[], i: number): CandlePattern | null {
  const c = candles[i];
  const b = body(c);
  const r = range(c);
  if (r > 0 && b / r < 0.1) {
    return {
      name: 'Doji',
      side: 'neutral',
      confidence: 0.3,
      reason: 'Doji — market indecision',
    };
  }
  return null;
}

// 10. Dragonfly Doji: long lower wick, same open/close at high
function detectDragonflyDoji(candles: Candle[], i: number): CandlePattern | null {
  const c = candles[i];
  const b = body(c);
  const r = range(c);
  const lw = lowerWick(c);
  const uw = upperWick(c);
  if (r > 0 && b / r < 0.1 && lw > r * 0.6 && uw < r * 0.1) {
    return {
      name: 'Dragonfly Doji',
      side: 'buy',
      confidence: 0.55,
      reason: 'Dragonfly doji — potential bullish reversal',
    };
  }
  return null;
}

// 11. Gravestone Doji: long upper wick, same open/close at low
function detectGravestoneDoji(candles: Candle[], i: number): CandlePattern | null {
  const c = candles[i];
  const b = body(c);
  const r = range(c);
  const uw = upperWick(c);
  const lw = lowerWick(c);
  if (r > 0 && b / r < 0.1 && uw > r * 0.6 && lw < r * 0.1) {
    return {
      name: 'Gravestone Doji',
      side: 'sell',
      confidence: 0.55,
      reason: 'Gravestone doji — potential bearish reversal',
    };
  }
  return null;
}

// 12. Three White Soldiers: three consecutive long green candles with higher closes
function detectThreeWhiteSoldiers(candles: Candle[], i: number): CandlePattern | null {
  if (i < 2) return null;
  const c1 = candles[i - 2];
  const c2 = candles[i - 1];
  const c3 = candles[i];
  if (isBullish(c1) && isBullish(c2) && isBullish(c3) &&
      body(c1) > 0 && body(c2) > 0 && body(c3) > 0 &&
      c2.close > c1.close && c3.close > c2.close &&
      c2.open > c1.open * 0.98 && c3.open > c2.open * 0.98) {
    return {
      name: 'Three White Soldiers',
      side: 'buy',
      confidence: 0.6,
      reason: 'Three white soldiers — strong bullish continuation',
    };
  }
  return null;
}

// 13. Three Black Crows: three consecutive long red candles with lower closes
function detectThreeBlackCrows(candles: Candle[], i: number): CandlePattern | null {
  if (i < 2) return null;
  const c1 = candles[i - 2];
  const c2 = candles[i - 1];
  const c3 = candles[i];
  if (isBearish(c1) && isBearish(c2) && isBearish(c3) &&
      body(c1) > 0 && body(c2) > 0 && body(c3) > 0 &&
      c2.close < c1.close && c3.close < c2.close &&
      c2.open < c1.open * 1.02 && c3.open < c2.open * 1.02) {
    return {
      name: 'Three Black Crows',
      side: 'sell',
      confidence: 0.6,
      reason: 'Three black crows — strong bearish continuation',
    };
  }
  return null;
}

// 14. Tweezer Top: two candles with same high, first bullish, second bearish
function detectTweezerTop(candles: Candle[], i: number): CandlePattern | null {
  if (i < 1) return null;
  const c1 = candles[i - 1];
  const c2 = candles[i];
  const highDiff = Math.abs(c1.high - c2.high) / (c1.high + 0.001);
  if (isBullish(c1) && isBearish(c2) && highDiff < 0.002) {
    return {
      name: 'Tweezer Top',
      side: 'sell',
      confidence: 0.5,
      reason: 'Tweezer top — bearish reversal at resistance',
    };
  }
  return null;
}

// 15. Tweezer Bottom: two candles with same low, first bearish, second bullish
function detectTweezerBottom(candles: Candle[], i: number): CandlePattern | null {
  if (i < 1) return null;
  const c1 = candles[i - 1];
  const c2 = candles[i];
  const lowDiff = Math.abs(c1.low - c2.low) / (c1.low + 0.001);
  if (isBearish(c1) && isBullish(c2) && lowDiff < 0.002) {
    return {
      name: 'Tweezer Bottom',
      side: 'buy',
      confidence: 0.5,
      reason: 'Tweezer bottom — bullish reversal at support',
    };
  }
  return null;
}

// 16. Inside Bar: current range inside previous range
function detectInsideBar(candles: Candle[], i: number): CandlePattern | null {
  if (i < 1) return null;
  const prev = candles[i - 1];
  const curr = candles[i];
  if (curr.high <= prev.high && curr.low >= prev.low) {
    return {
      name: 'Inside Bar',
      side: 'neutral',
      confidence: 0.35,
      reason: 'Inside bar — consolidation, breakout pending',
    };
  }
  return null;
}

// 17. Outside Bar: current range engulfs previous range
function detectOutsideBar(candles: Candle[], i: number): CandlePattern | null {
  if (i < 1) return null;
  const prev = candles[i - 1];
  const curr = candles[i];
  if (curr.high > prev.high && curr.low < prev.low) {
    const side = isBullish(curr) ? 'buy' : 'sell';
    return {
      name: 'Outside Bar',
      side: side as 'buy' | 'sell',
      confidence: 0.45,
      reason: `Outside bar — volatility expansion to the ${side}`,
    };
  }
  return null;
}

// ---- Main detection: run all patterns on the most recent candle ----

const PATTERN_DETECTORS: ((candles: Candle[], i: number) => CandlePattern | null)[] = [
  detectHammer,
  detectInvertedHammer,
  detectShootingStar,
  detectHangingMan,
  detectBullishEngulfing,
  detectBearishEngulfing,
  detectMorningStar,
  detectEveningStar,
  detectDoji,
  detectDragonflyDoji,
  detectGravestoneDoji,
  detectThreeWhiteSoldiers,
  detectThreeBlackCrows,
  detectTweezerTop,
  detectTweezerBottom,
  detectInsideBar,
  detectOutsideBar,
];

export function detectCandlestickPatterns(candles: Candle[]): Signal[] {
  if (candles.length < 3) return [];
  const i = candles.length - 1;
  const signals: Signal[] = [];

  for (const detector of PATTERN_DETECTORS) {
    const result = detector(candles, i);
    if (result && result.confidence >= 0.4) {
      signals.push({
        strategy: result.name,
        side: result.side,
        confidence: result.confidence,
        reason: result.reason,
        overlays: [{
          type: 'markers' as const,
          id: result.name.replace(/\s+/g, '-'),
          markers: [{
            time: candles[i].time,
            position: 'aboveBar' as const,
            color: result.side === 'buy' ? '#22c55e' : result.side === 'sell' ? '#ef4444' : '#9ca3af',
            shape: result.side === 'buy' ? 'arrowUp' : result.side === 'sell' ? 'arrowDown' : 'circle',
            text: result.name.substring(0, 4),
          }],
        }],
      });
    }
  }

  return signals;
}

// ---- Pattern Scoring System ----
// Score each pattern based on context (trend, volatility, multi-timeframe alignment)

interface PatternScore {
  patternName: string;
  baseConfidence: number;
  contextBonus: number;
  finalScore: number;
}

export function scorePattern(
  pattern: Signal,
  candles: Candle[],
  trend: 'bullish' | 'bearish' | 'ranging',
): PatternScore {
  let contextBonus = 0;
  const last = candles[candles.length - 1];
  const avgVol = candles.slice(-20).reduce((s, c) => s + range(c), 0) / 20;
  const currentVol = range(last);
  const volRatio = avgVol > 0 ? currentVol / avgVol : 1;

  // Volume confirmation
  if (volRatio > 1.2) contextBonus += 0.05;

  // Trend alignment
  if (pattern.side === 'buy' && trend === 'bullish') contextBonus += 0.1;
  if (pattern.side === 'sell' && trend === 'bearish') contextBonus += 0.1;
  if (pattern.side !== 'neutral' && trend === 'ranging') contextBonus -= 0.05;

  // Reversal patterns get bonus in opposite trend
  const isReversal = ['Morning Star', 'Evening Star', 'Hammer', 'Shooting Star',
    'Bullish Engulfing', 'Bearish Engulfing', 'Dragonfly Doji', 'Gravestone Doji'].includes(pattern.strategy);
  if (isReversal) {
    if (pattern.side === 'buy' && trend === 'bearish') contextBonus += 0.08;
    if (pattern.side === 'sell' && trend === 'bullish') contextBonus += 0.08;
  }

  const finalScore = Math.min(1, Math.max(0, pattern.confidence + contextBonus));

  return {
    patternName: pattern.strategy,
    baseConfidence: pattern.confidence,
    contextBonus,
    finalScore,
  };
}

