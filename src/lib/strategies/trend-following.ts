import type { Candle, Signal, Timeframe } from '../types';
import { sma } from '../indicators';
import { adx as calcAdx } from '../indicators/adx';
import { analyzeMarketStructure } from '../market-structure';

const MIN_CANDLES = 100;

// Trend Following Strategy: strong ADX + trend structure alignment
export const trendFollowingStrategy = {
  id: 'trend-following',
  version: '1.1.0',
  name: 'Trend Following',
  type: 'trend' as const,
  description: 'Combines ADX, directional movement, moving averages, and structure.',
  timeframes: ['1h', '4h', '1d', '1w'] as Timeframe[],
  minCandles: MIN_CANDLES,
  defaultParameters: { adxPeriod: 14, minimumAdx: 25, fastPeriod: 20, slowPeriod: 50 },

  detect(candles: Candle[], _timeframe: Timeframe, parameters: Readonly<Record<string, number>> = { adxPeriod: 14, minimumAdx: 25, fastPeriod: 20, slowPeriod: 50 }): Signal[] {
    const adxPeriod = parameters.adxPeriod ?? 14;
    const minimumAdx = parameters.minimumAdx ?? 25;
    const fastPeriod = parameters.fastPeriod ?? 20;
    const slowPeriod = parameters.slowPeriod ?? 50;
    if (candles.length < Math.max(MIN_CANDLES, slowPeriod + 2)) return [];
    
    const closes = candles.map((c) => c.close);
    const { adx: adxVals, plusDI, minusDI } = calcAdx(candles, adxPeriod);
    const structure = analyzeMarketStructure(candles.slice(-100));
    const i = closes.length - 1;

    // Need strong trend
    if (isNaN(adxVals[i]) || adxVals[i] < minimumAdx) return [];

    const signals: Signal[] = [];

    // Bullish: ADX > 25, +DI > -DI, bullish structure
    if (plusDI[i] > minusDI[i] && structure.state === 'bullish') {
      const fast = sma(closes, fastPeriod);
      const slow = sma(closes, slowPeriod);
      if (fast[i] > slow[i]) {
        signals.push({
          strategy: 'Trend Following',
          strategyId: 'trend-following',
          strategyVersion: '1.0.0',
          side: 'buy',
          confidence: Math.min(0.7, 0.4 + adxVals[i] / 200),
          reason: `Strong uptrend (ADX: ${adxVals[i].toFixed(1)})`,
        });
      }
    }

    // Bearish: ADX > 25, -DI > +DI, bearish structure
    if (minusDI[i] > plusDI[i] && structure.state === 'bearish') {
      const fast = sma(closes, fastPeriod);
      const slow = sma(closes, slowPeriod);
      if (fast[i] < slow[i]) {
        signals.push({
          strategy: 'Trend Following',
          strategyId: 'trend-following',
          strategyVersion: '1.0.0',
          side: 'sell',
          confidence: Math.min(0.7, 0.4 + adxVals[i] / 200),
          reason: `Strong downtrend (ADX: ${adxVals[i].toFixed(1)})`,
        });
      }
    }

    return signals;
  },
};
