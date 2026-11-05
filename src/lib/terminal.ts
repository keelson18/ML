import type { Candle, Timeframe } from './types';
import type { DataProvider } from './providers/types';

export const TERMINAL_TIMEFRAMES: { timeframe: Timeframe; label: string }[] = [
  { timeframe: '1m', label: '1m' }, { timeframe: '3m', label: '3m' }, { timeframe: '5m', label: '5m' },
  { timeframe: '15m', label: '15m' }, { timeframe: '30m', label: '30m' }, { timeframe: '1h', label: '1H' },
  { timeframe: '4h', label: '4H' }, { timeframe: '1d', label: '1D' }, { timeframe: '1w', label: '1W' }, { timeframe: '1M', label: '1M' },
];

export const MULTI_TIMEFRAME_ANALYSIS_PANELS: { timeframe: Timeframe; label: string; role: string; limit: number }[] = [
  { timeframe: '1d', label: '1D', role: 'BIAS', limit: 180 },
  { timeframe: '4h', label: '4H', role: 'STRUCTURE', limit: 240 },
  { timeframe: '15m', label: '15M', role: 'EXECUTION', limit: 500 },
  { timeframe: '5m', label: '5M', role: 'CONFIRMATION', limit: 500 },
];

export interface MultiTimeframeSeriesResult {
  candles: Candle[];
  error?: string;
}

export async function fetchMultiTimeframeAnalysis(
  dataProvider: Pick<DataProvider, 'fetchKlines'>,
  symbol: string,
  panels: typeof MULTI_TIMEFRAME_ANALYSIS_PANELS = MULTI_TIMEFRAME_ANALYSIS_PANELS,
): Promise<Partial<Record<Timeframe, MultiTimeframeSeriesResult>>> {
  const entries = await Promise.all(panels.map(async (panel) => {
    try {
      return [panel.timeframe, { candles: await dataProvider.fetchKlines(symbol, panel.timeframe, panel.limit) }] as const;
    } catch (error) {
      return [panel.timeframe, { candles: [], error: error instanceof Error ? error.message : String(error) }] as const;
    }
  }));
  return Object.fromEntries(entries);
}
