import type { Candle, Overlay } from './types';
import { findSwings } from './indicators';

// === Smart Money Concepts (SMC) Engine ===
// Institutional-grade market analysis: Order Blocks, FVGs, Liquidity, Premium/Discount Zones

// ---- Types ----

export interface OrderBlock {
  type: 'bullish' | 'bearish';
  startIndex: number;
  endIndex: number;
  high: number;
  low: number;
  time: number;
  strength: number; // 0-1 based on touches/breaks
  isBreaker: boolean; // failed block → flipped polarity
  isMitigated: boolean; // tested and held
}

export interface FVG {
  type: 'bullish' | 'bearish';
  index: number;
  time: number;
  top: number;   // upper inefficiency boundary
  bottom: number; // lower inefficiency boundary
  gap: number;   // gap size in price
  filled: boolean;
}

export interface LiquidityZone {
  type: 'above_highs' | 'below_lows';
  time: number;
  price: number;
  strength: number;
  swept: boolean;
}

export interface MarketZone {
  type: 'premium' | 'discount';
  high: number;
  low: number;
  mid: number; // fair value
}

// ---- Order Block Detection ----
// An order block is the last bullish/bearish candle before a strong move

export function detectOrderBlocks(candles: Candle[]): OrderBlock[] {
  const blocks: OrderBlock[] = [];
  if (candles.length < 10) return blocks;

  for (let i = 3; i < candles.length - 2; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];
    const next2 = candles[i + 2];

    // Bullish OB: bearish candle followed by 2+ bullish candles with strong momentum
    if (curr.close < curr.open &&  // bearish candle
        next.close > next.open &&  // first bullish
        next2.close > next2.open && // second bullish
        (next2.close - next.close) / next.close > 0.005) { // strong move
      blocks.push({
        type: 'bullish',
        startIndex: i,
        endIndex: i,
        high: curr.high,
        low: curr.low,
        time: curr.time,
        strength: 0.6,
        isBreaker: false,
        isMitigated: false,
      });
    }

    // Bearish OB: bullish candle followed by 2+ bearish candles with strong momentum
    if (curr.close > curr.open &&  // bullish candle
        next.close < next.open &&  // first bearish
        next2.close < next2.open && // second bearish
        (next.close - next2.close) / next.close > 0.005) { // strong move
      blocks.push({
        type: 'bearish',
        startIndex: i,
        endIndex: i,
        high: curr.high,
        low: curr.low,
        time: curr.time,
        strength: 0.6,
        isBreaker: false,
        isMitigated: false,
      });
    }
  }

  return blocks;
}

// ---- Fair Value Gap (FVG) Detection ----
// FVG: price inefficiency between 3 consecutive candles

export function detectFVGs(candles: Candle[]): FVG[] {
  const fvgs: FVG[] = [];
  if (candles.length < 3) return fvgs;

  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];

    const gapSize = Math.abs(curr.close - curr.open);

    // Bullish FVG: gap between prev high and next low (gap up)
    if (next.low > prev.high && gapSize > 0) {
      const gap = next.low - prev.high;
      if (gap / prev.high > 0.001) { // at least 0.1% gap
        fvgs.push({
          type: 'bullish',
          index: i,
          time: curr.time,
          top: next.low,
          bottom: prev.high,
          gap,
          filled: false,
        });
      }
    }

    // Bearish FVG: gap between prev low and next high (gap down)
    if (next.high < prev.low && gapSize > 0) {
      const gap = prev.low - next.high;
      if (gap / prev.low > 0.001) {
        fvgs.push({
          type: 'bearish',
          index: i,
          time: curr.time,
          top: prev.low,
          bottom: next.high,
          gap,
          filled: false,
        });
      }
    }
  }

  return fvgs;
}

// ---- Liquidity Detection ----
// Liquidity pools above swing highs (stops) and below swing lows

export function detectLiquidityZones(candles: Candle[], lookback = 30): LiquidityZone[] {
  const zones: LiquidityZone[] = [];
  const slice = candles.slice(-lookback);
  const { highs, lows } = findSwings(slice, 2, 2);

  // Liquidity above swing highs
  for (const h of highs) {
    if (h.value > 0) {
      zones.push({
        type: 'above_highs',
        time: h.time,
        price: h.value,
        strength: 0.5,
        swept: false,
      });
    }
  }

  // Liquidity below swing lows
  for (const l of lows) {
    if (l.value > 0) {
      zones.push({
        type: 'below_lows',
        time: l.time,
        price: l.value,
        strength: 0.5,
        swept: false,
      });
    }
  }

  // Check if any zones have been swept (price moved beyond and reversed)
  const last = candles[candles.length - 1];
  for (const zone of zones) {
    if (zone.type === 'above_highs' && last.high > zone.price) {
      zone.swept = true;
    }
    if (zone.type === 'below_lows' && last.low < zone.price) {
      zone.swept = true;
    }
  }

  return zones;
}

// ---- Premium / Discount Zones ----
// Based on a swing high to low range

export function calculatePremiumDiscountZones(candles: Candle[]): MarketZone | null {
  const { highs, lows } = findSwings(candles, 5, 5);
  if (highs.length === 0 || lows.length === 0) return null;

  const rangeHigh = Math.max(...highs.map((h) => h.value));
  const rangeLow = Math.min(...lows.map((l) => l.value));
  const mid = (rangeHigh + rangeLow) / 2;

  return {
    type: 'premium', // default, caller should interpret
    high: rangeHigh,
    low: rangeLow,
    mid,
  };
}

// ---- Detect Liquidity Sweeps ----
// Price spikes to grab liquidity then reverses

export function detectLiquiditySweeps(candles: Candle[]): LiquidityZone[] {
  const zones = detectLiquidityZones(candles, 50);
  const sweepZones: LiquidityZone[] = [];

  for (const zone of zones) {
    if (zone.swept) {
      // Check if price reversed after sweeping
      const last5 = candles.slice(-5);
      if (last5.length >= 3) {
        const afterSweep = last5.slice(-3);
        if (zone.type === 'above_highs') {
          // Swept high and closed lower → sweep
          if (afterSweep[afterSweep.length - 1].close < afterSweep[0].close) {
            sweepZones.push({ ...zone, strength: 0.7 });
          }
        } else {
          // Swept low and closed higher → sweep
          if (afterSweep[afterSweep.length - 1].close > afterSweep[0].close) {
            sweepZones.push({ ...zone, strength: 0.7 });
          }
        }
      }
    }
  }

  return sweepZones;
}

// ---- Generate overlay visuals for SMC concepts ----

export function orderBlockOverlays(blocks: OrderBlock[]): Overlay[] {
  return blocks.slice(-5).map((b) => ({
    type: 'zone' as const,
    id: `ob-${b.time}`,
    from: b.low,
    to: b.high,
    color: b.type === 'bullish' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
    label: b.type === 'bullish' ? 'Bullish OB' : 'Bearish OB',
  }));
}

export function fvgOverlays(fvgs: FVG[]): Overlay[] {
  return fvgs.slice(-3).map((f) => ({
    type: 'zone' as const,
    id: `fvg-${f.time}`,
    from: f.bottom,
    to: f.top,
    color: f.type === 'bullish' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
    label: f.filled ? 'FVG (filled)' : 'FVG',
  }));
}

export function liquidityOverlays(zones: LiquidityZone[]): Overlay[] {
  return zones.filter((z) => !z.swept).slice(-10).map((z) => ({
    type: 'hline' as const,
    id: `liq-${z.time}`,
    price: z.price,
    color: z.type === 'above_highs' ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)',
    label: z.type === 'above_highs' ? 'Liq (H)' : 'Liq (L)',
  }));
}

