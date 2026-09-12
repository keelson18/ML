import type { Candle, Signal } from '../types';

// Pattern confidence scoring system
// Each pattern gets a confidence score based on context:
// - Trend direction alignment
// - Volume confirmation
// - Multi-timeframe alignment
// - Recent reliability

export interface ScoredPattern extends Signal {
  score: number;       // 0-1 final score after adjustments
  trendAlignment: number; // -1 (against) to 1 (with)
  volumeConfirmation: boolean;
  reliability: number; // historical win rate of this pattern
}

interface TrendInfo {
  direction: 'bullish' | 'bearish' | 'ranging';
  strength: number; // 0-1
}

// Determine short-term trend from recent price action
export function detectTrend(candles: Candle[], lookback = 20): TrendInfo {
  if (candles.length < lookback) {
    return { direction: 'ranging', strength: 0 };
  }

  const closes = candles.slice(-lookback).map((c) => c.close);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const change = ((last - first) / first) * 100;

  // Calculate directional movement
  let upDays = 0;
  let downDays = 0;

  for (let i = 1; i < closes.length; i++) {
    const c = candles[candles.length - lookback + i];
    if (c.close > candles[candles.length - lookback + i - 1].close) {
      upDays++;
    } else {
      downDays++;
    }
  }

  const strength = Math.min(1, Math.abs(change) / 5);
  let direction: TrendInfo['direction'] = 'ranging';

  if (change > 1 && upDays > downDays) {
    direction = 'bullish';
  } else if (change < -1 && downDays > upDays) {
    direction = 'bearish';
  }

  return { direction, strength };
}

// Score a pattern based on context
export function scorePattern(
  pattern: Signal,
  candles: Candle[],
  trend: TrendInfo,
): ScoredPattern {
  let trendAlignment = 0;

  // Trend alignment: +1 if same direction, -1 if opposite, 0 if neutral
  if (pattern.side !== 'neutral') {
    if (pattern.side === 'buy' && trend.direction === 'bullish') trendAlignment = 0.8;
    else if (pattern.side === 'sell' && trend.direction === 'bearish') trendAlignment = 0.8;
    else if (pattern.side === 'buy' && trend.direction === 'bearish') trendAlignment = -0.5;
    else if (pattern.side === 'sell' && trend.direction === 'bullish') trendAlignment = -0.5;
  }

  // Volume confirmation: check if recent volume is above average
  const recentVol = candles.slice(-10).reduce((s, c) => s + c.volume, 0) / 10;
  const avgVol = candles.slice(-50, -10).reduce((s, c) => s + c.volume, 0) / 40 || 1;
  const volumeConfirmation = recentVol > avgVol * 1.15;

  // Base confidence from the pattern itself
  let baseConfidence = pattern.confidence;

  // Adjust for trend
  if (trendAlignment > 0) baseConfidence += 0.08;
  else if (trendAlignment < 0) baseConfidence -= 0.1;

  // Volume bonus
  if (volumeConfirmation) baseConfidence += 0.05;

  // Trend strength bonus
  baseConfidence += trend.strength * 0.05;

  // Clamp
  const finalScore = Math.max(0, Math.min(1, baseConfidence));

  // Pattern-specific reliability estimates
  const reliabilityMap: Record<string, number> = {
    'Head & Shoulders': 0.65,
    'Inverse H&S': 0.63,
    'Double Top': 0.62,
    'Double Bottom': 0.62,
    'Triple Top': 0.6,
    'Triple Bottom': 0.6,
    'Bull Flag': 0.58,
    'Bear Flag': 0.56,
    'Pennant': 0.52,
    'Triangle': 0.5,
    'Rectangle': 0.48,
    'Cup & Handle': 0.6,
    'Rising Wedge': 0.55,
    'Falling Wedge': 0.55,
    'Bullish Engulfing': 0.62,
    'Bearish Engulfing': 0.6,
    'Morning Star': 0.65,
    'Evening Star': 0.63,
    'Hammer': 0.55,
    'Shooting Star': 0.53,
    'Three White Soldiers': 0.6,
    'Three Black Crows': 0.58,
  };

  const reliability = reliabilityMap[pattern.strategy] ?? 0.5;

  return {
    ...pattern,
    score: finalScore,
    trendAlignment,
    volumeConfirmation,
    reliability,
  };
}

// Filter patterns by minimum score threshold
export function filterHighConfidencePatterns(
  patterns: ScoredPattern[],
  threshold = 0.45,
): ScoredPattern[] {
  return patterns
    .filter((p) => p.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

