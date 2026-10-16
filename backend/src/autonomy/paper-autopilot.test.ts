import { describe, expect, it, vi } from 'vitest';
import { accountEntriesAllowed, entryCandleIsFresh, PaperAutopilotScheduler, prioritizeSeriesRequests, providerRequestSpacingMs, replayCandlesAfter, replaySequentialCandles, uniqueSeriesRequests, verifiedAutopilotSymbols } from './paper-autopilot';
import { hasFreshClosedCandleData } from '../trader/market-data-quality';
import { config } from '../config';

vi.mock('../db', () => ({
  getSupabaseClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { enabled: true, paused_reason: 'operator pause' }, error: null }) }) }) }),
  }),
}));
vi.mock('../services/marketAvailability', () => ({
  getMarketAvailability: () => [
    { symbol: 'BTCUSD', status: 'unverified', checkedAt: null },
    { symbol: 'ETHUSD', status: 'available', checkedAt: 1 },
  ],
}));
import { closePaperPosition, simulatePaperOrder, type PaperAccountState } from '../engines/paper-execution';
import { traderConfig } from '../trader/config';

describe('paper autopilot scheduling helpers', () => {
  it('keeps unverified markets out of planner and entry scheduling', () => {
    expect(verifiedAutopilotSymbols(['BTCUSD', 'ETHUSD', 'BTCUSD'])).toEqual(['ETHUSD']);
  });

  it('blocks on-demand scheduler cycles when the global autonomy switch is disabled', async () => {
    const wasEnabled = config.autonomousTradingEnabled;
    config.autonomousTradingEnabled = false;
    try {
      await expect(new PaperAutopilotScheduler().queueAccountRun('account-1'))
        .rejects.toThrow('AUTONOMOUS_TRADING is disabled; paper autopilot runs are blocked.');
    } finally {
      config.autonomousTradingEnabled = wasEnabled;
    }
  });

  it('does not queue a manual cycle for a paused account', async () => {
    const wasEnabled = config.autonomousTradingEnabled;
    config.autonomousTradingEnabled = true;
    try {
      await expect(new PaperAutopilotScheduler().queueAccountRun('account-1')).rejects.toThrow('Paper autopilot is paused: operator pause');
    } finally {
      config.autonomousTradingEnabled = wasEnabled;
    }
  });

  it('halves request spacing when the reserved quota doubles', () => {
    expect(providerRequestSpacingMs(5, 60_000, 2)).toBe(30_000);
    expect(providerRequestSpacingMs(10, 60_000, 4)).toBe(15_000);
  });
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

  it('prioritizes position management, then entry triggers, then planner history', () => {
    const requests = [
      { symbol: 'BTCUSD', timeframe: '1d' as const },
      { symbol: 'BTCUSD', timeframe: '15m' as const },
      { symbol: 'BTCUSD', timeframe: '5m' as const },
      { symbol: 'BTCUSD', timeframe: '4h' as const },
      { symbol: 'BTCUSD', timeframe: '1h' as const },
    ];
    expect(prioritizeSeriesRequests(requests, '5m', ['15m', '1h']).map(({ timeframe }) => timeframe))
      .toEqual(['5m', '15m', '1h', '1d', '4h']);
  });

  it('replays catch-up candles chronologically and within the configured bound', () => {
    const candles = [0, 900, 1800, 2700].map((time) => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
    expect(replayCandlesAfter(candles, 900, 2).map((candle) => candle.time)).toEqual([1800, 2700]);
  });

  it('resumes after a worker restart from the last durable candle checkpoint', async () => {
    const candles = [0, 900, 1800, 2700].map((time) => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
    const uninterrupted = { checkpoint: undefined as number | undefined, events: [] as number[] };
    const interrupted = { checkpoint: undefined as number | undefined, events: [] as number[] };

    const processCandles = (state: typeof uninterrupted, failAfter?: number) => replaySequentialCandles(
      candles,
      state.checkpoint,
      10,
      async (candle) => {
        // The production callback commits the mutation and checkpoint together
        // through record_paper_account_update before returning.
        state.events.push(candle.time);
        state.checkpoint = candle.time;
        if (failAfter !== undefined && state.events.length === failAfter) throw new Error('simulated worker termination');
      },
    );

    await processCandles(uninterrupted);
    await expect(processCandles(interrupted, 2)).rejects.toThrow('simulated worker termination');
    await processCandles(interrupted);

    expect(interrupted).toEqual(uninterrupted);
    expect(new Set(interrupted.events).size).toBe(candles.length);
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

  it('blocks entries while globally disabled, account-paused, or missing required data', () => {
    expect(accountEntriesAllowed({ autonomousEnabled: true, accountEnabled: true, pausedReason: null, dataFailure: undefined })).toBe(true);
    expect(accountEntriesAllowed({ autonomousEnabled: false, accountEnabled: true, pausedReason: null, dataFailure: undefined })).toBe(false);
    expect(accountEntriesAllowed({ autonomousEnabled: true, accountEnabled: false, pausedReason: null, dataFailure: undefined })).toBe(false);
    expect(accountEntriesAllowed({ autonomousEnabled: true, accountEnabled: true, pausedReason: 'operator pause', dataFailure: undefined })).toBe(false);
    expect(accountEntriesAllowed({ autonomousEnabled: true, accountEnabled: true, pausedReason: null, dataFailure: 'stale 15m data' })).toBe(false);
  });

  it('rejects entry triggers that exceed the configured candle-age limit', () => {
    const candle = { time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 };
    const maximumAge = traderConfig.MAX_ENTRY_AGE_BARS * 900_000;
    expect(entryCandleIsFresh(candle, '15m', 900_000 + maximumAge)).toBe(true);
    expect(entryCandleIsFresh(candle, '15m', 900_001 + maximumAge)).toBe(false);
  });

  it('accepts a recent closed series and rejects stale or missing closed candles', () => {
    const now = Date.now();
    const lastClosedTime = Math.floor(now / 3_600_000) * 3600 - 3600;
    const candle = (time: number) => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 });
    expect(hasFreshClosedCandleData([candle(lastClosedTime)], '1h', now, 3)).toBe(true);
    expect(hasFreshClosedCandleData([candle(lastClosedTime - 4 * 3600)], '1h', now, 3)).toBe(false);
    expect(hasFreshClosedCandleData([], '1h', now, 3)).toBe(false);
  });
});
