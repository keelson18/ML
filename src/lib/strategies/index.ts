import type { Candle, Side, Signal, Timeframe } from '../types';
import { rsi, bollinger } from '../indicators';
import { STRATEGY_LIBRARY } from './library';
import { detectCandlestickPatterns } from '../patterns/candlestick-patterns';
import { detectExtendedChartPatterns } from '../patterns/chart-patterns';
import { detectHeadShoulders, detectDoubleTopBottom, detectTriangleFlag } from './legacy-patterns';
import { analyzeMarketStructure } from '../market-structure';
import { adx } from '../indicators/adx';

export type StrategyCategory = 'Trend' | 'Momentum' | 'Breakout' | 'Mean Reversion' | 'Market Structure' | 'Liquidity' | 'Price Action' | 'Volume' | 'Divergence' | 'Volatility' | 'Multi-factor / Confluence' | 'Additional';

export interface Strategy {
  id: string;
  version: string;
  name: string;
  category: StrategyCategory;
  type: 'momentum' | 'trend' | 'contrarian' | 'neutral' | 'breakout' | 'volatility' | 'institutional' | 'adaptive';
  description: string;
  timeframes: Timeframe[];
  minCandles: number;
  defaultParameters: Record<string, number>;
  requiresVolume?: boolean;
  detect: (candles: Candle[], timeframe: Timeframe) => Signal[];
}

const bollingerStrategy: Strategy = {
  id: 'bollinger-volatility',
  version: '1.0.0',
  name: 'Bollinger Volatility',
  category: 'Additional',
  type: 'volatility',
  description: 'Uses the existing band-compression and price-position setup.',
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

export const STRATEGY_CATEGORIES: StrategyCategory[] = [
  'Trend', 'Momentum', 'Breakout', 'Mean Reversion', 'Market Structure', 'Liquidity',
  'Price Action', 'Volume', 'Divergence', 'Volatility', 'Multi-factor / Confluence', 'Additional',
];

export const STRATEGY_REGISTRY: Strategy[] = [...STRATEGY_LIBRARY, bollingerStrategy];
export const LIVE_STRATEGY_IDS = new Set(['ma-crossover', 'rsi-divergence', 'bollinger-volatility', 'trend-following', 'mean-reversion', 'donchian-breakout', 'support-resistance']);

export function getStrategy(strategyId: string): Strategy | undefined {
  return STRATEGY_REGISTRY.find((strategy) => strategy.id === strategyId);
}

function getIneligibilityReason(strategy: Strategy, candles: Candle[], timeframe: Timeframe): string | undefined {
  if (!strategy.timeframes.includes(timeframe)) return `Not supported on ${timeframe}`;
  if (candles.length < strategy.minCandles) return `Needs ${strategy.minCandles} candles`;
  if (strategy.requiresVolume && !candles.some((candle) => candle.volume > 0)) return 'Requires non-zero volume data';
  return undefined;
}

export function getStrategyAvailability(candles: Candle[], timeframe: Timeframe): { strategy: Strategy; eligible: boolean; reason?: string }[] {
  return STRATEGY_REGISTRY.map((strategy) => {
    const reason = getIneligibilityReason(strategy, candles, timeframe);
    return { strategy, eligible: !reason, reason };
  });
}

export function runStrategy(candles: Candle[], timeframe: Timeframe, strategyId: string): Signal[] {
  const strategy = getStrategy(strategyId);
  if (!strategy || getIneligibilityReason(strategy, candles, timeframe)) return [];
  return strategy.detect(candles, timeframe).map((result) => ({ ...result, strategyId: strategy.id, strategyVersion: strategy.version }));
}

export interface StrategyExecutionFailure {
  strategyId: string;
  strategy: string;
  message: string;
}

function collectStrategySignals(candles: Candle[], timeframe: Timeframe, strategies: Strategy[]): { signals: Signal[]; failures: StrategyExecutionFailure[] } {
  const signals: Signal[] = [];
  const failures: StrategyExecutionFailure[] = [];
  for (const strategy of strategies) {
    if (getIneligibilityReason(strategy, candles, timeframe)) continue;
    try {
      signals.push(...strategy.detect(candles, timeframe).map((result) => ({ ...result, strategyId: strategy.id, strategyVersion: strategy.version })));
    } catch {
      failures.push({
        strategyId: strategy.id,
        strategy: strategy.name,
        message: 'Strategy detector threw an error.',
      });
    }
  }
  return { signals, failures };
}

export function runAllLibraryStrategies(candles: Candle[], timeframe: Timeframe): Signal[] {
  return runAllLibraryStrategiesWithDiagnostics(candles, timeframe).signals;
}

export function runAllLibraryStrategiesWithDiagnostics(candles: Candle[], timeframe: Timeframe): { signals: Signal[]; failures: StrategyExecutionFailure[] } {
  return collectStrategySignals(candles, timeframe, STRATEGY_REGISTRY);
}

export function runAllStrategiesWithDiagnostics(candles: Candle[], timeframe: Timeframe): { signals: Signal[]; failures: StrategyExecutionFailure[] } {
  const collection = collectStrategySignals(candles, timeframe, STRATEGY_REGISTRY.filter((strategy) => LIVE_STRATEGY_IDS.has(strategy.id)));
  const signals = collection.signals;
  const failures = collection.failures;
  const detectors: Array<[string, () => Signal[] | Signal | null | undefined]> = [
    ['candlestick-patterns', () => detectCandlestickPatterns(candles)],
    ['extended-chart-patterns', () => detectExtendedChartPatterns(candles)],
    ...[detectHeadShoulders, detectDoubleTopBottom, detectTriangleFlag].map((detector, index): [string, () => Signal | null] => [`legacy-pattern-${index + 1}`, () => detector(candles)]),
  ];
  for (const [strategyId, detect] of detectors) {
    try {
      const result = detect();
      if (Array.isArray(result)) signals.push(...result);
      else if (result) signals.push(result);
    } catch {
      failures.push({ strategyId, strategy: strategyId, message: 'Strategy detector threw an error.' });
    }
  }
  return { signals, failures };
}

export function runAllStrategies(candles: Candle[], timeframe: Timeframe): Signal[] {
  return runAllStrategiesWithDiagnostics(candles, timeframe).signals;
}

export function selectBestStrategy(candles: Candle[], timeframe: Timeframe): Strategy {
  const eligible = STRATEGY_REGISTRY.filter((strategy) => LIVE_STRATEGY_IDS.has(strategy.id) && !getIneligibilityReason(strategy, candles, timeframe));
  const fallback = eligible[0] ?? STRATEGY_REGISTRY[0];
  if (candles.length < 60) return fallback;

  const structure = analyzeMarketStructure(candles.slice(-100));
  const rsiValues = rsi(candles.map((c) => c.close), 14);
  const adxValues = adx(candles, 14).adx;
  const latestRsi = rsiValues[rsiValues.length - 1] ?? 50;
  const latestAdx = adxValues[adxValues.length - 1] ?? 0;
  if (structure.trendStrength > 0.4) return eligible.find((strategy) => strategy.id === 'trend-following') ?? fallback;
  if ((structure.state === 'ranging' || structure.state === 'consolidating') && (latestRsi > 70 || latestRsi < 30)) return eligible.find((strategy) => strategy.id === 'rsi-divergence') ?? fallback;
  if (latestAdx > 40) return eligible.find((strategy) => strategy.id === 'bollinger-volatility') ?? fallback;
  return fallback;
}

function signal(strategy: string, side: Side, confidence: number, reason: string): Signal {
  return { strategy, side, confidence, reason };
}
