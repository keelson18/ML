import type { Candle, Signal, Side, Timeframe } from '../types';
import { sma, rsi, bollinger, findSwings } from '../indicators';
import { detectCandlestickPatterns } from '../patterns/candlestick-patterns';
import { detectExtendedChartPatterns } from '../patterns/chart-patterns';
import { detectHeadShoulders, detectDoubleTopBottom, detectTriangleFlag } from './legacy-patterns';
import { analyzeMarketStructure } from '../market-structure';
import { adx } from '../indicators/adx';

// Strategy Registry — dynamically selects best strategy for current market conditions

export interface Strategy {
  name: string;
  type: 'momentum' | 'trend' | 'contrarian' | 'neutral' | 'breakout' | 'volatility' | 'institutional' | 'adaptive';
  timeframes: Timeframe[];
  minCandles: number;
  detect: (candles: Candle[], timeframe: Timeframe) => Signal[];
}

// Simple strategy: MA Crossover (from original strategies.ts)
const maCrossStrategy: Strategy = {
  name: 'MA Crossover',
  type: 'trend',
  timeframes: ['1h', '4h', '1d', '1w'],
  minCandles: 55,
  detect(candles: Candle[]): Signal[] {
    const closes = candles.map((c) => c.close);
    const fast = sma(closes, 20);
    const slow = sma(closes, 50);
    const i = closes.length - 1;
    const prev = i - 1;
    if (isNaN(fast[i]) || isNaN(slow[i]) || isNaN(fast[prev]) || isNaN(slow[prev])) return [];
    const crossUp = fast[prev] <= slow[prev] && fast[i] > slow[i];
    const crossDown = fast[prev] >= slow[prev] && fast[i] < slow[i];
    const side: Side = crossUp ? 'buy' : crossDown ? 'sell' : 'neutral';
    return [{
      strategy: 'MA Crossover',
      side,
      confidence: crossUp || crossDown ? 0.6 : 0.42,
      reason: crossUp ? '20 SMA crossed above 50 SMA (golden)' : crossDown ? '20 SMA crossed below 50 SMA (death)' : 'MAs trending, no fresh cross',
    }];
  },
};

// RSI Divergence strategy
const rsiDivStrategy: Strategy = {
  name: 'RSI Divergence',
  type: 'contrarian',
  timeframes: ['1h', '4h', '1d'],
  minCandles: 35,
  detect(candles: Candle[]): Signal[] {
    const closes = candles.map((c) => c.close);
    const r = rsi(closes, 14);
    const { highs, lows } = findSwings(candles, 3, 3);
    const signals: Signal[] = [];
    if (highs.length >= 2) {
      const [a, b] = highs.slice(-2);
      if (b.value > a.value && r[b.index] < r[a.index] && r[b.index] < 70) {
        signals.push({ strategy: 'RSI Divergence', side: 'sell', confidence: 0.55, reason: 'Bearish RSI divergence on swing highs' });
      }
    }
    if (lows.length >= 2) {
      const [a, b] = lows.slice(-2);
      if (b.value < a.value && r[b.index] > r[a.index] && r[b.index] > 30) {
        signals.push({ strategy: 'RSI Divergence', side: 'buy', confidence: 0.55, reason: 'Bullish RSI divergence on swing lows' });
      }
    }
    return signals;
  },
};

// Bollinger Bands strategy
const bollingerStrategy: Strategy = {
  name: 'Bollinger',
  type: 'volatility',
  timeframes: ['15m', '1h', '4h', '1d'],
  minCandles: 60,
  detect(candles: Candle[]): Signal[] {
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
      else { side = 'sell'; reason = 'Squeeze breakout to the downside'; }
    } else {
      if (last > upper[i]) { side = 'sell'; reason = 'Price above upper band — overbought'; }
      else if (last < lower[i]) { side = 'buy'; reason = 'Price below lower band — oversold'; }
    }
    return [{ strategy: 'Bollinger', side, confidence: isSqueeze ? 0.5 : 0.45, reason }];
  },
};

// Registry of all available strategies
export const STRATEGY_REGISTRY: Strategy[] = [
  maCrossStrategy,
  rsiDivStrategy,
  bollingerStrategy,
];

// Dynamic strategy selector based on market conditions
export function selectBestStrategy(candles: Candle[], _timeframe: Timeframe): Strategy {
  if (candles.length < 60) return STRATEGY_REGISTRY[0];

  const structure = analyzeMarketStructure(candles.slice(-100));
  const closes = candles.map((c) => c.close);
  const rsiVals = rsi(closes, 14);
  const i = closes.length - 1;
  const lastRsi = rsiVals[i];
  const adxResult = adx(candles, 14);
  const adxVal = adxResult.adx[i];

  // Market regime detection
  const isTrending = structure.trendStrength > 0.4;
  const isRanging = structure.state === 'ranging' || structure.state === 'consolidating';
  const isOverbought = lastRsi > 70;
  const isOversold = lastRsi < 30;

  // Dynamic selection
  if (isTrending) return STRATEGY_REGISTRY[0]; // MA Cross / trend
  if (isRanging && (isOverbought || isOversold)) return STRATEGY_REGISTRY[1]; // RSI Div
  if (adxVal > 40) return STRATEGY_REGISTRY[2]; // Bollinger / volatility

  return STRATEGY_REGISTRY[0];
}

// Run all strategies for a symbol
export function runAllStrategies(candles: Candle[], timeframe: Timeframe): Signal[] {
  const allSignals: Signal[] = [];

  // Run all registered strategies
  for (const strategy of STRATEGY_REGISTRY) {
    if (candles.length < strategy.minCandles) continue;
    try {
      const signals = strategy.detect(candles, timeframe);
      allSignals.push(...signals);
    } catch {
      // Skip failed strategies
    }
  }

  // Add pattern detection signals
  allSignals.push(...detectCandlestickPatterns(candles));
  allSignals.push(...detectExtendedChartPatterns(candles));

  // Legacy patterns still supported
  const legacy: (Signal | null)[] = [
    detectHeadShoulders(candles),
    detectDoubleTopBottom(candles),
    detectTriangleFlag(candles),
  ];
  for (const sig of legacy) {
    if (sig) allSignals.push(sig);
  }

  return allSignals;
}

