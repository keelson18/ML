import type { Candle, Signal, Timeframe } from '../types';
import { sma } from '../indicators';
import { adx as calcAdx } from '../indicators/adx';
import { analyzeMarketStructure } from '../market-structure';

const MIN_CANDLES = 100;

// Trend Following Strategy: strong ADX + trend structure alignment
export const trendFollowingStrategy = {
  name: 'Trend Following',
  type: 'trend' as const,
  timeframes: ['1h', '4h', '1d', '1w'] as Timeframe[],
  minCandles: MIN_CANDLES,

  detect(candles: Candle[], _timeframe: Timeframe): Signal[] {
    if (candles.length < MIN_CANDLES) return [];
    
    const closes = candles.map((c) => c.close);
    const { adx: adxVals, plusDI, minusDI } = calcAdx(candles, 14);
    const structure = analyzeMarketStructure(candles.slice(-100));
    const i = closes.length - 1;

    // Need strong trend
    if (isNaN(adxVals[i]) || adxVals[i] < 25) return [];

    const signals: Signal[] = [];

    // Bullish: ADX > 25, +DI > -DI, bullish structure
    if (plusDI[i] > minusDI[i] && structure.state === 'bullish') {
      const sma20 = sma(closes, 20);
      const sma50 = sma(closes, 50);
      if (sma20[i] > sma50[i]) {
        signals.push({
          strategy: 'Trend Following',
          side: 'buy',
          confidence: Math.min(0.7, 0.4 + adxVals[i] / 200),
          reason: `Strong uptrend (ADX: ${adxVals[i].toFixed(1)})`,
        });
      }
    }

    // Bearish: ADX > 25, -DI > +DI, bearish structure
    if (minusDI[i] > plusDI[i] && structure.state === 'bearish') {
      const sma20 = sma(closes, 20);
      const sma50 = sma(closes, 50);
      if (sma20[i] < sma50[i]) {
        signals.push({
          strategy: 'Trend Following',
          side: 'sell',
          confidence: Math.min(0.7, 0.4 + adxVals[i] / 200),
          reason: `Strong downtrend (ADX: ${adxVals[i].toFixed(1)})`,
        });
      }
    }

    return signals;
  },
};

