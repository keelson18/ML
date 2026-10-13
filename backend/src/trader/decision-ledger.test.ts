import { describe, expect, it } from 'vitest';
import { closePaperPosition, reducePaperPosition, simulatePaperOrder, type PaperAccountState } from '../engines/paper-execution';
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

  it('reports account-state corruption outside the configured reconciliation tolerance', () => {
    const account: PaperAccountState = {
      accountId: 'corrupt-account', cash: traderConfig.TRADER_STARTING_EQUITY - 1_000,
      positions: [], trades: [],
    };
    expect(reconcilePaperAccount(account)).toMatchObject({ ok: false, difference: -1_000 });
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

  it.each([{ exitPrice: 110, expectedSign: 1 }, { exitPrice: 90, expectedSign: -1 }])(
    'accounts for entry/exit fees and a $expectedSign outcome exactly once', ({ exitPrice, expectedSign }) => {
      const start = traderConfig.TRADER_STARTING_EQUITY;
      const opened = simulatePaperOrder({ accountId: 'transition-test', cash: start, positions: [], trades: [] }, {
        orderId: 'one-order', positionId: 'one-position', decisionId: 'one-plan', assetId: 'BTCUSD', symbol: 'BTCUSD',
        decision: { decision: 'BUY' }, riskApproved: true, portfolioApproved: true, quantity: 2, requestedPrice: 100,
        feeRate: 0.01, slippageRate: 0, executionVersion: 'test', timestamp: '2026-01-01T00:00:00.000Z',
      });
      expect(opened.accepted).toBe(true);
      const closed = closePaperPosition(opened.account, 'BTCUSD', exitPrice, 0.01, 'test', `trade-${exitPrice}`, '2026-01-02T00:00:00.000Z');
      if ('error' in closed) throw new Error(closed.error);
      expect(Math.sign(closed.trade.realizedPnl)).toBe(expectedSign);
      expect(closed.trade.fees).toBeCloseTo(2 + exitPrice * 2 * 0.01);
      expect(reconcilePaperAccount(closed.account).ok).toBe(true);
      const duplicateClose = closePaperPosition(closed.account, 'BTCUSD', exitPrice, 0.01, 'test', 'duplicate-close');
      expect('error' in duplicateClose).toBe(true);
      expect(closed.account.trades).toHaveLength(1);
    },
  );

  it('allocates entry fees and proceeds proportionally across partial fills, then reconciles', () => {
    const opened = simulatePaperOrder({ accountId: 'partial-test', cash: traderConfig.TRADER_STARTING_EQUITY, positions: [], trades: [] }, {
      orderId: 'partial-order', positionId: 'partial-position', decisionId: 'plan', assetId: 'ETHUSD', symbol: 'ETHUSD',
      decision: { decision: 'BUY' }, riskApproved: true, portfolioApproved: true, quantity: 4, requestedPrice: 100,
      feeRate: 0.01, slippageRate: 0, executionVersion: 'test', timestamp: '2026-01-01T00:00:00.000Z',
    });
    const partial = reducePaperPosition(opened.account, 'partial-position', 1, 110, 0.01, 'test', 'partial-exit', '2026-01-02T00:00:00.000Z');
    if ('error' in partial) throw new Error(partial.error);
    expect(partial.account.positions[0]).toMatchObject({ status: 'open', quantity: 3 });
    expect(partial.trade.fees).toBeCloseTo(1 + 1.1);
    expect(reconcilePaperAccount(partial.account).ok).toBe(true);
    const final = reducePaperPosition(partial.account, 'partial-position', 3, 90, 0.01, 'test', 'final-exit', '2026-01-03T00:00:00.000Z');
    if ('error' in final) throw new Error(final.error);
    expect(final.account.positions[0]).toMatchObject({ status: 'closed', quantity: 0 });
    expect(final.account.trades).toHaveLength(2);
    expect(reconcilePaperAccount(final.account).ok).toBe(true);
  });
});
