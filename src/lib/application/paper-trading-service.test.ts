import { describe, expect, it } from 'vitest';
import { closePaperTrade, executePaperOrder } from './paper-trading-service';
import type { PaperAccountState } from '../intelligence/paper-execution';

const account: PaperAccountState = { accountId: 'paper-1', cash: 1000, positions: [], trades: [] };
const decision = {
  decision: 'BUY' as const,
  confidence: 0.8,
  strategy: 'test',
  supportingEvidence: [],
  contradictions: [],
  explanation: 'Approved paper decision',
};

describe('paper-trading application service', () => {
  it('executes and closes a paper trade without persistence when disabled', async () => {
    const opened = await executePaperOrder({
      account,
      accountId: 'paper-1',
      persist: false,
      request: {
        orderId: 'order-service-1',
        positionId: 'position-service-1',
        decisionId: 'decision-service-1',
        assetId: 'asset-1',
        symbol: 'BTCUSDT',
        decision,
        riskApproved: true,
        portfolioApproved: true,
        quantity: 1,
        requestedPrice: 100,
        feeRate: 0.01,
        slippageRate: 0,
        executionVersion: 'paper-1',
      },
    });
    expect(opened.accepted).toBe(true);
    if (!opened.accepted) return;

    const closed = await closePaperTrade({
      account: opened.account,
      accountId: 'paper-1',
      decisionId: 'decision-service-1',
      assetId: 'asset-1',
      symbol: 'BTCUSDT',
      exitPrice: 105,
      feeRate: 0.01,
      executionVersion: 'paper-1',
      tradeId: 'trade-service-1',
      persist: false,
    });
    expect('trade' in closed).toBe(true);
  });
});