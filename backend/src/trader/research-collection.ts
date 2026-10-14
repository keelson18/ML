import { createHash } from 'node:crypto';
import type { Candle, Timeframe } from '../../../src/lib/types';
import { candleSeconds } from './candle-math';
import type { ResearchSeriesSnapshot } from './research-run';

export interface StoredResearchCandle {
  timeframe: Timeframe;
  candle_time: number;
  candle: Candle;
  provider: string;
  source_data_version: string;
  source_fetched_at: string;
}

/** Rebuilds a deterministic replay input from immutable, per-candle database rows. */
export function stitchResearchCollection(input: {
  rows: StoredResearchCandle[];
  symbol: string;
  expectedTimeframes: Timeframe[];
}): ResearchSeriesSnapshot[] {
  const grouped = new Map<Timeframe, StoredResearchCandle[]>();
  for (const row of input.rows) {
    if (!input.expectedTimeframes.includes(row.timeframe)
      || !Number.isSafeInteger(row.candle_time)
      || row.candle.time !== row.candle_time
      || !row.provider || !row.source_data_version || !Number.isFinite(Date.parse(row.source_fetched_at))) {
      throw new Error('Stored research candle lineage is incomplete or malformed.');
    }
    const list = grouped.get(row.timeframe) ?? [];
    list.push(row);
    grouped.set(row.timeframe, list);
  }
  if (grouped.size !== input.expectedTimeframes.length) throw new Error('Stored research collection is missing a timeframe.');

  const providers = new Set(input.rows.map((row) => row.provider));
  if (providers.size !== 1) throw new Error('Stored research collection mixes provider lineages.');
  const provider = providers.values().next().value as string | undefined;
  if (!provider) throw new Error('Stored research collection has no provider lineage.');

  return [...input.expectedTimeframes].map((timeframe) => {
    const rows = grouped.get(timeframe)!.sort((left, right) => left.candle_time - right.candle_time);
    for (let index = 0; index < rows.length; index += 1) {
      const candle = rows[index]!.candle;
      if (![candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)
        || candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0 || candle.volume < 0
        || candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close)
        || candle.time % candleSeconds(timeframe, candle.time) !== 0
        || (index > 0 && candle.time !== rows[index - 1]!.candle_time + candleSeconds(timeframe, candle.time))) {
        throw new Error(`Stored research ${timeframe} candle series is invalid or unordered.`);
      }
    }
    const latestFetchedAt = Math.max(...rows.map((row) => Date.parse(row.source_fetched_at)));
    const lineage = rows.map(({ candle_time, candle, source_data_version }) => [candle_time, candle, source_data_version]);
    const dataVersion = createHash('sha256').update(JSON.stringify({ provider, symbol: input.symbol, timeframe, lineage })).digest('hex');
    return { timeframe, provider, dataVersion: `collection:${dataVersion}`, fetchedAt: latestFetchedAt,
      candles: rows.map((row) => row.candle) };
  });
}

export function researchCollectionProgress(input: {
  triggerCandles: Candle[];
  triggerTimeframe: Timeframe;
  registeredStartTime: number;
}): { testStartIndex: number; collectedDays: number; collectedBars: number } {
  const testStartIndex = input.triggerCandles.findIndex((candle) => candle.time >= input.registeredStartTime);
  if (testStartIndex < 0) return { testStartIndex, collectedDays: 0, collectedBars: 0 };
  const first = input.triggerCandles[testStartIndex]!;
  const last = input.triggerCandles.at(-1)!;
  const testEnd = last.time + candleSeconds(input.triggerTimeframe, last.time);
  return {
    testStartIndex,
    collectedDays: Math.max(0, (testEnd - first.time) / 86_400),
    collectedBars: input.triggerCandles.length - testStartIndex,
  };
}
