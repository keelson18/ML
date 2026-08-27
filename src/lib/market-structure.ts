import type { Candle } from './types';
import { findSwings } from './indicators';

// === Market Structure Engine ===
// Detects: HH/HL, LH/LL, Break of Structure (BOS), Change of Character (CHoCH)
// Trend states: Bullish, Bearish, Ranging, Consolidating

export type StructurePoint = {
  index: number;
  time: number;
  value: number;
  type: 'high' | 'low';
};

export type StructureState = 'bullish' | 'bearish' | 'ranging' | 'consolidating';

export type StructureEvent = {
  type: 'HH' | 'HL' | 'LH' | 'LL' | 'BOS' | 'CHoCH' | 'EQH' | 'EQL';
  index: number;
  time: number;
  value: number;
  strength: number; // 0-1
  description: string;
};

export interface MarketStructure {
  state: StructureState;
  events: StructureEvent[];
  highs: StructurePoint[];
  lows: StructurePoint[];
  lastBreakout: StructureEvent | null;
  trendStrength: number; // 0-1
}

// Detect market structure from swing points
export function analyzeMarketStructure(candles: Candle[], lookback = 50): MarketStructure {
  if (candles.length < lookback) {
    return { state: 'ranging', events: [], highs: [], lows: [], lastBreakout: null, trendStrength: 0 };
  }

  const slice = candles.slice(-lookback);
  const { highs: rawHighs, lows: rawLows } = findSwings(slice, 3, 3);

  const highs: StructurePoint[] = rawHighs.map((h) => ({ ...h, type: 'high' }));
  const lows: StructurePoint[] = rawLows.map((l) => ({ ...l, type: 'low' }));

  const events: StructureEvent[] = [];

  // Compute average swing move size for relative strength scaling (avoids saturation)
  const avgSwingMove = (() => {
    const moves: number[] = [];
    for (let i = 1; i < highs.length; i++)
      moves.push(Math.abs(highs[i].value - highs[i-1].value) / highs[i-1].value);
    for (let i = 1; i < lows.length; i++)
      moves.push(Math.abs(lows[i].value - lows[i-1].value) / lows[i-1].value);
    return moves.length > 0 ? moves.reduce((a, b) => a + b, 0) / moves.length * 100 : 0.5;
  })();
  const refMove = Math.max(avgSwingMove, 0.1); // floor to avoid div-by-zero

  // Analyze swing high sequence
  for (let i = 1; i < highs.length; i++) {
    const prev = highs[i - 1];
    const curr = highs[i];

    if (curr.value > prev.value) {
      // Higher High (HH) — strength relative to recent average swing move
      events.push({
        type: 'HH',
        index: curr.index,
        time: curr.time,
        value: curr.value,
        strength: Math.min(1, ((curr.value - prev.value) / prev.value * 100) / refMove),
        description: `Higher High: ${curr.value.toFixed(2)} > ${prev.value.toFixed(2)}`,
      });
    } else if (curr.value < prev.value) {
      // Lower High (LH)
      events.push({
        type: 'LH',
        index: curr.index,
        time: curr.time,
        value: curr.value,
        strength: Math.min(1, ((prev.value - curr.value) / prev.value * 100) / refMove),
        description: `Lower High: ${curr.value.toFixed(2)} < ${prev.value.toFixed(2)}`,
      });
    }

    // Equal Highs (EQH)
    if (Math.abs(curr.value - prev.value) / prev.value < 0.003) {
      events.push({
        type: 'EQH',
        index: curr.index,
        time: curr.time,
        value: curr.value,
        strength: 0.5,
        description: 'Equal Highs — liquidity buildup',
      });
    }
  }

  // Analyze swing low sequence
  for (let i = 1; i < lows.length; i++) {
    const prev = lows[i - 1];
    const curr = lows[i];

    if (curr.value > prev.value) {
      // Higher Low (HL) — strength relative to recent average swing move
      events.push({
        type: 'HL',
        index: curr.index,
        time: curr.time,
        value: curr.value,
        strength: Math.min(1, ((curr.value - prev.value) / prev.value * 100) / refMove),
        description: `Higher Low: ${curr.value.toFixed(2)} > ${prev.value.toFixed(2)}`,
      });
    } else if (curr.value < prev.value) {
      // Lower Low (LL)
      events.push({
        type: 'LL',
        index: curr.index,
        time: curr.time,
        value: curr.value,
        strength: Math.min(1, ((prev.value - curr.value) / prev.value * 100) / refMove),
        description: `Lower Low: ${curr.value.toFixed(2)} < ${prev.value.toFixed(2)}`,
      });
    }

    // Equal Lows (EQL)
    if (Math.abs(curr.value - prev.value) / prev.value < 0.003) {
      events.push({
        type: 'EQL',
        index: curr.index,
        time: curr.time,
        value: curr.value,
        strength: 0.5,
        description: 'Equal Lows — liquidity buildup',
      });
    }
  }

  // Determine trend state based on last few swing relationships
  const lastHighs = highs.slice(-3);
  const lastLows = lows.slice(-3);
  let state: StructureState = 'ranging';
  let trendStrength = 0;

  // Count directional events
  let bullishEvents = 0;
  let bearishEvents = 0;

  for (const e of events) {
    if (e.type === 'HH' || e.type === 'HL') bullishEvents++;
    if (e.type === 'LH' || e.type === 'LL') bearishEvents++;
  }

  const total = bullishEvents + bearishEvents;
  if (total > 0) {
    const ratio = bullishEvents / total;
    if (ratio > 0.65) {
      state = 'bullish';
      trendStrength = ratio;
    } else if (ratio < 0.35) {
      state = 'bearish';
      trendStrength = 1 - ratio;
    } else {
      state = 'ranging';
      trendStrength = 0;
    }
  }

  // Check for consolidation: tight ranges
  if (highs.length >= 2 && lows.length >= 2) {
    const rangeHigh = Math.max(...highs.slice(-2).map((h) => h.value));
    const rangeLow = Math.min(...lows.slice(-2).map((l) => l.value));
    const rangePct = (rangeHigh - rangeLow) / rangeHigh;
    if (rangePct < 0.03) {
      state = 'consolidating';
      trendStrength = 0; // BUGFIX: reset strength when consolidating — prior bullish/bearish value is stale
    }
  }

  // Detect Break of Structure (BOS)
  let lastBreakout: StructureEvent | null = null;
  if (state === 'bullish' && lastHighs.length >= 2) {
    const prevHigh = lastHighs[lastHighs.length - 2];
    const currHigh = lastHighs[lastHighs.length - 1];
    if (currHigh.value > prevHigh.value) {
      lastBreakout = {
        type: 'BOS',
        index: currHigh.index,
        time: currHigh.time,
        value: currHigh.value,
        strength: trendStrength,
        description: 'Bullish BOS — price broke above previous high',
      };
      events.push(lastBreakout);
    }
  } else if (state === 'bearish' && lastLows.length >= 2) {
    const prevLow = lastLows[lastLows.length - 2];
    const currLow = lastLows[lastLows.length - 1];
    if (currLow.value < prevLow.value) {
      lastBreakout = {
        type: 'BOS',
        index: currLow.index,
        time: currLow.time,
        value: currLow.value,
        strength: trendStrength,
        description: 'Bearish BOS — price broke below previous low',
      };
      events.push(lastBreakout);
    }
  }

  // Detect Change of Character (CHoCH) — trend reversal signal
  if (events.length >= 4) {
    const recent = events.slice(-4);
    const bullishCount = recent.filter((e) => e.type === 'HH' || e.type === 'HL').length;
    const bearishCount = recent.filter((e) => e.type === 'LH' || e.type === 'LL').length;

    // CHoCH: shift from mostly bullish to mostly bearish events or vice versa
    if (bearishCount >= 3 && bullishCount <= 1 && state === 'bearish') {
      const lastEvent = recent[recent.length - 1];
      events.push({
        type: 'CHoCH',
        index: lastEvent.index,
        time: lastEvent.time,
        value: lastEvent.value,
        strength: 0.7,
        description: 'CHoCH detected — possible trend reversal to bearish',
      });
    } else if (bullishCount >= 3 && bearishCount <= 1 && state === 'bullish') {
      const lastEvent = recent[recent.length - 1];
      events.push({
        type: 'CHoCH',
        index: lastEvent.index,
        time: lastEvent.time,
        value: lastEvent.value,
        strength: 0.7,
        description: 'CHoCH detected — possible trend reversal to bullish',
      });
    }
  }

  return {
    state,
    events: events.sort((a, b) => a.index - b.index),
    highs,
    lows,
    lastBreakout,
    trendStrength,
  };
}

// Get a readable summary of the current market structure
export function getStructureSummary(structure: MarketStructure): string {
  const parts: string[] = [
    `Market is in a **${structure.state.toUpperCase()}** phase`,
  ];

  if (structure.trendStrength > 0.5) {
    parts.push(`with ${(structure.trendStrength * 100).toFixed(0)}% trend strength`);
  }

  const recentEvents = structure.events.slice(-3);
  if (recentEvents.length > 0) {
    parts.push('\nRecent events:');
    for (const e of recentEvents) {
      parts.push(`- ${e.description}`);
    }
  }

  return parts.join(' ');
}

