import { describe, expect, it } from 'vitest';
import type { BotStatus as ClientBotStatus } from '../../../src/lib/backend-api';
import { deriveBotAction, type BotStatus as ServerBotStatus, type BotStatusSources } from './botStatus';

// Compile-time contract check: the server payload must satisfy the client's expected shape.
type AssertSatisfies<T extends ClientBotStatus> = T;
export type BotStatusContract = AssertSatisfies<ServerBotStatus>;

function sources(overrides: Partial<BotStatusSources> = {}): BotStatusSources {
  return {
    autonomousTradingEnabled: true,
    shadowMode: false,
    scheduler: { running: true, cycleInProgress: false, lastError: null },
    enrollment: { enabled: true, symbols: ['BTCUSD'], pausedReason: null, lastRunAt: '2026-11-05T00:00:00.000Z' },
    providerSupported: true,
    provider: 'twelvedata',
    sourceInstrument: 'BTC/USD',
    availability: { status: 'verified', checkedAt: 1, reason: null },
    sessionOpen: true,
    sessionReason: 'Crypto session filter is off; markets trade 24/7.',
    paperEligible: true,
    hasAccount: true,
    plan: null,
    pendingOrder: null,
    position: null,
    ledger: 'verified',
    ...overrides,
  };
}

const plan = (overrides: Partial<NonNullable<BotStatusSources['plan']>> = {}): NonNullable<BotStatusSources['plan']> => ({
  id: 'plan-1', symbol: 'BTCUSD', side: 'long', status: 'WATCHING', htfBias: 'bull',
  triggerTimeframe: '15m', triggerLevel: 100, invalidation: 95, targets: [110],
  lastReason: null, createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z',
  ...overrides,
});

describe('bot action derivation — prerequisites', () => {
  it('reports OFFLINE when the scheduler is not running', () => {
    expect(deriveBotAction(sources({ scheduler: { running: false, cycleInProgress: false, lastError: null } })).action).toBe('OFFLINE');
  });

  it('reports DISABLED with the exact switch when global autonomy is off', () => {
    const result = deriveBotAction(sources({ autonomousTradingEnabled: false }));
    expect(result.action).toBe('DISABLED');
    expect(result.blockingReason).toContain('AUTONOMOUS_TRADING');
  });

  it('reports ERROR when the scheduler recorded a failure', () => {
    const result = deriveBotAction(sources({ scheduler: { running: true, cycleInProgress: false, lastError: 'Scheduler cycle failed.' } }));
    expect(result).toEqual({ action: 'ERROR', blockingReason: 'Scheduler cycle failed.' });
  });

  it('reports DISABLED when the account has no enrollment', () => {
    expect(deriveBotAction(sources({ enrollment: null })).action).toBe('DISABLED');
  });

  it('reports DISABLED when account autopilot is not enabled', () => {
    const result = deriveBotAction(sources({ enrollment: { enabled: false, symbols: [], pausedReason: null, lastRunAt: null } }));
    expect(result.action).toBe('DISABLED');
    expect(result.blockingReason).toContain('not enabled');
  });

  it('reports PAUSED with the persisted pause reason', () => {
    const result = deriveBotAction(sources({ enrollment: { enabled: true, symbols: ['BTCUSD'], pausedReason: 'Ledger mismatch', lastRunAt: null } }));
    expect(result.action).toBe('PAUSED');
    expect(result.blockingReason).toContain('Ledger mismatch');
  });

  it('reports ERROR for an instrument without a provider adapter', () => {
    expect(deriveBotAction(sources({ providerSupported: false })).action).toBe('ERROR');
  });

  it('reports DISABLED for a non-USD-settled instrument', () => {
    expect(deriveBotAction(sources({ paperEligible: false })).action).toBe('DISABLED');
  });
});

describe('bot action derivation — data health', () => {
  it('reports INITIALIZING before any provider check is recorded', () => {
    expect(deriveBotAction(sources({ availability: null })).action).toBe('INITIALIZING');
  });

  it('reports ERROR when the provider confirmed unavailability', () => {
    const result = deriveBotAction(sources({ availability: { status: 'unavailable', checkedAt: 1, reason: 'Provider reports this instrument unavailable.' } }));
    expect(result.action).toBe('ERROR');
    expect(result.blockingReason).toContain('unavailable');
  });

  it('reports PAUSED for stale market data', () => {
    expect(deriveBotAction(sources({ availability: { status: 'stale', checkedAt: 1, reason: 'Latest data is stale.' } })).action).toBe('PAUSED');
  });

  it('reports MONITORING with a blocking reason while verification is incomplete', () => {
    for (const status of ['unverified', 'partially_verified'] as const) {
      const result = deriveBotAction(sources({ availability: { status, checkedAt: 1, reason: 'Verification incomplete.' } }));
      expect(result.action).toBe('MONITORING');
      expect(result.blockingReason).toBe('Verification incomplete.');
    }
  });

  it('blocks on a broken ledger and initializes on an unavailable one', () => {
    expect(deriveBotAction(sources({ ledger: 'broken' })).action).toBe('ERROR');
    expect(deriveBotAction(sources({ ledger: 'unavailable' })).action).toBe('INITIALIZING');
  });

  it('reports MONITORING with the session reason when the venue is closed', () => {
    const result = deriveBotAction(sources({ sessionOpen: false, sessionReason: 'Outside the configured market session.' }));
    expect(result.action).toBe('MONITORING');
    expect(result.blockingReason).toBe('Outside the configured market session.');
  });
});

describe('bot action derivation — plan lifecycle', () => {
  it('reports NO_SETUP when the account exists but no plan has been persisted', () => {
    expect(deriveBotAction(sources()).action).toBe('NO_SETUP');
  });

  it('reports INITIALIZING when there is no account state yet', () => {
    expect(deriveBotAction(sources({ hasAccount: false })).action).toBe('INITIALIZING');
  });

  it('reports PLAN_CREATED for a watched plan', () => {
    expect(deriveBotAction(sources({ plan: plan() })).action).toBe('PLAN_CREATED');
  });

  it('reports WAITING_FOR_TRIGGER for an armed plan without a rejection', () => {
    expect(deriveBotAction(sources({ plan: plan({ status: 'ARMED' }) })).action).toBe('WAITING_FOR_TRIGGER');
  });

  it('reports RISK_REJECTED when an armed plan carries a gate rejection', () => {
    const result = deriveBotAction(sources({ plan: plan({ status: 'ARMED', lastReason: 'Daily trade cap reached (3).' }) }));
    expect(result.action).toBe('RISK_REJECTED');
    expect(result.blockingReason).toBe('Daily trade cap reached (3).');
  });

  it('reports TRIGGER_CONFIRMED (never PAPER_BUY) while a plan is only pending', () => {
    expect(deriveBotAction(sources({ plan: plan({ status: 'PENDING_ORDER' }) })).action).toBe('TRIGGER_CONFIRMED');
  });

  it('reports PAPER_ORDER_PENDING only when a persisted order exists', () => {
    expect(deriveBotAction(sources({ plan: plan({ status: 'PENDING_ORDER' }), pendingOrder: { side: 'buy', status: 'pending' } })).action).toBe('PAPER_ORDER_PENDING');
  });

  it('reports POSITION_OPEN for a confirmed open position', () => {
    expect(deriveBotAction(sources({ position: { side: 'buy', entryPrice: 100, quantity: 1 } })).action).toBe('POSITION_OPEN');
  });

  it('returns to NO_SETUP after expiry or invalidation', () => {
    for (const status of ['EXPIRED', 'INVALIDATED']) {
      expect(deriveBotAction(sources({ plan: plan({ status }) })).action).toBe('NO_SETUP');
    }
  });

  it('keeps market bias separate from the action state', () => {
    expect(deriveBotAction(sources({ plan: plan({ htfBias: 'bear', status: 'ARMED' }) })).action).toBe('WAITING_FOR_TRIGGER');
    expect(deriveBotAction(sources({ plan: plan({ htfBias: 'bear', status: 'WATCHING' }) })).action).toBe('PLAN_CREATED');
  });

  it('does not claim execution while shadow mode is active', () => {
    const result = deriveBotAction(sources({ shadowMode: true, plan: plan({ status: 'PENDING_ORDER' }) }));
    expect(['PAPER_BUY', 'PAPER_SELL', 'POSITION_OPEN']).not.toContain(result.action);
    expect(result.blockingReason).toContain('Shadow mode is enabled');
  });

  it('keeps shadow-mode wording on a persisted pending order too', () => {
    const result = deriveBotAction(sources({ shadowMode: true, pendingOrder: { side: 'buy', status: 'pending' } }));
    expect(result.action).toBe('PAPER_ORDER_PENDING');
    expect(result.blockingReason).toContain('Shadow mode is enabled');
  });
});
