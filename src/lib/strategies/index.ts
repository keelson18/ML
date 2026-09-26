import type { Candle, Side, Signal, Timeframe } from '../types';
import { sma, rsi, bollinger, findSwings } from '../indicators';
import { donchian } from '../indicators/donchian';
import { detectCandlestickPatterns } from '../patterns/candlestick-patterns';
import { detectExtendedChartPatterns } from '../patterns/chart-patterns';
import { detectHeadShoulders, detectDoubleTopBottom, detectTriangleFlag } from './legacy-patterns';
import { analyzeMarketStructure } from '../market-structure';
import { adx } from '../indicators/adx';
import { trendFollowingStrategy } from './trend-following';

export interface Strategy {
  id: string;
  version: string;
  name: string;
  type: 'momentum' | 'trend' | 'contrarian' | 'neutral' | 'breakout' | 'volatility' | 'institutional' | 'adaptive';
  description: string;
  timeframes: Timeframe[];
  minCandles: number;
  defaultParameters: Record<string, number>;
  detect: (candles: Candle[], timeframe: Timeframe) => Signal[];
}

const maCrossStrategy: Strategy = {
  id: 'ma-crossover',
  version: '1.0.0',
  name: 'MA Crossover',
  type: 'trend',
  description: 'Tracks a 20/50 SMA crossover for directional trend changes.',
  timeframes: ['1h', '4h', '1d', '1w'],
  minCandles: 55,
  defaultParameters: { fastPeriod: 20, slowPeriod: 50 },
  detect(candles) {
    const closes = candles.map((c) => c.close);
    const fast = sma(closes, 20);
    const slow = sma(closes, 50);
    const i = closes.length - 1;
    const previous = i - 1;
    if (i < 1 || isNaN(fast[i]) || isNaN(slow[i]) || isNaN(fast[previous]) || isNaN(slow[previous])) return [];
    const side: Side = fast[previous] <= slow[previous] && fast[i] > slow[i]
      ? 'buy'
      : fast[previous] >= slow[previous] && fast[i] < slow[i]
        ? 'sell'
        : 'neutral';
    return [signal('MA Crossover', side, side === 'neutral' ? 0.42 : 0.6, side === 'buy' ? '20 SMA crossed above 50 SMA' : side === 'sell' ? '20 SMA crossed below 50 SMA' : 'MAs trending, no fresh cross')];
  },
};

const rsiDivStrategy: Strategy = {
  id: 'rsi-divergence',
  version: '1.0.0',
  name: 'RSI Divergence',
  type: 'contrarian',
  description: 'Looks for price and RSI disagreement at recent swing points.',
  timeframes: ['15m', '1h', '4h', '1d'],
  minCandles: 35,
  defaultParameters: { period: 14, swingLeft: 3, swingRight: 3 },
  detect(candles) {
    const values = rsi(candles.map((c) => c.close), 14);
    const { highs, lows } = findSwings(candles, 3, 3);
    if (highs.length >= 2) {
      const [first, second] = highs.slice(-2);
      if (second.value > first.value && values[second.index] < values[first.index] && values[second.index] < 70) {
        return [signal('RSI Divergence', 'sell', 0.55, 'Bearish RSI divergence on swing highs')];
      }
    }
    if (lows.length >= 2) {
      const [first, second] = lows.slice(-2);
      if (second.value < first.value && values[second.index] > values[first.index] && values[second.index] > 30) {
        return [signal('RSI Divergence', 'buy', 0.55, 'Bullish RSI divergence on swing lows')];
      }
    }
    return [];
  },
};

const bollingerStrategy: Strategy = {
  id: 'bollinger-volatility',
  version: '1.0.0',
  name: 'Bollinger Volatility',
  type: 'volatility',
  description: 'Uses band compression and expansion to identify volatility setups.',
  timeframes: ['15m', '1h', '4h', '1d'],
  minCandles: 60,
  defaultParameters: { period: 20, standardDeviations: 2 },
  detect(candles) {
    const closes = candles.map((c) => c.close);
    const { upper, lower, middle, width } = bollinger(closes, 20, 2);
    const i = closes.length - 1;
    const lookback = width.slice(Math.max(0, i - 50), i).filter(Number.isFinite);
    if (!lookback.length || !Number.isFinite(width[i])) return [];
    const isSqueeze = width[i] <= Math.min(...lookback) * 1.2;
    const side: Side = closes[i] > upper[i] ? 'sell' : closes[i] < lower[i] ? 'buy' : isSqueeze && closes[i] > middle[i] ? 'buy' : isSqueeze && closes[i] < middle[i] ? 'sell' : 'neutral';
    return [signal('Bollinger Volatility', side, isSqueeze ? 0.5 : 0.45, side === 'buy' ? 'Volatility setup favors upside expansion' : side === 'sell' ? 'Volatility setup favors downside expansion' : 'Bollinger bands stable')];
  },
};

const meanReversionStrategy: Strategy = {
  id: 'mean-reversion',
  version: '1.0.0',
  name: 'Mean Reversion',
  type: 'contrarian',
  description: 'Fades extended RSI readings back toward the recent mean.',
  timeframes: ['5m', '15m', '30m', '1h', '4h'],
  minCandles: 30,
  defaultParameters: { rsiPeriod: 14, oversold: 28, overbought: 72 },
  detect(candles) {
    const values = rsi(candles.map((c) => c.close), 14);
    const latest = values[values.length - 1];
    if (!Number.isFinite(latest)) return [];
    const side: Side = latest <= 28 ? 'buy' : latest >= 72 ? 'sell' : 'neutral';
    return [signal('Mean Reversion', side, side === 'neutral' ? 0.35 : 0.58, side === 'buy' ? `RSI oversold at ${latest.toFixed(1)}` : side === 'sell' ? `RSI overbought at ${latest.toFixed(1)}` : 'RSI is inside its neutral range')];
  },
};

const breakoutStrategy: Strategy = {
  id: 'donchian-breakout',
  version: '1.0.0',
  name: 'Donchian Breakout',
  type: 'breakout',
  description: 'Enters when price clears the prior 20-bar high or low.',
  timeframes: ['15m', '1h', '4h', '1d', '1w'],
  minCandles: 25,
  defaultParameters: { channelPeriod: 20 },
  detect(candles) {
    const channel = donchian(candles, 20);
    const i = candles.length - 1;
    if (i < 1 || !Number.isFinite(channel.upper[i - 1]) || !Number.isFinite(channel.lower[i - 1])) return [];
    const side: Side = candles[i].close > channel.upper[i - 1] ? 'buy' : candles[i].close < channel.lower[i - 1] ? 'sell' : 'neutral';
    return [signal('Donchian Breakout', side, side === 'neutral' ? 0.35 : 0.62, side === 'buy' ? 'Price broke above the prior Donchian channel' : side === 'sell' ? 'Price broke below the prior Donchian channel' : 'Price remains inside the Donchian channel')];
  },
};

const supportResistanceStrategy: Strategy = {
  id: 'support-resistance',
  version: '1.0.0',
  name: 'Support / Resistance',
  type: 'neutral',
  description: 'Uses clustered swing levels to identify mean-reversion zones.',
  timeframes: ['15m', '1h', '4h', '1d'],
  minCandles: 40,
  defaultParameters: { swingLeft: 3, swingRight: 3, proximity: 0.08 },
  detect(candles) {
    const { highs, lows } = findSwings(candles, 3, 3);
    const last = candles[candles.length - 1]?.close;
    const resistance = highs.length ? Math.max(...highs.slice(-3).map((point) => point.value)) : last;
    const support = lows.length ? Math.min(...lows.slice(-3).map((point) => point.value)) : last;
    const range = (resistance ?? 0) - (support ?? 0);
    if (!Number.isFinite(last) || !Number.isFinite(resistance) || !Number.isFinite(support) || range <= 0) return [];
    const position = (last - support) / range;
    const side: Side = position >= 0.92 ? 'sell' : position <= 0.08 ? 'buy' : 'neutral';
    return [signal('Support / Resistance', side, side === 'neutral' ? 0.35 : 0.48, side === 'buy' ? 'Price is testing recent support' : side === 'sell' ? 'Price is testing recent resistance' : 'Price is mid-range')];
  },
};

export const STRATEGY_REGISTRY: Strategy[] = [
  maCrossStrategy,
  rsiDivStrategy,
  bollingerStrategy,
  trendFollowingStrategy,
  meanReversionStrategy,
  breakoutStrategy,
  supportResistanceStrategy,
];

export function getStrategy(strategyId: string): Strategy | undefined {
  return STRATEGY_REGISTRY.find((strategy) => strategy.id === strategyId);
}

export function getStrategyAvailability(candles: Candle[], timeframe: Timeframe): { strategy: Strategy; eligible: boolean; reason?: string }[] {
  return STRATEGY_REGISTRY.map((strategy) => ({
    strategy,
    eligible: strategy.timeframes.includes(timeframe) && candles.length >= strategy.minCandles,
    reason: !strategy.timeframes.includes(timeframe)
      ? `Not supported on ${timeframe}`
      : candles.length < strategy.minCandles
        ? `Needs ${strategy.minCandles} candles`
        : undefined,
  }));
}

export function runStrategy(candles: Candle[], timeframe: Timeframe, strategyId: string): Signal[] {
  const strategy = getStrategy(strategyId);
  if (!strategy || !strategy.timeframes.includes(timeframe) || candles.length < strategy.minCandles) return [];
  return strategy.detect(candles, timeframe).map((result) => ({ ...result, strategyId: strategy.id, strategyVersion: strategy.version }));
}

export function runAllStrategies(candles: Candle[], timeframe: Timeframe): Signal[] {
  const signals: Signal[] = [];
  for (const strategy of STRATEGY_REGISTRY) {
    if (!strategy.timeframes.includes(timeframe) || candles.length < strategy.minCandles) continue;
    try {
      signals.push(...strategy.detect(candles, timeframe).map((result) => ({ ...result, strategyId: strategy.id, strategyVersion: strategy.version })));
    } catch {
      continue;
    }
  }
  signals.push(...detectCandlestickPatterns(candles));
  signals.push(...detectExtendedChartPatterns(candles));
  for (const detector of [detectHeadShoulders, detectDoubleTopBottom, detectTriangleFlag]) {
    const result = detector(candles);
    if (result) signals.push(result);
  }
  return signals;
}

export function selectBestStrategy(candles: Candle[], timeframe: Timeframe): Strategy {
  const eligible = STRATEGY_REGISTRY.filter((strategy) => strategy.timeframes.includes(timeframe));
  if (eligible.length === 0) return maCrossStrategy;
  if (candles.length < 60) return eligible[0];

  const structure = analyzeMarketStructure(candles.slice(-100));
  const rsiValues = rsi(candles.map((c) => c.close), 14);
  const adxValues = adx(candles, 14).adx;
  const latestRsi = rsiValues[rsiValues.length - 1] ?? 50;
  const latestAdx = adxValues[adxValues.length - 1] ?? 0;
  if (structure.trendStrength > 0.4) return eligible.find((strategy) => strategy.id === 'trend-following') ?? eligible[0];
  if ((structure.state === 'ranging' || structure.state === 'consolidating') && (latestRsi > 70 || latestRsi < 30)) return eligible.find((strategy) => strategy.id === 'rsi-divergence') ?? eligible[0];
  if (latestAdx > 40) return eligible.find((strategy) => strategy.id === 'bollinger-volatility') ?? eligible[0];
  return eligible[0];
}

function signal(strategy: string, side: Side, confidence: number, reason: string): Signal {
  return { strategy, side, confidence, reason };
}
