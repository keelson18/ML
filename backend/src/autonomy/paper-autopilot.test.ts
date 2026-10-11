import { describe, expect, it } from 'vitest';
import { entryCandleIsFresh, replayCandlesAfter, replaySequentialCandles, uniqueSeriesRequests } from './paper-autopilot';
import { closePaperPosition, simulatePaperOrder, type PaperAccountState } from '../engines/paper-execution';

describe('paper autopilot scheduling helpers', () => {
  it('fetches a symbol/timeframe series once for multiple opted-in users', () => {
    expect(uniqueSeriesRequests([
      { symbol: 'BTCUSD', timeframe: '15m' },
      { symbol: 'BTCUSD', timeframe: '15m' },
      { symbol: 'ETHUSD', timeframe: '15m' },
    ])).toEqual([
      { symbol: 'BTCUSD', timeframe: '15m' },
      { symbol: 'ETHUSD', timeframe: '15m' },
    ]);
  });

  it('replays catch-up candles chronologically and within the configured bound', () => {
    const candles = [0, 900, 1800, 2700].map((time) => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
    expect(replayCandlesAfter(candles, 900, 2).map((candle) => candle.time)).toEqual([1800, 2700]);
  });

  it('manages catch-up candles chronologically so the first touched stop closes the position', async () => {
    const opened = simulatePaperOrder({ accountId: 'catch-up', cash: 10_000, positions: [], trades: [] }, {
      orderId: 'entry', positionId: 'position', decisionId: 'decision', assetId: 'BTCUSD', symbol: 'BTCUSD',
      decision: { decision: 'BUY' }, riskApproved: true, portfolioApproved: true, quantity: 1,
      requestedPrice: 100, feeRate: 0, slippageRate: 0, stopLoss: 95, takeProfit: 110, executionVersion: 'test',
    });
    if (!opened.accepted) throw new Error(opened.reason);
    const candles = [900, 1200].map((time) => ({ time, open: 100, high: 112, low: 94, close: 105, volume: 1 }));
    let account: PaperAccountState = opened.account;
    const count = await replaySequentialCandles(candles, undefined, 10, async (candle) => {
      if (!account.positions.some((position) => position.status === 'open')) return;
      const close = closePaperPosition(account, 'BTCUSD', candle.low <= 95 ? 95 : 110, 0, 'test', `close-${candle.time}`, new Date(candle.time * 1000).toISOString());
      if ('error' in close) throw new Error(close.error);
      account = close.account;
    });
    expect(count).toBe(2);
    expect(account.trades[0]?.exitPrice).toBe(95);
    expect(account.trades[0]?.closedAt).toBe(new Date(900_000).toISOString());
  });

  it('rejects entry triggers that exceed the configured candle-age limit', () => {
    const candle = { time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 };
    expect(entryCandleIsFresh(candle, '15m', 2_700_000)).toBe(true);
    expect(entryCandleIsFresh(candle, '15m', 2_701_000)).toBe(false);
  });
});
