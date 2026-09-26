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
  it('closes a position automatically when its stop is touched', async () => {
    const accountId = `lifecycle-${Date.now()}`;
    await executeDecision({ accountId, symbol: 'TESTUSDT', decision: buyDecision(), quantity: 1 });

    const trades = await manageOpenPositions(accountId, 'TESTUSDT', {
      time: Math.floor(Date.now() / 1000), open: 100, high: 101, low: 94, close: 96, volume: 10,
    });

    expect(trades).toHaveLength(1);
    expect(trades[0].realizedPnl).toBeLessThan(0);
    expect(getAccount(accountId).positions[0].status).toBe('closed');
  });
});