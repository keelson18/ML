import { describe, expect, it } from 'vitest';
import type { PaperAccountState, PaperOrderRequest, PaperPosition } from './paper-execution';
import { closePaperPosition, reducePaperPosition, simulatePaperOrder } from './paper-execution';

const openPosition: PaperPosition = {
  id: 'position-1', symbol: 'BTCUSD', assetId: 'BTCUSD', side: 'buy', quantity: 2,
  entryPrice: 101, entryFee: 2.02, entrySlippage: 2, stopLoss: 90, initialRisk: 11,
  status: 'open', openedAt: '2026-01-01T00:00:00.000Z',
};

function account(overrides: Partial<PaperAccountState> = {}): PaperAccountState {
  return { accountId: 'account-1', cash: 1_000, positions: [], trades: [], ...overrides };
}

function order(overrides: Partial<PaperOrderRequest> = {}): PaperOrderRequest {
  return {
    orderId: 'order-1', positionId: 'position-2', decisionId: 'decision-1', assetId: 'BTCUSD', symbol: 'BTCUSD',
    decision: { decision: 'BUY' }, riskApproved: true, portfolioApproved: true, quantity: 2, requestedPrice: 100,
    feeRate: 0.01, slippageRate: 0.01, executionVersion: 'test-1', ...overrides,
  };
}

describe('paper order execution validation', () => {
  it.each([
    ['non-directional decision', order({ decision: { decision: 'NO_TRADE' } }), account(), 'Only directional decisions'],
    ['short opening decision', order({ decision: { decision: 'SELL' } }), account(), 'Short paper positions are not enabled'],
    ['risk denial', order({ riskApproved: false }), account(), 'approved risk and portfolio gates'],
    ['portfolio denial', order({ portfolioApproved: false }), account(), 'approved risk and portfolio gates'],
    ['zero quantity', order({ quantity: 0 }), account(), 'Quantity and requested price'],
    ['non-finite quantity', order({ quantity: Number.NaN }), account(), 'Quantity and requested price'],
    ['zero requested price', order({ requestedPrice: 0 }), account(), 'Quantity and requested price'],
    ['non-finite requested price', order({ requestedPrice: Number.POSITIVE_INFINITY }), account(), 'Quantity and requested price'],
    ['negative fee', order({ feeRate: -0.01 }), account(), 'rates must be finite values in [0, 1)'],
    ['non-finite fee', order({ feeRate: Number.NaN }), account(), 'rates must be finite values in [0, 1)'],
    ['infinite fee', order({ feeRate: Number.POSITIVE_INFINITY }), account(), 'rates must be finite values in [0, 1)'],
    ['fee at one', order({ feeRate: 1 }), account(), 'rates must be finite values in [0, 1)'],
    ['negative slippage', order({ slippageRate: -0.01 }), account(), 'rates must be finite values in [0, 1)'],
    ['non-finite slippage', order({ slippageRate: Number.NaN }), account(), 'rates must be finite values in [0, 1)'],
    ['infinite slippage', order({ slippageRate: Number.POSITIVE_INFINITY }), account(), 'rates must be finite values in [0, 1)'],
    ['slippage at one', order({ slippageRate: 1 }), account(), 'rates must be finite values in [0, 1)'],
    ['duplicate open symbol', order(), account({ positions: [openPosition] }), 'Only one open paper position per symbol'],
    ['insufficient cash', order({ quantity: 20 }), account(), 'Insufficient paper cash'],
    ['negative account cash', order(), account({ cash: -1 }), 'Paper account cash must be finite and non-negative'],
    ['non-finite account cash', order(), account({ cash: Number.NaN }), 'Paper account cash must be finite and non-negative'],
  ])('rejects %s without mutating account state', (_case, request, state, reason) => {
    const result = simulatePaperOrder(state, request);
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain(reason);
    expect(result.account).toBe(state);
  });

  it('applies adverse entry slippage and fee exactly once on an accepted fill', () => {
    const state = account({ cash: 1_000 });
    const result = simulatePaperOrder(state, order());

    expect(result).toMatchObject({ accepted: true, status: 'filled', fillPrice: 101, fee: 2.02 });
    expect(result.account.cash).toBeCloseTo(795.98);
    expect(result.account.positions).toHaveLength(1);
    expect(result.account.positions[0]).toMatchObject({
      entryPrice: 101, entryFee: 2.02, entrySlippage: 2, quantity: 2, status: 'open',
    });
    expect(result.account.trades).toEqual([]);
    expect(state.cash).toBe(1_000);
    expect(state.positions).toHaveLength(0);
  });

  it('fills at the requested price with zero execution costs', () => {
    const result = simulatePaperOrder(account(), order({ feeRate: 0, slippageRate: 0 }));

    expect(result).toMatchObject({ accepted: true, status: 'filled', fillPrice: 100, fee: 0 });
    expect(result.account.cash).toBe(800);
    expect(result.account.positions[0]).toMatchObject({ entryPrice: 100, entryFee: 0, entrySlippage: 0 });
  });
});

describe('paper position reductions and closes', () => {
  it('rejects a close for a missing position', () => {
    const state = account();
    expect(closePaperPosition(state, 'BTCUSD', 110, 0.01, 'test-1', 'trade-1'))
      .toEqual({ account: state, error: 'No open paper position exists for this symbol.' });
  });

  it.each([
    ['missing position', 'missing', 1, 110, 0.01, 0.01],
    ['zero quantity', openPosition.id, 0, 110, 0.01, 0.01],
    ['zero price', openPosition.id, 1, 0, 0.01, 0.01],
    ['negative fee', openPosition.id, 1, 110, -0.01, 0.01],
    ['non-finite fee', openPosition.id, 1, 110, Number.NaN, 0.01],
    ['fee at one', openPosition.id, 1, 110, 1, 0.01],
    ['negative slippage', openPosition.id, 1, 110, 0.01, -0.01],
    ['slippage at one', openPosition.id, 1, 110, 0.01, 1],
  ])('rejects %s without changing the account', (_case, positionId, quantity, price, fee, slippage) => {
    const state = account({ positions: [openPosition] });
    const result = reducePaperPosition(state, positionId, quantity, price, fee, 'test-1', 'trade-1', undefined, 'test', undefined, slippage);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toBeTruthy();
    expect(result.account).toBe(state);
  });

  it('accounts for adverse exit slippage and fee on a partial close', () => {
    const state = account({ cash: 500, positions: [openPosition] });
    const result = reducePaperPosition(state, openPosition.id, 0.5, 110, 0.01, 'test-1', 'trade-1', '2026-01-01T01:00:00.000Z', 'partial', undefined, 0.01);
    expect('trade' in result).toBe(true);
    if ('error' in result) throw new Error(result.error);

    expect(result.trade.exitPrice).toBeCloseTo(108.9);
    expect(result.trade.entryFee).toBeCloseTo(0.505);
    expect(result.trade.exitFee).toBeCloseTo(0.5445);
    expect(result.trade.fees).toBeCloseTo(1.0495);
    expect(result.trade.slippage).toBeCloseTo(1.05);
    expect(result.trade.realizedPnl).toBeCloseTo(2.9005);
    expect(result.account.cash).toBeCloseTo(553.9055);
    expect(result.account.positions[0]).toMatchObject({ quantity: 1.5, status: 'open' });
    expect(result.account.positions[0]?.entryFee).toBeCloseTo(1.515);
    expect(result.account.trades).toHaveLength(1);
  });

  it('closes no more than the remaining position quantity and records the ledger trade', () => {
    const state = account({ cash: 500, positions: [openPosition] });
    const result = closePaperPosition(state, 'BTCUSD', 110, 0.01, 'test-1', 'trade-close', '2026-01-01T02:00:00.000Z', { high: 112, low: 109 }, 0.01);
    expect('trade' in result).toBe(true);
    if ('error' in result) throw new Error(result.error);

    expect(result.trade.quantity).toBe(2);
    expect(result.trade.exitPrice).toBeCloseTo(108.9);
    expect(result.trade.exitReason).toBe('stop-or-target');
    expect(result.account.positions[0]).toMatchObject({ quantity: 0, status: 'closed' });
    expect(result.account.trades).toEqual([result.trade]);
  });

  it('caps an oversized reduction at the remaining position size', () => {
    const state = account({ cash: 500, positions: [openPosition] });
    const result = reducePaperPosition(state, openPosition.id, 100, 90, 0, 'test-1', 'trade-cap', '2026-01-01T03:00:00.000Z');

    expect('trade' in result).toBe(true);
    if ('error' in result) throw new Error(result.error);
    expect(result.trade.quantity).toBe(2);
    expect(result.trade.realizedPnl).toBeCloseTo(-24.02);
    expect(result.account.positions[0]).toMatchObject({ quantity: 0, status: 'closed' });
    expect(result.account.cash).toBe(680);
  });
});
