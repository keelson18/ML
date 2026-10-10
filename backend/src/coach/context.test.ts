import { describe, expect, it } from 'vitest';
import type { PaperAccountState, PaperJournalEntry, PaperPosition, PaperTrade } from '../engines/paper-execution';
import type { TradePlan } from '../trader/types';
import { buildCoachRecords, COACH_MAX_PLANS, COACH_MAX_TRADES } from './context';

function plan(index: number): TradePlan {
  return {
    id: `plan-${index}`, accountId: 'user-a', symbol: 'BTCUSD', side: 'long', setupType: 'trend-pullback',
    htfBias: 'bull', zone: { low: 99, high: 101 }, trigger: { kind: 'close_above_level', level: 101 },
    invalidation: 98, targets: [{ price: 110, fractionOfPosition: 1 }], minRR: 2, expiresAtBar: 0,
    thesis: 'Test thesis', falsification: 'Test falsification', grade: 'B', status: 'WATCHING',
    contextSnapshot: { secret: 'internal' }, engineVersions: { planner: '1' }, datasetId: 'ds-1',
    createdAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(), updatedAt: '2026-01-01T00:00:00.000Z',
  } as TradePlan;
}

function trade(index: number): PaperTrade {
  return {
    id: `trade-${index}`, positionId: `pos-${index}`, symbol: 'ETHUSD', side: 'buy', quantity: 1,
    entryPrice: 100, exitPrice: index % 2 === 0 ? 105 : 97, fees: 0.1, slippage: 0, realizedPnl: index % 2 === 0 ? 5 : -3,
    executionVersion: 'v1', openedAt: '2026-02-01T00:00:00.000Z',
    closedAt: new Date(Date.UTC(2026, 1, 1 + index)).toISOString(), exitReason: 'stop', maeR: -0.4, mfeR: 1.2,
  };
}

function account(overrides: Partial<PaperAccountState> = {}): PaperAccountState {
  return { accountId: 'user-a', cash: 1000, positions: [], trades: [], ...overrides };
}

describe('buildCoachRecords', () => {
  it('caps plans and trades and returns the newest first', () => {
    const plans = Array.from({ length: COACH_MAX_PLANS + 3 }, (_, i) => plan(i));
    const trades = Array.from({ length: COACH_MAX_TRADES + 4 }, (_, i) => trade(i));
    const records = buildCoachRecords(account({ trades }), plans);

    expect(records.plans).toHaveLength(COACH_MAX_PLANS);
    expect(records.plans[0].id).toBe(`plan-${COACH_MAX_PLANS + 2}`);
    expect(records.recentTrades).toHaveLength(COACH_MAX_TRADES);
    expect(records.recentTrades[0].id).toBe(`trade-${COACH_MAX_TRADES + 3}`);
  });

  it('omits internal fields such as context snapshots and engine versions', () => {
    const records = buildCoachRecords(account(), [plan(0)]);
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain('contextSnapshot');
    expect(serialized).not.toContain('engineVersions');
    expect(serialized).not.toContain('datasetId');
    expect(serialized).not.toContain('secret');
  });

  it('reads the R-multiple from the journal entry for each trade', () => {
    const journal: PaperJournalEntry = {
      id: 'trade-0', planId: 'plan-0', accountId: 'user-a', symbol: 'ETHUSD', datasetId: 'ds-1',
      configHash: 'h', engineVersions: {}, active_event_ids: [], metrics: { rMultiple: 1.67 }, createdAt: '2026-02-01T00:00:00.000Z',
    };
    const records = buildCoachRecords(account({ trades: [trade(0)], tradeJournal: [journal] }), []);
    expect(records.recentTrades[0]).toMatchObject({ id: 'trade-0', rMultiple: 1.67, planId: 'plan-0' });
  });

  it('uses null for R-multiple and plan when the journal is missing', () => {
    const records = buildCoachRecords(account({ trades: [trade(1)] }), []);
    expect(records.recentTrades[0]).toMatchObject({ rMultiple: null, planId: null });
  });

  it('lists only open positions and counts wins and losses across all closed trades', () => {
    const open: PaperPosition = {
      id: 'pos-open', symbol: 'BTCUSD', assetId: 'a', side: 'buy', quantity: 2, entryPrice: 100, entryFee: 0,
      stopLoss: 95, takeProfit: 110, initialRisk: 10, status: 'open', openedAt: '2026-03-01T00:00:00.000Z',
    };
    const closed = { ...open, id: 'pos-closed', status: 'closed' as const };
    const records = buildCoachRecords(account({ positions: [open, closed], trades: [trade(0), trade(1), trade(2)] }), []);

    expect(records.openPositions.map((p) => p.id)).toEqual(['pos-open']);
    expect(records.openPositions[0]).toMatchObject({ stopLoss: 95, takeProfit: 110, initialRisk: 10 });
    expect(records.stats).toEqual({ closedTradeCount: 3, winCount: 2, lossCount: 1 });
  });
});
