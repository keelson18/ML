import type { Candle } from '../types';
import { sma, ema, rsi, macd, bollinger, atr } from '../indicators';
import { wma } from '../indicators/wma';
import { hma } from '../indicators/hma';
import { stochastic } from '../indicators/stochastic';
import { stochasticRsi } from '../indicators/stochastic-rsi';
import { adx } from '../indicators/adx';
import { cci } from '../indicators/cci';
import { obv } from '../indicators/obv';
import { mfi } from '../indicators/mfi';
import { vwap } from '../indicators/vwap';
import { analyzeMarketStructure } from '../market-structure';

// Feature Engineering Pipeline
// Computes hundreds of features from price, indicators, market structure, and volume

export interface FeatureVector {
  timestamp: number;
  price: number;
  features: Record<string, number>;
}

export function computeFeatures(candles: Candle[]): FeatureVector {
  if (candles.length === 0) {
    return { timestamp: 0, price: 0, features: {} };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);
  const last = candles[candles.length - 1];
  const i = closes.length - 1;
  const features: Record<string, number> = {};

  // ---- Raw Price Features ----
  features['price_close'] = last.close;
  features['price_open'] = last.open;
  features['price_high'] = last.high;
  features['price_low'] = last.low;
  features['price_range'] = last.high - last.low;
  features['price_body'] = Math.abs(last.close - last.open);
  features['price_upper_wick'] = last.high - Math.max(last.open, last.close);
  features['price_lower_wick'] = Math.min(last.open, last.close) - last.low;

  // ---- Returns (various periods) ----
  for (const period of [1, 3, 5, 10, 20, 50]) {
    if (i >= period) {
      features[`return_${period}`] = (closes[i] - closes[i - period]) / closes[i - period];
    }
  }

  // ---- Volatility ----
  for (const period of [5, 10, 20]) {
    if (i >= period) {
      const returns: number[] = [];
      for (let j = i - period + 1; j <= i; j++) {
        returns.push((closes[j] - closes[j - 1]) / closes[j - 1]);
      }
      const mean = returns.reduce((s, r) => s + r, 0) / period;
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / period;
      features[`volatility_${period}`] = Math.sqrt(variance);
    }
  }

  // ---- Moving Averages ----
  for (const period of [10, 20, 50, 200]) {
    const smaVal = sma(closes, period);
    if (!isNaN(smaVal[i])) {
      features[`sma_${period}`] = smaVal[i];
      features[`sma_${period}_pct`] = (closes[i] - smaVal[i]) / smaVal[i];
    }
  }

  // EMA
  for (const period of [12, 26, 50]) {
    const emaVal = ema(closes, period);
    if (!isNaN(emaVal[i])) {
      features[`ema_${period}`] = emaVal[i];
      features[`ema_${period}_pct`] = (closes[i] - emaVal[i]) / emaVal[i];
    }
  }

  // WMA
  const wma20 = wma(closes, 20);
  if (!isNaN(wma20[i])) features['wma_20'] = wma20[i];

  // HMA
  const hma20 = hma(closes, 20);
  if (!isNaN(hma20[i])) features['hma_20'] = hma20[i];

  // VWAP
  const vwapVal = vwap(candles);
  if (!isNaN(vwapVal[i])) features['vwap'] = vwapVal[i];

  // ---- RSI ----
  const rsiVal = rsi(closes, 14);
  if (!isNaN(rsiVal[i])) {
    features['rsi_14'] = rsiVal[i];
    features['rsi_overbought'] = rsiVal[i] > 70 ? 1 : 0;
    features['rsi_oversold'] = rsiVal[i] < 30 ? 1 : 0;
  }

  // ---- MACD ----
  const { macd: macdLine, signal, hist } = macd(closes);
  if (!isNaN(macdLine[i])) {
    features['macd'] = macdLine[i];
    features['macd_signal'] = signal[i];
    features['macd_hist'] = hist[i];
    features['macd_cross'] = (hist[i] > 0 && hist[i - 1] <= 0) ? 1 : (hist[i] < 0 && hist[i - 1] >= 0) ? -1 : 0;
  }

  // ---- Bollinger Bands ----
  const bb = bollinger(closes, 20, 2);
  if (!isNaN(bb.upper[i])) {
    features['bb_upper'] = bb.upper[i];
    features['bb_middle'] = bb.middle[i];
    features['bb_lower'] = bb.lower[i];
    features['bb_width'] = bb.width[i];
    features['bb_pct'] = bb.upper[i] !== bb.lower[i] 
      ? (closes[i] - bb.lower[i]) / (bb.upper[i] - bb.lower[i]) 
      : 0.5;
  }

  // ---- ATR ----
  const atrVal = atr(candles, 14);
  if (!isNaN(atrVal[i])) features['atr_14'] = atrVal[i];

  // ---- Stochastic ----
  const { k: stochK, d: stochD } = stochastic(candles, 14, 3, 3);
  if (!isNaN(stochK[i])) {
    features['stoch_k'] = stochK[i];
    features['stoch_d'] = stochD[i];
  }

  // ---- Stochastic RSI ----
  const srsi = stochasticRsi(closes, 14, 3, 3);
  if (!isNaN(srsi.k[i])) {
    features['srsi_k'] = srsi.k[i];
    features['srsi_d'] = srsi.d[i];
  }

  // ---- ADX ----
  const { adx: adxVal, plusDI, minusDI } = adx(candles, 14);
  if (!isNaN(adxVal[i])) features['adx'] = adxVal[i];
  if (!isNaN(plusDI[i]) && !isNaN(minusDI[i])) {
    features['plus_di'] = plusDI[i];
    features['minus_di'] = minusDI[i];
    features['adx_trend'] = plusDI[i] - minusDI[i];
  }

  // ---- CCI ----
  const cciVal = cci(candles, 20);
  if (!isNaN(cciVal[i])) features['cci'] = cciVal[i];

  // ---- Volume Indicators ----
  const obvVal = obv(candles);
  if (!isNaN(obvVal[i])) features['obv'] = obvVal[i];

  const mfiVal = mfi(candles, 14);
  if (!isNaN(mfiVal[i])) features['mfi'] = mfiVal[i];

  // Volume ratio
  const avgVol = volumes.slice(-10).reduce((s, v) => s + v, 0) / 10;
  features['volume_ratio'] = volumes[i] / (avgVol || 1);
  features['volume_ma_ratio'] = volumes[i] / (volumes.slice(-50).reduce((s, v) => s + v, 0) / 50 || 1);

  // ---- Market Structure ----
  const structure = analyzeMarketStructure(candles);
  features['trend_strength'] = structure.trendStrength;
  features['trend_direction'] = structure.state === 'bullish' ? 1 : structure.state === 'bearish' ? -1 : 0;
  features['structure_events_count'] = structure.events.length;

  // Recent BOS/CHoCH
  const recentEvents = structure.events.slice(-3);
  features['has_bos'] = recentEvents.some((e) => e.type === 'BOS') ? 1 : 0;
  features['has_choch'] = recentEvents.some((e) => e.type === 'CHoCH') ? 1 : 0;

  // ---- Price Action Features ----
  // Consecutive candles direction
  let upCount = 0;
  let downCount = 0;
  for (let j = Math.max(0, i - 5); j <= i; j++) {
    if (closes[j] > opens(j, candles)) upCount++;
    else if (closes[j] < opens(j, candles)) downCount++;
  }
  features['consecutive_up'] = upCount;
  features['consecutive_down'] = downCount;

  // Gap detection
  if (i > 0) {
    features['gap_up'] = lows[i] > highs[i - 1] ? 1 : 0;
    features['gap_down'] = highs[i] < lows[i - 1] ? 1 : 0;
    features['gap_size'] = (lows[i] - highs[i - 1]) / (highs[i - 1] || 1);
  }

  return {
    timestamp: last.time,
    price: last.close,
    features,
  };
}

function opens(index: number, candles: Candle[]): number {
  return candles[index].open;
}

