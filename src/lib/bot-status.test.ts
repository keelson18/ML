import { describe, expect, it } from 'vitest';
import type { BotActionState, BotStatus } from './backend-api';
import { describeBotBias, describeExecution, describePlan, describeRisk, describeTrigger, presentBotAction } from './bot-status';

const STATES: BotActionState[] = [
  'OFFLINE', 'DISABLED', 'INITIALIZING', 'MONITORING', 'ANALYZING', 'NO_SETUP', 'PLAN_CREATED',
  'WAITING_FOR_TRIGGER', 'TRIGGER_CONFIRMED', 'RISK_REJECTED', 'READY_FOR_PAPER_EXECUTION',
  'PAPER_ORDER_PENDING', 'PAPER_BUY', 'PAPER_SELL', 'POSITION_OPEN', 'PAUSED', 'ERROR',
];

function status(overrides: Partial<BotStatus> = {}): BotStatus {
  return {
    action: 'MONITORING', selectedSymbol: 'BTCUSD', assetClass: 'crypto', settlementCurrency: 'USD', timeframe: '15m',
    botEnabled: true, shadowMode: false,
    scheduler: { running: true, cycleInProgress: false, lastCycleAt: null, nextScheduledAt: null, lastError: null, leaseContentionCount: 0, leaseClaimFailureCount: 0, leaseRenewalFailureCount: 0, activeLeaseCount: 0 },
    enrollment: { enabled: true, symbols: ['BTCUSD'], pausedReason: null, lastRunAt: null },
    data: { providerSupported: true, provider: 'twelvedata', sourceInstrument: 'BTC/USD', status: 'verified', checkedAt: 1, reason: null, sessionOpen: true, sessionReason: '24/7' },
    analysis: { state: 'NO_SETUP', marketBias: 'UNKNOWN' },
    plan: null,
    trigger: { state: 'NONE', reason: null },
    risk: { state: 'NOT_EVALUATED', reason: null },
    execution: { finalAction: 'NONE', orderStatus: 'NONE', orderSide: null, positionStatus: 'NONE', positionSide: null, positionEntry: null, positionQuantity: null },
    ledger: 'verified', lastProcessedCandleAt: null, lastClosedTradeAt: null, closedTradeCount: 0,
    blockingReason: null, updatedAt: '2026-11-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('bot action presentation', () => {
  it('labels every lifecycle state distinctly', () => {
    const labels = STATES.map((state) => presentBotAction(state).label);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBeLessThanOrEqual(labels.length);
    expect(presentBotAction('TRIGGER_CONFIRMED').label).not.toBe(presentBotAction('PAPER_BUY').label);
    expect(presentBotAction('RISK_REJECTED').tone).toBe('danger');
    expect(presentBotAction('POSITION_OPEN').tone).toBe('success');
  });
});

describe('bot status formatting', () => {
  it('keeps bias wording separate from the action label', () => {
    expect(describeBotBias('BUY')).toBe('Bullish');
    expect(describeBotBias('SELL')).toBe('Bearish');
    expect(describeBotBias('UNKNOWN')).toBe('Unknown');
  });

  it('describes the active plan and its trigger/risk state', () => {
    const plan = {
      id: 'plan-1234567890ab', symbol: 'BTCUSD', side: 'long' as const, status: 'ARMED', htfBias: 'bull',
      triggerTimeframe: '15m' as const, triggerLevel: 100, invalidation: 95, targets: [110],
      lastReason: null, createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z',
    };
    expect(describePlan(plan)).toContain('LONG');
    expect(describePlan(null)).toBe('No active plan');
    expect(describeTrigger(status({ trigger: { state: 'WAITING', reason: null } }))).toBe('Waiting');
    expect(describeRisk(status({ risk: { state: 'REJECTED', reason: 'Daily cap' } }))).toBe('Rejected');
  });

  it('never reports an execution without a persisted order or position', () => {
    expect(describeExecution(status())).toBe('No paper order');
    expect(describeExecution(status({ execution: { ...status().execution, orderStatus: 'PENDING', orderSide: 'buy' } }))).toContain('pending');
    expect(describeExecution(status({ execution: { ...status().execution, positionStatus: 'OPEN', positionSide: 'sell', positionQuantity: 2 } }))).toContain('SELL');
  });
});
