import { describe, expect, it } from 'vitest';
import { executeDecision, getAccount, manageOpenPositions } from './paperTradingService';
import type { TradeDecision } from '../engines/decision-engine';

function buyDecision(): TradeDecision {
  return {
    decision: 'BUY',
    confidence: 0.9,
    entry: 100,
    invalidation: 95,
    targets: [{ price: 110 }],
    strategy: 'test',
    supportingEvidence: [],
    contradictions: [],
    reasoning: 'Test decision',
    explanation: 'Test decision',
    engineVersions: {},
    timestamp: new Date().toISOString(),
  };
}

describe('backend paper position lifecycle', () => {
  it('rejects non-USD-quoted markets for USD paper accounts', async () => {
    const accountId = `non-usd-${Date.now()}`;
    const result = await executeDecision({ accountId, symbol: 'USDJPY', decision: buyDecision(), quantity: 1 });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('Paper accounts support USD-quoted markets only.');
    expect((await getAccount(accountId)).positions).toHaveLength(0);
  });

  it('rejects new positions when market data is stale', async () => {
    const accountId = `stale-${Date.now()}`;
    const result = await executeDecision({ accountId, symbol: 'BTCUSD', decision: buyDecision(), quantity: 1, marketDataStale: true });

    expect(result.accepted).toBe(false);
    expect((await getAccount(accountId)).positions).toHaveLength(0);
  });

  it('closes a position automatically when its stop is touched', async () => {
    const accountId = `lifecycle-${Date.now()}`;
    await executeDecision({ accountId, symbol: 'BTCUSD', decision: buyDecision(), quantity: 1 });

    const trades = await manageOpenPositions(accountId, 'BTCUSD', {
      time: Math.floor(Date.now() / 1000), open: 100, high: 101, low: 94, close: 96, volume: 10,
    });

    expect(trades).toHaveLength(1);
    expect(trades[0].realizedPnl).toBeLessThan(0);
    expect((await getAccount(accountId)).positions[0].status).toBe('closed');
  });
});
