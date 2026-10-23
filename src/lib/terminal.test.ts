import { describe, expect, it, vi } from 'vitest';
import { TIMEFRAMES, type Candle } from './types';
import { fetchMultiTimeframeAnalysis, MULTI_TIMEFRAME_ANALYSIS_PANELS } from './terminal';

const candle: Candle = { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 };

describe('multi-timeframe analysis data', () => {
  it('keeps its four analysis panels separate from the full chart timeframe contract', () => {
    expect(TIMEFRAMES.map(({ value }) => value)).toEqual(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M']);
    expect(MULTI_TIMEFRAME_ANALYSIS_PANELS.map(({ timeframe }) => timeframe)).toEqual(['1d', '4h', '15m', '5m']);
  });

  it('returns candle data for successful timeframe requests', async () => {
    const fetchKlines = vi.fn().mockResolvedValue([candle]);

    const results = await fetchMultiTimeframeAnalysis({ fetchKlines }, 'BTCUSD');

    expect(results['1d']).toEqual({ candles: [candle] });
    expect(fetchKlines).toHaveBeenCalledWith('BTCUSD', '1d', 180);
    expect(fetchKlines).toHaveBeenCalledTimes(4);
  });

  it('keeps an empty response distinct from a failed request', async () => {
    const fetchKlines = vi.fn().mockResolvedValue([]);

    const results = await fetchMultiTimeframeAnalysis({ fetchKlines }, 'BTCUSD');

    expect(results['1d']).toEqual({ candles: [] });
    expect(results['1d']?.error).toBeUndefined();
  });

  it('retains each failed timeframe error without discarding successful data', async () => {
    const providerError = new Error('Provider rate limit exceeded');
    const fetchKlines = vi.fn(async (_symbol: string, timeframe: string) => {
      if (timeframe === '4h') throw providerError;
      return [candle];
    });

    const results = await fetchMultiTimeframeAnalysis({ fetchKlines }, 'BTCUSD');

    expect(results['4h']).toEqual({ candles: [], error: 'Provider rate limit exceeded' });
    expect(results['1d']).toEqual({ candles: [candle] });
    expect(results['15m']).toEqual({ candles: [candle] });
  });
});
