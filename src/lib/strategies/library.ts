import type { Candle, Signal, Timeframe } from '../types';
import type { Strategy } from './index';
import { atr, bollinger, ema, findSwings, macd, rsi, sma } from '../indicators';
import { adx } from '../indicators/adx';
import { donchian } from '../indicators/donchian';
import { obv } from '../indicators/obv';
import { stochastic } from '../indicators/stochastic';
import { vwap } from '../indicators/vwap';
import { detectCandlestickPatterns } from '../patterns/candlestick-patterns';
import { trendFollowingStrategy } from './trend-following';

const TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];
const SECONDS_PER_TIMEFRAME: Partial<Record<Timeframe, number>> = {
  '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
  '1h': 3600, '4h': 14400, '1d': 86400,
};
const AGGREGABLE_TIMEFRAMES = TIMEFRAMES.filter((timeframe) => Boolean(SECONDS_PER_TIMEFRAME[timeframe]));

type Side = 'buy' | 'sell';
type Pivot = { index: number; time: number; value: number };

function makeStrategy(
  id: string,
  name: string,
  category: Strategy['category'],
  type: Strategy['type'],
  description: string,
  minCandles: number,
  detect: Strategy['detect'],
  options: { requiresVolume?: boolean; defaultParameters?: Record<string, number>; timeframes?: Timeframe[] } = {},
): Strategy {
  return {
    id,
    version: '1.0.0',
    name,
    category,
    type,
    description,
    timeframes: options.timeframes ?? TIMEFRAMES,
    minCandles,
    defaultParameters: options.defaultParameters ?? {},
    requiresVolume: options.requiresVolume,
    detect,
  };
}

function emit(name: string, side: Side, reason: string, confidence = 0.58): Signal[] {
  return [{ strategy: name, side, confidence, reason }];
}

function valid(...values: number[]): boolean {
  return values.every(Number.isFinite);
}

function crossedAbove(previous: number, current: number, level: number): boolean {
  return previous <= level && current > level;
}

function crossedBelow(previous: number, current: number, level: number): boolean {
  return previous >= level && current < level;
}

function latestSwings(candles: Candle[], lookback = 100) {
  const offset = Math.max(0, candles.length - lookback);
  const swings = findSwings(candles.slice(offset), 3, 3);
  return {
    highs: swings.highs.map((point) => ({ ...point, index: point.index + offset })),
    lows: swings.lows.map((point) => ({ ...point, index: point.index + offset })),
  };
}

function swingTrend(candles: Candle[]): Side | null {
  const { highs, lows } = latestSwings(candles);
  if (highs.length < 2 || lows.length < 2) return null;
  const higherHighs = highs.at(-1)!.value > highs.at(-2)!.value;
  const higherLows = lows.at(-1)!.value > lows.at(-2)!.value;
  const lowerHighs = highs.at(-1)!.value < highs.at(-2)!.value;
  const lowerLows = lows.at(-1)!.value < lows.at(-2)!.value;
  if (higherHighs && higherLows) return 'buy';
  if (lowerHighs && lowerLows) return 'sell';
  return null;
}

function priorRange(candles: Candle[], period: number) {
  const prior = candles.slice(-(period + 1), -1);
  if (prior.length < period) return null;
  return {
    high: Math.max(...prior.map((candle) => candle.high)),
    low: Math.min(...prior.map((candle) => candle.low)),
  };
}

function volumeAverage(candles: Candle[], period: number): number {
  const values = candles.slice(-(period + 1), -1).map((candle) => candle.volume);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sessionVwap(candles: Candle[]): number[] {
  const last = candles.at(-1);
  if (!last) return [];
  const sessionStart = new Date(last.time * 1000);
  sessionStart.setUTCHours(0, 0, 0, 0);
  const firstSessionIndex = candles.findIndex((candle) => candle.time >= sessionStart.getTime() / 1000);
  if (firstSessionIndex < 0) return [];
  const sessionValues = vwap(candles.slice(firstSessionIndex));
  const output = new Array(candles.length).fill(NaN);
  sessionValues.forEach((value, index) => { output[firstSessionIndex + index] = value; });
  return output;
}

function aggregateCompleted(candles: Candle[], timeframe: Timeframe, factor: number): Candle[] {
  const seconds = SECONDS_PER_TIMEFRAME[timeframe];
  const closedCandles = candles.slice(0, -1);
  if (!seconds || closedCandles.length < factor) return [];
  const interval = seconds * factor;
  const groups = new Map<number, Candle[]>();
  for (const candle of closedCandles) {
    const bucket = Math.floor(candle.time / interval) * interval;
    const group = groups.get(bucket) ?? [];
    group.push(candle);
    groups.set(bucket, group);
  }
  return [...groups.entries()].flatMap(([start, group]) => {
    group.sort((a, b) => a.time - b.time);
    if (group.length !== factor || group[0].time !== start || group.at(-1)!.time + seconds !== start + interval) return [];
    return [{
      time: start,
      open: group[0].open,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      close: group.at(-1)!.close,
      volume: group.reduce((sum, candle) => sum + candle.volume, 0),
    }];
  });
}

function maDirection(candles: Candle[], periodFast = 20, periodSlow = 50, exponential = false): Side | null {
  const closes = candles.map((candle) => candle.close);
  const fast = exponential ? ema(closes, periodFast) : sma(closes, periodFast);
  const slow = exponential ? ema(closes, periodSlow) : sma(closes, periodSlow);
  const i = closes.length - 1;
  if (!valid(fast[i], slow[i], closes[i])) return null;
  if (closes[i] > fast[i] && fast[i] > slow[i]) return 'buy';
  if (closes[i] < fast[i] && fast[i] < slow[i]) return 'sell';
  return null;
}

function bullishSweep(candles: Candle[], lookback = 50, tolerance = 0): Pivot | null {
  const current = candles.at(-1);
  if (!current) return null;
  const { lows } = latestSwings(candles.slice(0, -1), lookback);
  const levels = lows.filter((pivot) => current.low < pivot.value * (1 - tolerance) && current.close > pivot.value);
  return levels.at(-1) ?? null;
}

function bearishSweep(candles: Candle[], lookback = 50, tolerance = 0): Pivot | null {
  const current = candles.at(-1);
  if (!current) return null;
  const { highs } = latestSwings(candles.slice(0, -1), lookback);
  const levels = highs.filter((pivot) => current.high > pivot.value * (1 + tolerance) && current.close < pivot.value);
  return levels.at(-1) ?? null;
}

function volumeBreakout(candles: Candle[]): Signal[] {
  const current = candles.at(-1);
  const range = priorRange(candles, 20);
  const average = volumeAverage(candles, 20);
  if (!current || !range || average <= 0 || current.volume <= average * 1.5) return [];
  if (current.close > range.high) return emit('Volume Breakout', 'buy', 'Close cleared the prior 20-bar high on volume above 1.5× its prior 20-bar average.');
  if (current.close < range.low) return emit('Volume Breakout', 'sell', 'Close cleared the prior 20-bar low on volume above 1.5× its prior 20-bar average.');
  return [];
}

const trendContinuation: Strategy = {
  ...trendFollowingStrategy,
  id: 'trend-following',
  name: 'Trend Continuation',
  category: 'Trend',
  description: 'ADX ≥25, directional movement, 20/50 SMA alignment, and the existing swing-structure trend must agree.',
  detect(candles, timeframe) {
    return trendFollowingStrategy.detect(candles, timeframe).map((signal) => ({ ...signal, strategy: 'Trend Continuation' }));
  },
};

export const STRATEGY_LIBRARY: Strategy[] = [
  makeStrategy('ma-crossover', 'Moving Average Trend', 'Trend', 'trend', 'Signals when the 20 SMA crosses above or below the 50 SMA.', 55, (candles) => {
    const closes = candles.map((candle) => candle.close);
    const fast = sma(closes, 20);
    const slow = sma(closes, 50);
    const i = candles.length - 1;
    if (!valid(fast[i - 1], slow[i - 1], fast[i], slow[i])) return [];
    if (fast[i - 1] <= slow[i - 1] && fast[i] > slow[i]) return emit('Moving Average Trend', 'buy', '20 SMA crossed above 50 SMA.');
    if (fast[i - 1] >= slow[i - 1] && fast[i] < slow[i]) return emit('Moving Average Trend', 'sell', '20 SMA crossed below 50 SMA.');
    return [];
  }, { defaultParameters: { fastPeriod: 20, slowPeriod: 50 }, timeframes: ['1h', '4h', '1d', '1w'] }),
  makeStrategy('ema-trend', 'EMA Trend', 'Trend', 'trend', 'Bullish when close > EMA20 > EMA50; bearish when close < EMA20 < EMA50.', 50, (candles) => {
    const side = maDirection(candles, 20, 50, true);
    return side ? emit('EMA Trend', side, 'Close, EMA20, and EMA50 are aligned.') : [];
  }, { defaultParameters: { fastPeriod: 20, slowPeriod: 50 } }),
  makeStrategy('adx-trend-strength', 'ADX Trend Strength', 'Trend', 'trend', 'ADX(14) must be at least 25 and +DI/−DI direction must agree with close versus SMA20.', 40, (candles) => {
    const current = candles.at(-1)!;
    const values = adx(candles, 14);
    const average = sma(candles.map((candle) => candle.close), 20);
    const i = candles.length - 1;
    if (!valid(values.adx[i], values.plusDI[i], values.minusDI[i], average[i]) || values.adx[i] < 25) return [];
    if (values.plusDI[i] > values.minusDI[i] && current.close > average[i]) return emit('ADX Trend Strength', 'buy', `ADX ${values.adx[i].toFixed(1)} with +DI above −DI and price above SMA20.`);
    if (values.minusDI[i] > values.plusDI[i] && current.close < average[i]) return emit('ADX Trend Strength', 'sell', `ADX ${values.adx[i].toFixed(1)} with −DI above +DI and price below SMA20.`);
    return [];
  }, { defaultParameters: { period: 14, minimumAdx: 25 } }),
  makeStrategy('trend-pullback', 'Trend Pullback', 'Trend', 'trend', 'In an EMA20/EMA50 trend with ADX >18, the prior candle touches EMA20 and the latest candle closes back on the trend side.', 55, (candles) => {
    const current = candles.at(-1)!;
    const previous = candles.at(-2)!;
    const closes = candles.map((candle) => candle.close);
    const fast = ema(closes, 20);
    const slow = ema(closes, 50);
    const strength = adx(candles, 14).adx.at(-1)!;
    const i = candles.length - 1;
    if (!valid(fast[i], slow[i], fast[i - 1], strength) || strength <= 18) return [];
    if (fast[i] > slow[i] && previous.low <= fast[i - 1] && current.close > fast[i]) return emit('Trend Pullback', 'buy', 'Price tested EMA20 and closed back above it while EMA20 > EMA50 and ADX >18.');
    if (fast[i] < slow[i] && previous.high >= fast[i - 1] && current.close < fast[i]) return emit('Trend Pullback', 'sell', 'Price tested EMA20 and closed back below it while EMA20 < EMA50 and ADX >18.');
    return [];
  }, { defaultParameters: { fastPeriod: 20, slowPeriod: 50, adxPeriod: 14, minimumAdx: 18 } }),
  trendContinuation,
  makeStrategy('mtf-trend-alignment', 'Multi-Timeframe Trend Alignment', 'Trend', 'adaptive', 'The current timeframe and a fully completed 4× aggregated timeframe must both have close > SMA20 > SMA50, or both have the inverse alignment.', 208, (candles, timeframe) => {
    const base = maDirection(candles, 20, 50);
    const higherCandles = aggregateCompleted(candles, timeframe, 4);
    const higher = maDirection(higherCandles, 20, 50);
    return base && base === higher ? emit('Multi-Timeframe Trend Alignment', base, 'Current and completed 4× timeframe moving-average trends align.') : [];
  }, { defaultParameters: { fastPeriod: 20, slowPeriod: 50, aggregationFactor: 4 }, timeframes: AGGREGABLE_TIMEFRAMES }),

  makeStrategy('rsi-momentum', 'RSI Momentum', 'Momentum', 'momentum', 'Signals when RSI(14) crosses above 50 or crosses below 50.', 16, (candles) => {
    const values = rsi(candles.map((candle) => candle.close), 14);
    const i = values.length - 1;
    if (!valid(values[i - 1], values[i])) return [];
    if (crossedAbove(values[i - 1], values[i], 50)) return emit('RSI Momentum', 'buy', 'RSI(14) crossed above its 50 momentum line.');
    if (crossedBelow(values[i - 1], values[i], 50)) return emit('RSI Momentum', 'sell', 'RSI(14) crossed below its 50 momentum line.');
    return [];
  }, { defaultParameters: { period: 14, signalLevel: 50 } }),
  makeStrategy('macd-momentum', 'MACD Momentum', 'Momentum', 'momentum', 'Signals on a MACD(12,26,9) line/signal crossover.', 35, (candles) => {
    const values = macd(candles.map((candle) => candle.close));
    const i = candles.length - 1;
    if (!valid(values.macd[i - 1], values.signal[i - 1], values.macd[i], values.signal[i])) return [];
    if (values.macd[i - 1] <= values.signal[i - 1] && values.macd[i] > values.signal[i]) return emit('MACD Momentum', 'buy', 'MACD line crossed above its signal line.');
    if (values.macd[i - 1] >= values.signal[i - 1] && values.macd[i] < values.signal[i]) return emit('MACD Momentum', 'sell', 'MACD line crossed below its signal line.');
    return [];
  }, { defaultParameters: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } }),
  makeStrategy('stochastic-momentum', 'Stochastic Momentum', 'Momentum', 'momentum', 'A %K/%D crossover must occur from oversold (<20) or overbought (>80) territory.', 20, (candles) => {
    const values = stochastic(candles, 14, 3, 3);
    const i = candles.length - 1;
    if (!valid(values.k[i - 1], values.d[i - 1], values.k[i], values.d[i])) return [];
    if (values.k[i - 1] <= values.d[i - 1] && values.k[i] > values.d[i] && values.k[i - 1] < 20) return emit('Stochastic Momentum', 'buy', '%K crossed above %D from below 20.');
    if (values.k[i - 1] >= values.d[i - 1] && values.k[i] < values.d[i] && values.k[i - 1] > 80) return emit('Stochastic Momentum', 'sell', '%K crossed below %D from above 80.');
    return [];
  }, { defaultParameters: { kPeriod: 14, dPeriod: 3, oversold: 20, overbought: 80 } }),
  makeStrategy('momentum-breakout', 'Momentum Breakout', 'Momentum', 'breakout', 'A close makes a 10-bar closing high/low and the 10-bar rate of change exceeds ±1%.', 12, (candles) => {
    const current = candles.at(-1)!;
    const prior = candles.slice(-11, -1);
    if (prior.length < 10) return [];
    const high = Math.max(...prior.map((candle) => candle.close));
    const low = Math.min(...prior.map((candle) => candle.close));
    const roc = (current.close / candles.at(-11)!.close - 1) * 100;
    if (current.close > high && roc > 1) return emit('Momentum Breakout', 'buy', `Close made a 10-bar high with 10-bar ROC ${roc.toFixed(2)}%.`);
    if (current.close < low && roc < -1) return emit('Momentum Breakout', 'sell', `Close made a 10-bar low with 10-bar ROC ${roc.toFixed(2)}%.`);
    return [];
  }, { defaultParameters: { lookback: 10, minimumRocPct: 1 } }),
  makeStrategy('roc-momentum', 'Rate-of-Change Momentum', 'Momentum', 'momentum', 'Signals when 12-bar ROC crosses zero, marking a change in price momentum.', 15, (candles) => {
    const i = candles.length - 1;
    const current = candles[i].close / candles[i - 12].close - 1;
    const previous = candles[i - 1].close / candles[i - 13].close - 1;
    if (crossedAbove(previous, current, 0)) return emit('Rate-of-Change Momentum', 'buy', '12-bar rate of change crossed above zero.');
    if (crossedBelow(previous, current, 0)) return emit('Rate-of-Change Momentum', 'sell', '12-bar rate of change crossed below zero.');
    return [];
  }, { defaultParameters: { period: 12 } }),

  makeStrategy('range-breakout', 'Range Breakout', 'Breakout', 'breakout', 'Signals when close crosses the highest high or lowest low of the prior 20 candles.', 22, (candles) => {
    const current = candles.at(-1)!;
    const previous = candles.at(-2)!;
    const range = priorRange(candles, 20);
    if (!range) return [];
    if (crossedAbove(previous.close, current.close, range.high)) return emit('Range Breakout', 'buy', 'Close broke above the prior 20-candle range.');
    if (crossedBelow(previous.close, current.close, range.low)) return emit('Range Breakout', 'sell', 'Close broke below the prior 20-candle range.');
    return [];
  }, { defaultParameters: { rangePeriod: 20 } }),
  makeStrategy('donchian-breakout', 'Donchian Breakout', 'Breakout', 'breakout', 'Signals when close clears the prior 20-bar Donchian high or low.', 22, (candles) => {
    const current = candles[candles.length - 1];
    const previous = candles[candles.length - 2];
    const channel = donchian(candles, 20);
    const i = candles.length - 1;
    const upper = channel.upper[i - 1];
    const lower = channel.lower[i - 1];
    if (!valid(upper, lower)) return [];
    if (previous.close <= upper && current.close > upper) return emit('Donchian Breakout', 'buy', 'Close broke above the previous 20-bar Donchian high.');
    if (previous.close >= lower && current.close < lower) return emit('Donchian Breakout', 'sell', 'Close broke below the previous 20-bar Donchian low.');
    return [];
  }, { defaultParameters: { channelPeriod: 20 }, timeframes: ['15m', '1h', '4h', '1d', '1w'] }),
  makeStrategy('volatility-breakout', 'Volatility Breakout', 'Breakout', 'volatility', 'After the prior Bollinger width reached a 20-bar low, close must break outside the current 20-period, 2σ band.', 45, (candles) => {
    const closes = candles.map((candle) => candle.close);
    const bands = bollinger(closes, 20, 2);
    const i = candles.length - 1;
    const compressedWidths = bands.width.slice(i - 20, i - 1).filter(Number.isFinite);
    if (!valid(bands.upper[i], bands.lower[i], bands.width[i]) || !compressedWidths.length || bands.width[i - 1] > Math.min(...compressedWidths) * 1.2) return [];
    if (closes[i] > bands.upper[i]) return emit('Volatility Breakout', 'buy', 'Price closed above the Bollinger band after a 20-bar volatility squeeze.');
    if (closes[i] < bands.lower[i]) return emit('Volatility Breakout', 'sell', 'Price closed below the Bollinger band after a 20-bar volatility squeeze.');
    return [];
  }, { defaultParameters: { period: 20, standardDeviations: 2, squeezeLookback: 20 } }),
  makeStrategy('atr-breakout', 'ATR Breakout', 'Breakout', 'breakout', 'Close must clear the prior 20-bar high/low and the current candle range must exceed 1.5× ATR(14).', 36, (candles) => {
    const current = candles.at(-1)!;
    const range = priorRange(candles, 20);
    const currentAtr = atr(candles, 14).at(-1)!;
    if (!range || !Number.isFinite(currentAtr) || current.high - current.low <= currentAtr * 1.5) return [];
    if (current.close > range.high) return emit('ATR Breakout', 'buy', 'Close cleared the prior 20-bar high on a candle range >1.5× ATR(14).');
    if (current.close < range.low) return emit('ATR Breakout', 'sell', 'Close cleared the prior 20-bar low on a candle range >1.5× ATR(14).');
    return [];
  }, { defaultParameters: { rangePeriod: 20, atrPeriod: 14, atrMultiplier: 1.5 } }),
  makeStrategy('consolidation-breakout', 'Consolidation Breakout', 'Breakout', 'breakout', 'The prior 10-bar range must be ≤4% of price; signal when close breaks that range.', 12, (candles) => {
    const current = candles.at(-1)!;
    const range = priorRange(candles, 10);
    if (!range || (range.high - range.low) / current.close > 0.04) return [];
    if (current.close > range.high) return emit('Consolidation Breakout', 'buy', 'Close broke above a prior 10-bar range no wider than 4% of price.');
    if (current.close < range.low) return emit('Consolidation Breakout', 'sell', 'Close broke below a prior 10-bar range no wider than 4% of price.');
    return [];
  }, { defaultParameters: { rangePeriod: 10, maximumRangePct: 4 } }),

  makeStrategy('mean-reversion', 'RSI Mean Reversion', 'Mean Reversion', 'contrarian', 'Fades RSI(14) at or below 28 as oversold and at or above 72 as overbought.', 30, (candles) => {
    const values = rsi(candles.map((candle) => candle.close), 14);
    const value = values[values.length - 1];
    if (!Number.isFinite(value)) return [];
    if (value <= 28) return emit('RSI Mean Reversion', 'buy', `RSI(14) is oversold at ${value.toFixed(1)}.`);
    if (value >= 72) return emit('RSI Mean Reversion', 'sell', `RSI(14) is overbought at ${value.toFixed(1)}.`);
    return [];
  }, { defaultParameters: { period: 14, oversold: 28, overbought: 72 }, timeframes: ['5m', '15m', '30m', '1h', '4h'] }),
  makeStrategy('vwap-mean-reversion', 'VWAP Mean Reversion', 'Mean Reversion', 'contrarian', 'Signals when price crosses back above/below the current UTC-session VWAP after trading on the other side.', 2, (candles) => {
    const current = candles.at(-1)!;
    const previous = candles.at(-2)!;
    const values = sessionVwap(candles);
    const i = candles.length - 1;
    if (!valid(values[i - 1], values[i])) return [];
    if (previous.close <= values[i - 1] && current.close > values[i]) return emit('VWAP Mean Reversion', 'buy', 'Close crossed back above UTC-session VWAP.');
    if (previous.close >= values[i - 1] && current.close < values[i]) return emit('VWAP Mean Reversion', 'sell', 'Close crossed back below UTC-session VWAP.');
    return [];
  }, { requiresVolume: true, timeframes: TIMEFRAMES.filter((timeframe) => Boolean(SECONDS_PER_TIMEFRAME[timeframe]) && SECONDS_PER_TIMEFRAME[timeframe]! <= 14400) }),
  makeStrategy('support-resistance', 'Support/Resistance Reversion', 'Mean Reversion', 'contrarian', 'Uses the last three confirmed swing highs/lows as resistance/support; signals within 8% of either end of that range.', 40, (candles) => {
    const { highs, lows } = latestSwings(candles);
    const last = candles[candles.length - 1]?.close;
    const resistance = highs.length ? Math.max(...highs.slice(-3).map((point) => point.value)) : last;
    const support = lows.length ? Math.min(...lows.slice(-3).map((point) => point.value)) : last;
    const width = (resistance ?? 0) - (support ?? 0);
    if (!Number.isFinite(last) || !Number.isFinite(resistance) || !Number.isFinite(support) || width <= 0) return [];
    const position = (last - support) / width;
    if (position >= 0.92) return emit('Support/Resistance Reversion', 'sell', 'Price is testing the recent swing resistance zone.');
    if (position <= 0.08) return emit('Support/Resistance Reversion', 'buy', 'Price is testing the recent swing support zone.');
    return [];
  }, { defaultParameters: { swingLeft: 3, swingRight: 3, proximity: 0.08 }, timeframes: ['15m', '1h', '4h', '1d'] }),
  makeStrategy('volatility-expansion-reversion', 'Volatility Expansion/Reversion', 'Mean Reversion', 'contrarian', 'Signals when close re-enters the 20-period, 2σ Bollinger bands after closing outside a band.', 22, (candles) => {
    const closes = candles.map((candle) => candle.close);
    const bands = bollinger(closes, 20, 2);
    const i = candles.length - 1;
    if (!valid(bands.upper[i - 1], bands.lower[i - 1], bands.upper[i], bands.lower[i])) return [];
    if (closes[i - 1] < bands.lower[i - 1] && closes[i] >= bands.lower[i]) return emit('Volatility Expansion/Reversion', 'buy', 'Close re-entered the lower Bollinger band after an outside close.');
    if (closes[i - 1] > bands.upper[i - 1] && closes[i] <= bands.upper[i]) return emit('Volatility Expansion/Reversion', 'sell', 'Close re-entered the upper Bollinger band after an outside close.');
    return [];
  }, { defaultParameters: { period: 20, standardDeviations: 2 } }),

  makeStrategy('bos-continuation', 'BOS Continuation', 'Market Structure', 'institutional', 'Signals on a close crossing above/below the latest confirmed swing high/low in the direction of the break.', 20, (candles) => {
    const current = candles.at(-1)!;
    const previous = candles.at(-2)!;
    const { highs, lows } = latestSwings(candles.slice(0, -1));
    const high = highs.at(-1)?.value;
    const low = lows.at(-1)?.value;
    if (high && crossedAbove(previous.close, current.close, high)) return emit('BOS Continuation', 'buy', `Close broke above confirmed swing high ${high.toFixed(4)}.`);
    if (low && crossedBelow(previous.close, current.close, low)) return emit('BOS Continuation', 'sell', `Close broke below confirmed swing low ${low.toFixed(4)}.`);
    return [];
  }),
  makeStrategy('choch-reversal', 'CHoCH Reversal', 'Market Structure', 'institutional', 'After two higher highs and higher lows, a close breaking the latest swing low signals bearish CHoCH; the inverse signals bullish CHoCH.', 30, (candles) => {
    const current = candles.at(-1)!;
    const previous = candles.at(-2)!;
    const { highs, lows } = latestSwings(candles.slice(0, -1));
    if (highs.length < 2 || lows.length < 2) return [];
    const bullish = highs.at(-1)!.value > highs.at(-2)!.value && lows.at(-1)!.value > lows.at(-2)!.value;
    const bearish = highs.at(-1)!.value < highs.at(-2)!.value && lows.at(-1)!.value < lows.at(-2)!.value;
    if (bullish && crossedBelow(previous.close, current.close, lows.at(-1)!.value)) return emit('CHoCH Reversal', 'sell', 'Close broke the latest higher low after a higher-high/higher-low sequence.');
    if (bearish && crossedAbove(previous.close, current.close, highs.at(-1)!.value)) return emit('CHoCH Reversal', 'buy', 'Close broke the latest lower high after a lower-high/lower-low sequence.');
    return [];
  }),
  makeStrategy('higher-high-higher-low-continuation', 'Higher-High/Higher-Low Continuation', 'Market Structure', 'trend', 'Signals long when the last two confirmed swing highs and lows are both rising.', 30, (candles) => {
    const { highs, lows } = latestSwings(candles);
    if (highs.length >= 2 && lows.length >= 2 && highs.at(-1)!.value > highs.at(-2)!.value && lows.at(-1)!.value > lows.at(-2)!.value) return emit('Higher-High/Higher-Low Continuation', 'buy', 'The last two confirmed swing highs and swing lows are rising.');
    return [];
  }),
  makeStrategy('lower-high-lower-low-continuation', 'Lower-High/Lower-Low Continuation', 'Market Structure', 'trend', 'Signals short when the last two confirmed swing highs and lows are both falling.', 30, (candles) => {
    const { highs, lows } = latestSwings(candles);
    if (highs.length >= 2 && lows.length >= 2 && highs.at(-1)!.value < highs.at(-2)!.value && lows.at(-1)!.value < lows.at(-2)!.value) return emit('Lower-High/Lower-Low Continuation', 'sell', 'The last two confirmed swing highs and swing lows are falling.');
    return [];
  }),
  makeStrategy('structure-break-retest', 'Structure Break + Retest', 'Market Structure', 'institutional', 'After a prior close broke a confirmed swing level, signal when price retests that level and closes back on the breakout side.', 25, (candles) => {
    const current = candles.at(-1)!;
    const previous = candles.at(-2)!;
    const { highs, lows } = latestSwings(candles.slice(0, -1));
    const recent = candles.slice(-8, -1);
    for (const pivot of highs.slice(-3).reverse()) {
      const broke = recent.some((candle) => candle.close > pivot.value);
      if (broke && previous.close > pivot.value && current.low <= pivot.value && current.close > pivot.value) return emit('Structure Break + Retest', 'buy', `Price retested confirmed swing high ${pivot.value.toFixed(4)} after a close above it.`);
    }
    for (const pivot of lows.slice(-3).reverse()) {
      const broke = recent.some((candle) => candle.close < pivot.value);
      if (broke && previous.close < pivot.value && current.high >= pivot.value && current.close < pivot.value) return emit('Structure Break + Retest', 'sell', `Price retested confirmed swing low ${pivot.value.toFixed(4)} after a close below it.`);
    }
    return [];
  }),

  makeStrategy('liquidity-sweep', 'Liquidity Sweep', 'Liquidity', 'institutional', 'Signals a wick through a confirmed swing high/low that closes back inside the prior level.', 25, (candles) => {
    const below = bullishSweep(candles);
    if (below) return emit('Liquidity Sweep', 'buy', `Low swept confirmed swing low ${below.value.toFixed(4)} and closed back above it.`);
    const above = bearishSweep(candles);
    if (above) return emit('Liquidity Sweep', 'sell', `High swept confirmed swing high ${above.value.toFixed(4)} and closed back below it.`);
    return [];
  }),
  makeStrategy('stop-run-reversal', 'Stop-Run Reversal', 'Liquidity', 'contrarian', 'A swing-level sweep must close back through the level, with the rejection wick at least twice the candle body.', 25, (candles) => {
    const current = candles.at(-1)!;
    const body = Math.abs(current.close - current.open);
    const below = bullishSweep(candles);
    if (below && current.close - current.low >= Math.max(body * 2, current.high - current.low * 0.35)) return emit('Stop-Run Reversal', 'buy', 'A swing-low sweep closed back above the level with a rejection wick ≥2× body.');
    const above = bearishSweep(candles);
    if (above && current.high - current.close >= Math.max(body * 2, current.high - current.low * 0.35)) return emit('Stop-Run Reversal', 'sell', 'A swing-high sweep closed back below the level with a rejection wick ≥2× body.');
    return [];
  }),
  makeStrategy('equal-high-low-sweep', 'Equal High/Low Sweep', 'Liquidity', 'institutional', 'Requires two confirmed swing highs/lows within 0.3%, then a sweep through that pool and close back across it.', 35, (candles) => {
    const current = candles.at(-1)!;
    const { highs, lows } = latestSwings(candles.slice(0, -1), 60);
    const highPair = highs.length >= 2 ? [highs.at(-2)!, highs.at(-1)!] : null;
    const lowPair = lows.length >= 2 ? [lows.at(-2)!, lows.at(-1)!] : null;
    if (highPair) {
      const level = (highPair[0].value + highPair[1].value) / 2;
      if (Math.abs(highPair[0].value - highPair[1].value) / level <= 0.003 && current.high > level && current.close < level) return emit('Equal High/Low Sweep', 'sell', 'Price swept two swing highs within 0.3% and closed below their shared level.');
    }
    if (lowPair) {
      const level = (lowPair[0].value + lowPair[1].value) / 2;
      if (Math.abs(lowPair[0].value - lowPair[1].value) / level <= 0.003 && current.low < level && current.close > level) return emit('Equal High/Low Sweep', 'buy', 'Price swept two swing lows within 0.3% and closed above their shared level.');
    }
    return [];
  }),
  makeStrategy('liquidity-sweep-structure-confirmation', 'Liquidity Sweep + Structure Confirmation', 'Liquidity', 'institutional', 'A confirmed swing-low/high sweep must be followed within three candles by a close breaking the latest confirmed opposite swing.', 35, (candles) => {
    const { highs, lows } = latestSwings(candles.slice(0, -1), 60);
    let bullishIndex = -1;
    let bearishIndex = -1;
    for (let index = Math.max(0, candles.length - 4); index < candles.length - 1; index++) {
      if (bullishSweep(candles.slice(0, index + 1), 60)) bullishIndex = index;
      if (bearishSweep(candles.slice(0, index + 1), 60)) bearishIndex = index;
    }
    const current = candles.at(-1)!;
    const previous = candles.at(-2)!;
    if (bullishIndex >= 0 && highs.length && crossedAbove(previous.close, current.close, highs.at(-1)!.value)) return emit('Liquidity Sweep + Structure Confirmation', 'buy', 'A recent swing-low sweep was followed by a close above the latest confirmed swing high.');
    if (bearishIndex >= 0 && lows.length && crossedBelow(previous.close, current.close, lows.at(-1)!.value)) return emit('Liquidity Sweep + Structure Confirmation', 'sell', 'A recent swing-high sweep was followed by a close below the latest confirmed swing low.');
    return [];
  }),

  makeStrategy('engulfing-confirmation', 'Engulfing Confirmation', 'Price Action', 'neutral', 'Uses the existing bullish/bearish engulfing detector on the latest candle.', 3, (candles) => {
    const match = detectCandlestickPatterns(candles).find((signal) => signal.strategy === 'Bullish Engulfing' || signal.strategy === 'Bearish Engulfing');
    return match ? [{ ...match, strategy: 'Engulfing Confirmation' }] : [];
  }),
  makeStrategy('pin-bar-reversal', 'Pin Bar Reversal', 'Price Action', 'contrarian', 'Requires a rejection wick ≥2× body, opposite wick ≤0.5× body, and a preceding five-bar move in the reversal direction.', 7, (candles) => {
    const current = candles.at(-1)!;
    const body = Math.abs(current.close - current.open);
    if (body <= 0) return [];
    const upper = current.high - Math.max(current.open, current.close);
    const lower = Math.min(current.open, current.close) - current.low;
    const prior = candles.at(-6)!.close;
    if (current.close < prior && lower >= body * 2 && upper <= body * 0.5) return emit('Pin Bar Reversal', 'buy', 'A lower-wick pin bar formed after a five-bar decline.');
    if (current.close > prior && upper >= body * 2 && lower <= body * 0.5) return emit('Pin Bar Reversal', 'sell', 'An upper-wick pin bar formed after a five-bar advance.');
    return [];
  }),
  makeStrategy('inside-bar-breakout', 'Inside Bar Breakout', 'Price Action', 'breakout', 'The prior candle must be inside its mother bar; signal when the latest close breaks the mother range.', 3, (candles) => {
    const current = candles.at(-1)!;
    const inside = candles.at(-2)!;
    const mother = candles.at(-3)!;
    if (inside.high <= mother.high && inside.low >= mother.low) {
      if (current.close > mother.high) return emit('Inside Bar Breakout', 'buy', 'Close broke above the mother-bar high after an inside bar.');
      if (current.close < mother.low) return emit('Inside Bar Breakout', 'sell', 'Close broke below the mother-bar low after an inside bar.');
    }
    return [];
  }),
  makeStrategy('rejection-candle', 'Rejection Candle', 'Price Action', 'contrarian', 'A candle with a rejection wick ≥2× body must touch a confirmed swing level and close back away from it.', 15, (candles) => {
    const current = candles.at(-1)!;
    const body = Math.abs(current.close - current.open);
    if (body <= 0) return [];
    const { highs, lows } = latestSwings(candles.slice(0, -1));
    const support = lows.at(-1)?.value;
    const resistance = highs.at(-1)?.value;
    const lowerWick = Math.min(current.open, current.close) - current.low;
    const upperWick = current.high - Math.max(current.open, current.close);
    if (support && current.low <= support * 1.002 && current.close > support && lowerWick >= body * 2) return emit('Rejection Candle', 'buy', 'A long lower wick rejected confirmed swing support.');
    if (resistance && current.high >= resistance * 0.998 && current.close < resistance && upperWick >= body * 2) return emit('Rejection Candle', 'sell', 'A long upper wick rejected confirmed swing resistance.');
    return [];
  }),
  makeStrategy('break-and-retest', 'Break-and-Retest', 'Price Action', 'breakout', 'After a prior close broke the prior 20-bar range, signal when the latest candle tests the broken boundary and closes beyond it again.', 25, (candles) => {
    const current = candles.at(-1)!;
    const previous = candles.at(-2)!;
    const levels = priorRange(candles.slice(0, -7), 20);
    if (!levels) return [];
    const earlier = candles.slice(-8, -2);
    if (earlier.some((candle) => candle.close > levels.high) && previous.close > levels.high && current.low <= levels.high && current.close > levels.high) return emit('Break-and-Retest', 'buy', 'Price retested the prior 20-bar high after breaking above it.');
    if (earlier.some((candle) => candle.close < levels.low) && previous.close < levels.low && current.high >= levels.low && current.close < levels.low) return emit('Break-and-Retest', 'sell', 'Price retested the prior 20-bar low after breaking below it.');
    return [];
  }),

  makeStrategy('volume-breakout', 'Volume Breakout', 'Volume', 'breakout', 'A close beyond the prior 20-bar high/low must have volume >1.5× the prior 20-bar average.', 22, volumeBreakout, { requiresVolume: true, defaultParameters: { lookback: 20, volumeMultiple: 1.5 } }),
  makeStrategy('volume-confirmation', 'Volume Confirmation', 'Volume', 'momentum', 'Confirms a close above/below the prior close only when volume exceeds its prior 20-bar average.', 22, (candles) => {
    const current = candles.at(-1)!;
    const previous = candles.at(-2)!;
    const average = volumeAverage(candles, 20);
    if (average <= 0 || current.volume <= average) return [];
    if (current.close > previous.close) return emit('Volume Confirmation', 'buy', 'Higher close confirmed by volume above its prior 20-bar average.');
    if (current.close < previous.close) return emit('Volume Confirmation', 'sell', 'Lower close confirmed by volume above its prior 20-bar average.');
    return [];
  }, { requiresVolume: true }),
  makeStrategy('obv-trend-confirmation', 'OBV Trend Confirmation', 'Volume', 'momentum', 'The 10-bar OBV slope must agree with price being above/below its 10-bar-old close.', 22, (candles) => {
    const values = obv(candles);
    const i = candles.length - 1;
    if (!valid(values[i], values[i - 10])) return [];
    if (candles[i].close > candles[i - 10].close && values[i] > values[i - 10]) return emit('OBV Trend Confirmation', 'buy', 'Price and OBV both rose over the last 10 bars.');
    if (candles[i].close < candles[i - 10].close && values[i] < values[i - 10]) return emit('OBV Trend Confirmation', 'sell', 'Price and OBV both fell over the last 10 bars.');
    return [];
  }, { requiresVolume: true, defaultParameters: { lookback: 10 } }),
  makeStrategy('volume-divergence', 'Volume Divergence', 'Volume', 'contrarian', 'A higher price swing high/lower swing low must be accompanied by a lower/higher OBV reading at the corresponding pivots.', 40, (candles) => {
    const values = obv(candles);
    const { highs, lows } = latestSwings(candles);
    if (highs.length >= 2) {
      const first = highs.at(-2)!;
      const second = highs.at(-1)!;
      if (second.value > first.value && values[second.index] < values[first.index]) return emit('Volume Divergence', 'sell', 'Price formed a higher swing high while OBV formed a lower reading.');
    }
    if (lows.length >= 2) {
      const first = lows.at(-2)!;
      const second = lows.at(-1)!;
      if (second.value < first.value && values[second.index] > values[first.index]) return emit('Volume Divergence', 'buy', 'Price formed a lower swing low while OBV formed a higher reading.');
    }
    return [];
  }, { requiresVolume: true }),

  makeStrategy('rsi-divergence', 'RSI Divergence', 'Divergence', 'contrarian', 'Compares price and RSI(14) at the last two confirmed swing highs or lows.', 35, (candles) => {
    const values = rsi(candles.map((candle) => candle.close), 14);
    const { highs, lows } = latestSwings(candles);
    if (highs.length >= 2) {
      const first = highs[highs.length - 2];
      const second = highs[highs.length - 1];
      if (second.value > first.value && values[second.index] < values[first.index] && values[second.index] < 70) return emit('RSI Divergence', 'sell', 'Price made a higher swing high while RSI made a lower high.');
    }
    if (lows.length >= 2) {
      const first = lows[lows.length - 2];
      const second = lows[lows.length - 1];
      if (second.value < first.value && values[second.index] > values[first.index] && values[second.index] > 30) return emit('RSI Divergence', 'buy', 'Price made a lower swing low while RSI made a higher low.');
    }
    return [];
  }, { defaultParameters: { period: 14, swingLeft: 3, swingRight: 3 }, timeframes: ['15m', '1h', '4h', '1d'] }),
  makeStrategy('macd-divergence', 'MACD Divergence', 'Divergence', 'contrarian', 'A higher/lower price swing must be accompanied by a lower/higher MACD-histogram reading at the matching pivots.', 40, (candles) => {
    const values = macd(candles.map((candle) => candle.close)).hist;
    const { highs, lows } = latestSwings(candles);
    if (highs.length >= 2) {
      const first = highs.at(-2)!;
      const second = highs.at(-1)!;
      if (second.value > first.value && values[second.index] < values[first.index]) return emit('MACD Divergence', 'sell', 'Price formed a higher swing high while MACD histogram formed a lower reading.');
    }
    if (lows.length >= 2) {
      const first = lows.at(-2)!;
      const second = lows.at(-1)!;
      if (second.value < first.value && values[second.index] > values[first.index]) return emit('MACD Divergence', 'buy', 'Price formed a lower swing low while MACD histogram formed a higher reading.');
    }
    return [];
  }),
  makeStrategy('price-volume-divergence', 'Price/Volume Divergence', 'Divergence', 'contrarian', 'A higher/lower price swing must be accompanied by lower/higher three-bar average volume around the corresponding pivots.', 40, (candles) => {
    const { highs, lows } = latestSwings(candles);
    if (highs.length >= 2) {
      const first = highs.at(-2)!;
      const second = highs.at(-1)!;
      const firstVolume = candles.slice(Math.max(0, first.index - 2), first.index + 1).reduce((sum, candle) => sum + candle.volume, 0) / Math.min(3, first.index + 1);
      const secondVolume = candles.slice(Math.max(0, second.index - 2), second.index + 1).reduce((sum, candle) => sum + candle.volume, 0) / Math.min(3, second.index + 1);
      if (second.value > first.value && secondVolume < firstVolume) return emit('Price/Volume Divergence', 'sell', 'Price made a higher swing high on lower average volume.');
    }
    if (lows.length >= 2) {
      const first = lows.at(-2)!;
      const second = lows.at(-1)!;
      const firstVolume = candles.slice(Math.max(0, first.index - 2), first.index + 1).reduce((sum, candle) => sum + candle.volume, 0) / Math.min(3, first.index + 1);
      const secondVolume = candles.slice(Math.max(0, second.index - 2), second.index + 1).reduce((sum, candle) => sum + candle.volume, 0) / Math.min(3, second.index + 1);
      if (second.value < first.value && secondVolume < firstVolume) return emit('Price/Volume Divergence', 'buy', 'Price made a lower swing low on lower average volume.');
    }
    return [];
  }, { requiresVolume: true }),

  makeStrategy('atr-expansion', 'ATR Expansion', 'Volatility', 'volatility', 'Current ATR(14) must exceed the previous 10-bar ATR average by 25%; direction follows the current candle.', 40, (candles) => {
    const values = atr(candles, 14);
    const i = values.length - 1;
    const baseline = values.slice(i - 10, i).filter(Number.isFinite);
    const current = candles.at(-1)!;
    const average = baseline.length ? baseline.reduce((sum, value) => sum + value, 0) / baseline.length : 0;
    if (!Number.isFinite(values[i]) || average <= 0 || values[i] <= average * 1.25) return [];
    if (current.close > current.open) return emit('ATR Expansion', 'buy', 'ATR(14) expanded >25% over its previous 10-bar average on an up candle.');
    if (current.close < current.open) return emit('ATR Expansion', 'sell', 'ATR(14) expanded >25% over its previous 10-bar average on a down candle.');
    return [];
  }, { defaultParameters: { atrPeriod: 14, baselinePeriod: 10, expansionMultiple: 1.25 } }),
  makeStrategy('atr-compression-breakout', 'ATR Compression → Breakout', 'Volatility', 'breakout', 'Prior ATR(14) must be at its 50-bar minimum; signal when close breaks the prior 20-bar range.', 80, (candles) => {
    const current = candles.at(-1)!;
    const values = atr(candles, 14);
    const range = priorRange(candles, 20);
    const i = values.length - 1;
    const priorAtr = values.slice(i - 50, i).filter(Number.isFinite);
    if (!range || !Number.isFinite(values[i - 1]) || !priorAtr.length || values[i - 1] > Math.min(...priorAtr) * 1.1) return [];
    if (current.close > range.high) return emit('ATR Compression → Breakout', 'buy', 'Close broke above the prior range after ATR(14) reached a 50-bar compression low.');
    if (current.close < range.low) return emit('ATR Compression → Breakout', 'sell', 'Close broke below the prior range after ATR(14) reached a 50-bar compression low.');
    return [];
  }, { defaultParameters: { atrPeriod: 14, compressionLookback: 50, breakoutLookback: 20 } }),

  makeStrategy('volatility-regime-transition', 'Volatility Regime Transition', 'Volatility', 'volatility', 'Detects a 20-bar Bollinger-width compression followed by width expansion >25%; direction follows close versus the band midpoint.', 45, (candles) => {
    const closes = candles.map((candle) => candle.close);
    const bands = bollinger(closes, 20, 2);
    const i = candles.length - 1;
    const priorWidths = bands.width.slice(i - 20, i - 1).filter(Number.isFinite);
    if (!valid(bands.width[i - 1], bands.width[i], bands.middle[i]) || priorWidths.length < 10) return [];
    const compressed = bands.width[i - 1] <= Math.min(...priorWidths) * 1.1;
    if (!compressed || bands.width[i] <= bands.width[i - 1] * 1.25) return [];
    if (closes[i] > bands.middle[i]) return emit('Volatility Regime Transition', 'buy', 'Bollinger width expanded >25% from a recent compression while price closed above the midpoint.');
    if (closes[i] < bands.middle[i]) return emit('Volatility Regime Transition', 'sell', 'Bollinger width expanded >25% from a recent compression while price closed below the midpoint.');
    return [];
  }, { defaultParameters: { period: 20, standardDeviations: 2, expansionMultiple: 1.25 } }),

  makeStrategy('trend-momentum', 'Trend + Momentum', 'Multi-factor / Confluence', 'adaptive', 'EMA20/EMA50 trend must align with RSI(14) >55 for longs or <45 for shorts.', 55, (candles) => {
    const side = maDirection(candles, 20, 50, true);
    const value = rsi(candles.map((candle) => candle.close), 14).at(-1)!;
    if (side === 'buy' && value > 55) return emit('Trend + Momentum', 'buy', 'EMA trend aligns with RSI(14) above 55.');
    if (side === 'sell' && value < 45) return emit('Trend + Momentum', 'sell', 'EMA trend aligns with RSI(14) below 45.');
    return [];
  }, { defaultParameters: { fastPeriod: 20, slowPeriod: 50, rsiPeriod: 14 } }),
  makeStrategy('trend-pullback-structure', 'Trend + Pullback + Structure', 'Multi-factor / Confluence', 'adaptive', 'Requires rising/falling confirmed swing structure, EMA20/EMA50 alignment, and a touch-and-close-back through EMA20.', 55, (candles) => {
    const current = candles.at(-1)!;
    const previous = candles.at(-2)!;
    const direction = swingTrend(candles);
    const closes = candles.map((candle) => candle.close);
    const fast = ema(closes, 20);
    const slow = ema(closes, 50);
    const i = candles.length - 1;
    if (direction === 'buy' && fast[i] > slow[i] && previous.low <= fast[i - 1] && current.close > fast[i]) return emit('Trend + Pullback + Structure', 'buy', 'Rising swing structure and EMA trend aligned after an EMA20 pullback.');
    if (direction === 'sell' && fast[i] < slow[i] && previous.high >= fast[i - 1] && current.close < fast[i]) return emit('Trend + Pullback + Structure', 'sell', 'Falling swing structure and EMA trend aligned after an EMA20 pullback.');
    return [];
  }),
  makeStrategy('breakout-volume', 'Breakout + Volume', 'Multi-factor / Confluence', 'adaptive', 'Requires a close beyond the prior 20-bar range and volume >1.5× its prior 20-bar average.', 22, (candles) => volumeBreakout(candles).map((signal) => ({ ...signal, strategy: 'Breakout + Volume' })), { requiresVolume: true, defaultParameters: { lookback: 20, volumeMultiple: 1.5 } }),
  makeStrategy('liquidity-sweep-bos', 'Liquidity Sweep + BOS', 'Multi-factor / Confluence', 'institutional', 'A current candle must sweep a confirmed swing low/high and close through the latest confirmed opposing swing level.', 35, (candles) => {
    const current = candles.at(-1)!;
    const previous = candles.at(-2)!;
    const { highs, lows } = latestSwings(candles.slice(0, -1), 60);
    const lowSweep = bullishSweep(candles, 60);
    const highSweep = bearishSweep(candles, 60);
    if (lowSweep && highs.length && crossedAbove(previous.close, current.close, highs.at(-1)!.value)) return emit('Liquidity Sweep + BOS', 'buy', 'A swing-low liquidity sweep was followed by a close above confirmed swing structure.');
    if (highSweep && lows.length && crossedBelow(previous.close, current.close, lows.at(-1)!.value)) return emit('Liquidity Sweep + BOS', 'sell', 'A swing-high liquidity sweep was followed by a close below confirmed swing structure.');
    return [];
  }),
  makeStrategy('multi-timeframe-confluence', 'Multi-Timeframe Confluence', 'Multi-factor / Confluence', 'adaptive', 'Current, fully completed 4×, and fully completed 16× aggregated timeframe trends must all align by close and SMA20/SMA50.', 832, (candles, timeframe) => {
    const base = maDirection(candles, 20, 50);
    const fourX = maDirection(aggregateCompleted(candles, timeframe, 4), 20, 50);
    const sixteenX = maDirection(aggregateCompleted(candles, timeframe, 16), 20, 50);
    return base && base === fourX && base === sixteenX ? emit('Multi-Timeframe Confluence', base, 'Current, completed 4×, and completed 16× timeframe trends align.') : [];
  }, { defaultParameters: { fastPeriod: 20, slowPeriod: 50, aggregationFactor: 4 }, timeframes: AGGREGABLE_TIMEFRAMES }),
  makeStrategy('regime-adaptive', 'Regime-Adaptive Strategy', 'Multi-factor / Confluence', 'adaptive', 'When ADX(14) ≥25, follow +DI/−DI with close versus SMA20; otherwise fade RSI(14) only as it crosses back through 30/70.', 40, (candles) => {
    const i = candles.length - 1;
    const strength = adx(candles, 14);
    if (strength.adx[i] >= 25) {
      const average = sma(candles.map((candle) => candle.close), 20)[i];
      if (strength.plusDI[i] > strength.minusDI[i] && candles[i].close > average) return emit('Regime-Adaptive Strategy', 'buy', 'High-ADX regime: +DI and price/SMA20 confirm the uptrend.');
      if (strength.minusDI[i] > strength.plusDI[i] && candles[i].close < average) return emit('Regime-Adaptive Strategy', 'sell', 'High-ADX regime: −DI and price/SMA20 confirm the downtrend.');
      return [];
    }
    const values = rsi(candles.map((candle) => candle.close), 14);
    if (crossedAbove(values[i - 1], values[i], 30)) return emit('Regime-Adaptive Strategy', 'buy', 'Low-ADX regime: RSI crossed back above 30 from oversold territory.');
    if (crossedBelow(values[i - 1], values[i], 70)) return emit('Regime-Adaptive Strategy', 'sell', 'Low-ADX regime: RSI crossed back below 70 from overbought territory.');
    return [];
  }),
];
