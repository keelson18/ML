import type { Timeframe } from './types';

export const MULTI_TIMEFRAME_PANELS: { timeframe: Timeframe; label: string; role: string; limit: number }[] = [
  { timeframe: '1d', label: '1D', role: 'BIAS', limit: 180 },
  { timeframe: '4h', label: '4H', role: 'STRUCTURE', limit: 240 },
  { timeframe: '15m', label: '15M', role: 'EXECUTION', limit: 500 },
  { timeframe: '5m', label: '5M', role: 'CONFIRMATION', limit: 500 },
];
