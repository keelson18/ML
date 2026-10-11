import { describe, expect, it } from 'vitest';
import { closePaperPosition, simulatePaperOrder, type PaperAccountState } from '../engines/paper-execution';
import { hashLedgerRow, reconcilePaperAccount, verifyLedgerRows, type LedgerHashRow } from './decision-ledger';
import { traderConfig } from './config';

describe('paper decision ledger', () => {
  it('detects a tampered row in the hash chain', () => {
    const first: LedgerHashRow = { accountId: 'user-a', idempotencyKey: '1', eventType: 'paper.fill', payload: { price: 100 }, prevHash: null, rowHash: '' };
    first.rowHash = hashLedgerRow(first);
    const second: LedgerHashRow = { accountId: 'user-a', idempotencyKey: '2', eventType: 'paper.trade.closed', payload: { pnl: 1 }, prevHash: first.rowHash, rowHash: '' };
    second.rowHash = hashLedgerRow(second);
    const rows = [first, second];
    expect(verifyLedgerRows(rows).ok).toBe(true);
    second.payload = { pnl: 2 };
    expect(verifyLedgerRows(rows)).toMatchObject({ ok: false, checked: 1, brokenIndex: 1 });
  });

  it('reconciles cash and positions after 1,000 simulated trades', () => {
    let account: PaperAccountState = { accountId: 'reconciliation-test', cash: traderConfig.TRADER_STARTING_EQUITY, positions: [], trades: [] };
    for (let index = 0; index < 1_000; index += 1) {
      const opened = simulatePaperOrder(account, {
        orderId: `order-${index}`, positionId: `position-${index}`, decisionId: `decision-${index}`,
        assetId: 'BTCUSD', symbol: 'BTCUSD', decision: { decision: 'BUY', timestamp: new Date(index * 1000).toISOString() },
        riskApproved: true, portfolioApproved: true, quantity: 1, requestedPrice: 100,
        feeRate: 0.001, slippageRate: 0, executionVersion: 'test', timestamp: new Date(index * 1000).toISOString(),
      });
      expect(opened.accepted).toBe(true);
      const closed = closePaperPosition(opened.account, 'BTCUSD', 101, 0.001, 'test', `trade-${index}`, new Date(index * 1000 + 500).toISOString());
      if ('error' in closed) throw new Error(closed.error);
      account = closed.account;
    }
    expect(reconcilePaperAccount(account).ok).toBe(true);
    expect(account.trades).toHaveLength(1_000);
  });
});
