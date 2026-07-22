import type { Candle, Overlay } from './types';
import { findSwings } from './indicators';

// === Fibonacci Engine ===
// Full retracement + extension levels with confluence analysis

export const RETRACEMENT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
export const EXTENSION_LEVELS = [1.272, 1.618, 2.618, 3.618] as const;

export interface FibLevel {
  level: number;         // 0.0 to 1.0 for retracement, >1.0 for extension
  price: number;
  label: string;
  isGolden: boolean;
  type: 'retracement' | 'extension';
}

export interface FibAnalysis {
  high: number;
  low: number;
  swingUp: boolean;   // true = uptrend swing, false = downtrend swing
  retracements: FibLevel[];
  extensions: FibLevel[];
  goldenPocket: FibLevel | null;   // 0.618 level
  goldenExtension: FibLevel | null; // 1.618 level
  confluence: ConfluenceScore;
}

export interface ConfluenceScore {
  totalScore: number;    // 0-100
  orderBlockOverlap: boolean;
  fvgOverlap: boolean;
  smcZoneOverlap: boolean;
  structureAlignment: boolean;
  contributingFactors: string[];
}

// Compute Fibonacci levels from the most significant swing
export function computeFibonacci(candles: Candle[]): FibAnalysis | null {
  if (candles.length < 40) return null;

  const { highs, lows } = findSwings(candles, 3, 3);
  if (highs.length === 0 || lows.length === 0) return null;

  const lastHigh = highs[highs.length - 1];
  const lastLow = lows[lows.length - 1];

  // Determine which swing is more recent to set direction
  const swingUp = lastHigh.index > lastLow.index;
  const high = swingUp ? lastHigh.value : lastLow.value;
  const low = swingUp ? lastLow.value : lastHigh.value;
  const diff = high - low;

  if (diff <= 0) return null;

  // Compute retracement levels
  const retracements: FibLevel[] = RETRACEMENT_LEVELS.map((level) => {
    const price = swingUp ? high - diff * level : low + diff * level;
    return {
      level,
      price,
      label: `${(level * 100).toFixed(1)}%`,
      isGolden: level === 0.618,
      type: 'retracement',
    };
  });

  // Compute extension levels
  const extensions: FibLevel[] = EXTENSION_LEVELS.map((level) => {
    const price = swingUp ? high + diff * (level - 1) : low - diff * (level - 1);
    return {
      level,
      price,
      label: `${(level * 100).toFixed(1)}%`,
      isGolden: level === 1.618,
      type: 'extension',
    };
  });

  const goldenPocket = retracements.find((f) => f.level === 0.618) ?? null;
  const goldenExtension = extensions.find((f) => f.level === 1.618) ?? null;

  return {
    high,
    low,
    swingUp,
    retracements,
    extensions,
    goldenPocket,
    goldenExtension,
    confluence: { totalScore: 0, orderBlockOverlap: false, fvgOverlap: false, smcZoneOverlap: false, structureAlignment: false, contributingFactors: [] },
  };
}

// Confluence analysis between Fib levels and other signals
export function analyzeConfluence(
  fib: FibAnalysis,
  candles: Candle[],
  orderBlocks?: { high: number; low: number }[],
  fvgs?: { top: number; bottom: number }[],
): ConfluenceScore {
  const factors: string[] = [];
  let score = 0;

  // Check all retracement levels for proximity to price
  const lastClose = candles[candles.length - 1].close;
  for (const level of fib.retracements) {
    const proximity = Math.abs(lastClose - level.price) / level.price;
    if (proximity < 0.005) {
      factors.push(`Price at ${level.label} Fib level`);
      score += level.isGolden ? 20 : 10;
    }
  }

  // Order block overlap
  if (orderBlocks) {
    for (const ob of orderBlocks) {
      for (const level of fib.retracements) {
        if (level.price >= ob.low && level.price <= ob.high) {
          factors.push(`Fib ${level.label} aligns with Order Block`);
          score += 15;
          break;
        }
      }
    }
  }

  // FVG overlap
  if (fvgs) {
    for (const fvg of fvgs) {
      for (const level of fib.retracements) {
        if (level.price >= fvg.bottom && level.price <= fvg.top) {
          factors.push(`Fib ${level.label} aligns with FVG`);
          score += 15;
          break;
        }
      }
    }
  }

  // Golden pocket bonus
  if (fib.goldenPocket) {
    const prox = Math.abs(lastClose - fib.goldenPocket.price) / fib.goldenPocket.price;
    if (prox < 0.01) {
      factors.push('At 61.8% golden pocket — high probability zone');
      score += 25;
    }
  }

  return {
    totalScore: Math.min(100, score),
    orderBlockOverlap: factors.some((f) => f.includes('Order Block')),
    fvgOverlap: factors.some((f) => f.includes('FVG')),
    smcZoneOverlap: false,
    structureAlignment: false,
    contributingFactors: factors,
  };
}

// Get overlays for chart rendering
export function fibOverlays(fib: FibAnalysis): Overlay[] {
  const overlays: Overlay[] = [];

  // Retracement levels
  for (const level of fib.retracements) {
    overlays.push({
      type: 'hline' as const,
      id: `fib-${level.label}`,
      price: level.price,
      color: level.isGolden ? '#10a37f' : '#9ca3af',
      label: level.label,
    });
  }

  // Extension levels (only golden for clarity)
  for (const level of fib.extensions) {
    if (level.isGolden) {
      overlays.push({
        type: 'hline' as const,
        id: `fib-ext-${level.label}`,
        price: level.price,
        color: '#f59e0b',
        label: `Ext ${level.label}`,
      });
    }
  }

  return overlays;
}

