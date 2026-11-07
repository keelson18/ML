// Authoritative, read-only view of what the autonomous paper bot is actually doing.
// It aggregates existing sources (scheduler diagnostics, paper account state, enrollment row,
// provider verification) instead of inventing a second source of truth.
import type { MarketType, Timeframe } from '../../../src/lib/types';
import { getMarket } from '../../../src/lib/markets';
import { paperSettlementEligible, providerSupport, settlementCurrency } from '../../../src/lib/marketCapabilities';
import { config } from '../config';
import { traderConfig } from '../trader/config';
import { evaluateMarketSession } from '../trader/sessions';
import { getSupabaseClient } from '../db';
import { paperAutopilotScheduler } from '../autonomy/paper-autopilot';
import { getMarketAvailability, type AvailabilityStatus } from './marketAvailability';
import { getAccount } from './paperTradingService';

export type BotActionState =
  | 'OFFLINE' | 'DISABLED' | 'INITIALIZING' | 'MONITORING' | 'ANALYZING' | 'NO_SETUP'
  | 'PLAN_CREATED' | 'WAITING_FOR_TRIGGER' | 'TRIGGER_CONFIRMED' | 'RISK_REJECTED'
  | 'READY_FOR_PAPER_EXECUTION' | 'PAPER_ORDER_PENDING' | 'PAPER_BUY' | 'PAPER_SELL'
  | 'POSITION_OPEN' | 'PAUSED' | 'ERROR';

export type BotMarketBias = 'BUY' | 'SELL' | 'NEUTRAL' | 'UNKNOWN';

export interface BotPlanSummary {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  status: string;
  htfBias: string;
  triggerTimeframe: Timeframe | null;
  triggerLevel: number | null;
  invalidation: number;
  targets: number[];
  lastReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BotStatus {
  action: BotActionState;
  selectedSymbol: string;
  assetClass: MarketType | null;
  settlementCurrency: string | null;
  timeframe: Timeframe;
  botEnabled: boolean;
  shadowMode: boolean;
  scheduler: {
    running: boolean;
    cycleInProgress: boolean;
    lastCycleAt: string | null;
    nextScheduledAt: string | null;
    lastError: string | null;
    leaseContentionCount: number;
    leaseClaimFailureCount: number;
    leaseRenewalFailureCount: number;
    activeLeaseCount: number;
  };
  enrollment: {
    enabled: boolean;
    symbols: string[];
    pausedReason: string | null;
    lastRunAt: string | null;
  } | null;
  data: {
    providerSupported: boolean;
    provider: string | null;
    sourceInstrument: string | null;
    status: AvailabilityStatus | 'unsupported';
    checkedAt: number | null;
    reason: string | null;
    sessionOpen: boolean;
    sessionReason: string;
  };
  analysis: {
    state: 'NOT_RUN' | 'NO_SETUP' | 'PLAN_AVAILABLE';
    marketBias: BotMarketBias;
  };
  plan: BotPlanSummary | null;
  trigger: {
    state: 'NONE' | 'WAITING' | 'CONFIRMED';
    reason: string | null;
  };
  risk: {
    state: 'NOT_EVALUATED' | 'REJECTED' | 'APPROVED';
    reason: string | null;
  };
  execution: {
    finalAction: 'NONE' | 'BUY' | 'SELL';
    orderStatus: 'NONE' | 'PENDING' | 'FILLED';
    orderSide: 'buy' | 'sell' | null;
    positionStatus: 'NONE' | 'OPEN';
    positionSide: 'buy' | 'sell' | null;
    positionEntry: number | null;
    positionQuantity: number | null;
  };
  ledger: 'verified' | 'broken' | 'unavailable';
  lastProcessedCandleAt: string | null;
  lastClosedTradeAt: string | null;
  closedTradeCount: number;
  blockingReason: string | null;
  updatedAt: string;
}

export interface BotStatusSources {
  autonomousTradingEnabled: boolean;
  shadowMode: boolean;
  scheduler: { running: boolean; cycleInProgress: boolean; lastError: string | null };
  enrollment: { enabled: boolean; symbols: string[]; pausedReason: string | null; lastRunAt: string | null } | null;
  providerSupported: boolean;
  provider: string | null;
  sourceInstrument: string | null;
  availability: { status: AvailabilityStatus; checkedAt: number | null; reason: string | null } | null;
  sessionOpen: boolean;
  sessionReason: string;
  paperEligible: boolean;
  hasAccount: boolean;
  plan: BotPlanSummary | null;
  pendingOrder: { side: 'buy' | 'sell'; status: string } | null;
  position: { side: 'buy' | 'sell'; entryPrice: number; quantity: number } | null;
  ledger: 'verified' | 'broken' | 'unavailable';
}

function biasOf(plan: BotPlanSummary | null): BotMarketBias {
  if (!plan) return 'UNKNOWN';
  if (plan.htfBias === 'bull') return 'BUY';
  if (plan.htfBias === 'bear') return 'SELL';
  return 'NEUTRAL';
}

export function deriveBotAction(input: BotStatusSources): { action: BotActionState; blockingReason: string | null } {
  const result = deriveBaseAction(input);
  // Shadow mode evaluates triggers but never opens a paper position, so the reason must say so
  // instead of implying a live order is awaiting a fill.
  if (input.shadowMode && ['TRIGGER_CONFIRMED', 'PAPER_ORDER_PENDING', 'READY_FOR_PAPER_EXECUTION', 'POSITION_OPEN'].includes(result.action)) {
    return {
      action: result.action,
      blockingReason: `Shadow mode is enabled: triggers are evaluated, but no paper position is opened. ${result.blockingReason ?? ''}`.trim(),
    };
  }
  return result;
}

// Derivation is ordered from "cannot run at all" to "already executed", so a later state can never
// hide a blocking prerequisite. Market bias stays a separate field and never becomes the action.
function deriveBaseAction(input: BotStatusSources): { action: BotActionState; blockingReason: string | null } {
  if (!input.scheduler.running) {
    return { action: 'OFFLINE', blockingReason: 'The paper autopilot scheduler is not running in this backend process.' };
  }
  if (!input.autonomousTradingEnabled) {
    return { action: 'DISABLED', blockingReason: 'AUTONOMOUS_TRADING is off; the bot manages existing positions but opens no new paper entries.' };
  }
  if (input.scheduler.lastError) {
    return { action: 'ERROR', blockingReason: input.scheduler.lastError };
  }
  if (!input.enrollment) {
    return { action: 'DISABLED', blockingReason: 'This account has no paper autopilot enrollment.' };
  }
  if (!input.enrollment.enabled) {
    return { action: 'DISABLED', blockingReason: 'Paper autopilot is not enabled for this account.' };
  }
  if (input.enrollment.pausedReason) {
    return { action: 'PAUSED', blockingReason: `Paper autopilot is paused: ${input.enrollment.pausedReason}` };
  }
  if (!input.providerSupported) {
    return { action: 'ERROR', blockingReason: 'No market-data adapter or source mapping is configured for this instrument.' };
  }
  if (!input.paperEligible) {
    return { action: 'DISABLED', blockingReason: 'Paper accounts settle in USD; this instrument cannot be paper traded until its settlement currency is supported.' };
  }
  if (!input.availability) {
    return { action: 'INITIALIZING', blockingReason: 'Market availability has not been recorded in this backend process yet.' };
  }
  if (input.availability.status === 'unavailable' || input.availability.status === 'error') {
    return { action: 'ERROR', blockingReason: input.availability.reason ?? 'Provider could not supply valid market data for this instrument.' };
  }
  if (input.availability.status === 'stale') {
    return { action: 'PAUSED', blockingReason: input.availability.reason ?? 'Latest market data is stale; entries are blocked.' };
  }
  if (input.availability.status === 'unverified' || input.availability.status === 'partially_verified') {
    return {
      action: 'MONITORING',
      blockingReason: input.availability.reason ?? 'Provider verification is incomplete; entries stay blocked until every required timeframe is verified.',
    };
  }
  if (input.ledger === 'broken') {
    return { action: 'ERROR', blockingReason: 'Paper account reconciliation or ledger verification failed; new entries are blocked.' };
  }
  if (input.ledger === 'unavailable') {
    return { action: 'INITIALIZING', blockingReason: 'Paper ledger verification is unavailable; entries stay blocked until it succeeds.' };
  }
  if (input.position) return { action: 'POSITION_OPEN', blockingReason: null };
  if (input.pendingOrder) return { action: 'PAPER_ORDER_PENDING', blockingReason: null };
  if (!input.sessionOpen) return { action: 'MONITORING', blockingReason: input.sessionReason };
  if (!input.plan) {
    return {
      action: input.hasAccount ? 'NO_SETUP' : 'INITIALIZING',
      blockingReason: input.hasAccount ? 'No persisted trade plan exists yet; the planner found no eligible setup on the latest closed candles.' : 'The paper account has no state yet.',
    };
  }
  switch (input.plan.status) {
    case 'WATCHING':
      return { action: 'PLAN_CREATED', blockingReason: input.plan.lastReason ?? 'Waiting for price to enter the planned zone on a closed candle.' };
    case 'ARMED':
      return input.plan.lastReason
        ? { action: 'RISK_REJECTED', blockingReason: input.plan.lastReason }
        : { action: 'WAITING_FOR_TRIGGER', blockingReason: 'Armed: price is in the zone, waiting for a closed trigger candle.' };
    case 'PENDING_ORDER':
      return { action: 'TRIGGER_CONFIRMED', blockingReason: 'Trigger confirmed on a closed candle; the paper order is awaiting fill validation.' };
    case 'OPEN':
      return { action: 'POSITION_OPEN', blockingReason: null };
    case 'EXPIRED':
    case 'INVALIDATED':
      return { action: 'NO_SETUP', blockingReason: input.plan.lastReason ?? `The latest plan is ${input.plan.status.toLowerCase()}; no executable setup remains.` };
    default:
      return { action: 'NO_SETUP', blockingReason: `The latest plan is ${input.plan.status.toLowerCase()}.` };
  }
}

function latestPlanFor(plans: BotPlanSummary[], symbol: string): BotPlanSummary | null {
  const matching = plans
    .filter((plan) => plan.symbol === symbol)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return matching[0] ?? null;
}

function checkpointTime(processed: Record<string, number>, symbol: string, timeframe: Timeframe): number | null {
  const values = Object.entries(processed)
    .filter(([key]) => key === `${symbol}:${timeframe}` || key.startsWith(`${symbol}:${timeframe}:`))
    .map(([, value]) => value)
    .filter((value) => Number.isFinite(value));
  return values.length ? Math.max(...values) : null;
}

async function readLedgerStatus(accountId: string): Promise<'verified' | 'broken' | 'unavailable'> {
  try {
    const { data, error } = await getSupabaseClient().rpc('verify_decision_ledger', { p_account_id: accountId });
    const verification = Array.isArray(data) ? data[0] : data;
    if (error || !verification || typeof verification !== 'object' || !('ok' in verification)) return 'unavailable';
    return verification.ok === true ? 'verified' : 'broken';
  } catch {
    return 'unavailable';
  }
}

export async function buildBotStatus(accountId: string, symbol: string, timeframe: Timeframe): Promise<BotStatus> {
  const market = getMarket(symbol);
  const support = market ? providerSupport(market) : null;
  const availability = getMarketAvailability().find((candidate) => candidate.symbol === symbol) ?? null;
  const session = market
    ? evaluateMarketSession(market)
    : { allowed: false, reason: 'Unknown instrument; no session model is available.', scoreMultiplier: 0 };

  let enrollment: BotStatus['enrollment'] = null;
  let account: Awaited<ReturnType<typeof getAccount>> | null = null;
  try {
    const { data } = await getSupabaseClient().from('paper_autopilot')
      .select('enabled,symbols,paused_reason,last_run_at').eq('account_id', accountId).maybeSingle();
    if (data) {
      enrollment = {
        enabled: Boolean(data.enabled),
        symbols: Array.isArray(data.symbols) ? data.symbols.filter((value: unknown): value is string => typeof value === 'string') : [],
        pausedReason: typeof data.paused_reason === 'string' ? data.paused_reason : null,
        lastRunAt: typeof data.last_run_at === 'string' ? data.last_run_at : null,
      };
    }
  } catch {
    enrollment = null;
  }
  try { account = await getAccount(accountId); } catch { account = null; }

  const plans: BotPlanSummary[] = (account?.tradePlans ?? []).map((plan) => ({
    id: plan.id,
    symbol: plan.symbol,
    side: plan.side,
    status: plan.status,
    htfBias: plan.htfBias,
    triggerTimeframe: plan.triggerTimeframe ?? null,
    triggerLevel: 'level' in plan.trigger ? plan.trigger.level : null,
    invalidation: plan.invalidation,
    targets: plan.targets.map((target) => target.price),
    lastReason: plan.lastReason ?? null,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  }));
  const plan = latestPlanFor(plans, symbol);
  const position = account?.positions.find((candidate) => candidate.status === 'open' && candidate.symbol === symbol) ?? null;
  const pendingOrder = account?.pendingPaperOrders?.find((order) => order.status === 'pending' && order.symbol === symbol) ?? null;
  const processedAt = account ? checkpointTime(account.processedCandles ?? {}, symbol, timeframe) : null;
  const lastTrade = [...(account?.trades ?? [])].sort((left, right) => Date.parse(right.closedAt) - Date.parse(left.closedAt))[0] ?? null;
  const scheduler = paperAutopilotScheduler.diagnostics();
  const ledger = account ? await readLedgerStatus(accountId) : 'unavailable';

  const hasAccount = Boolean(account && ((account.tradePlans?.length ?? 0) > 0
    || (account.trades?.length ?? 0) > 0
    || (account.positions?.length ?? 0) > 0
    || (account.processedCandles && Object.keys(account.processedCandles).length > 0)));

  const pendingOrderSide: 'buy' | 'sell' | null = pendingOrder ? (pendingOrder.side === 'short' ? 'sell' : 'buy') : null;
  const sources: BotStatusSources = {
    autonomousTradingEnabled: config.autonomousTradingEnabled,
    shadowMode: traderConfig.SHADOW_MODE_ENABLED,
    scheduler,
    enrollment,
    providerSupported: Boolean(support?.supported),
    provider: support?.provider ?? null,
    sourceInstrument: support?.sourceSymbol ?? null,
    availability: availability ? { status: availability.status, checkedAt: availability.checkedAt, reason: availability.reason ?? null } : null,
    sessionOpen: session.allowed,
    sessionReason: session.reason,
    paperEligible: Boolean(market && paperSettlementEligible(market)),
    hasAccount,
    plan,
    pendingOrder: pendingOrder && pendingOrderSide ? { side: pendingOrderSide, status: pendingOrder.status } : null,
    position: position ? { side: position.side, entryPrice: position.entryPrice, quantity: position.quantity } : null,
    ledger,
  };
  const { action, blockingReason } = deriveBotAction(sources);

  const triggerState: BotStatus['trigger']['state'] = pendingOrder || plan?.status === 'PENDING_ORDER' || plan?.status === 'OPEN'
    ? 'CONFIRMED'
    : plan?.status === 'ARMED'
      ? (plan.lastReason ? 'NONE' : 'WAITING')
      : plan?.status === 'WATCHING' ? 'WAITING' : 'NONE';
  const riskState: BotStatus['risk']['state'] = plan?.status === 'ARMED' && plan.lastReason ? 'REJECTED'
    : plan && ['ARMED', 'PENDING_ORDER', 'OPEN'].includes(plan.status) ? 'APPROVED' : 'NOT_EVALUATED';

  return {
    action,
    selectedSymbol: symbol,
    assetClass: market?.marketType ?? null,
    settlementCurrency: market ? settlementCurrency(market) : null,
    timeframe,
    botEnabled: config.autonomousTradingEnabled,
    shadowMode: traderConfig.SHADOW_MODE_ENABLED,
    scheduler: {
      running: scheduler.running,
      cycleInProgress: scheduler.cycleInProgress,
      lastCycleAt: scheduler.lastCycleAt,
      nextScheduledAt: scheduler.nextScheduledAt,
      lastError: scheduler.lastError,
      leaseContentionCount: scheduler.leaseContentionCount,
      leaseClaimFailureCount: scheduler.leaseClaimFailureCount,
      leaseRenewalFailureCount: scheduler.leaseRenewalFailureCount,
      activeLeaseCount: scheduler.activeLeaseCount,
    },
    enrollment,
    data: {
      providerSupported: sources.providerSupported,
      provider: sources.provider,
      sourceInstrument: sources.sourceInstrument,
      status: availability?.status ?? (sources.providerSupported ? 'unverified' : 'unsupported'),
      checkedAt: availability?.checkedAt ?? null,
      reason: availability?.reason ?? (sources.providerSupported ? 'No provider check has been recorded in this backend process.' : 'No market-data adapter is configured.'),
      sessionOpen: session.allowed,
      sessionReason: session.reason,
    },
    analysis: {
      state: plan ? 'PLAN_AVAILABLE' : hasAccount ? 'NO_SETUP' : 'NOT_RUN',
      marketBias: biasOf(plan),
    },
    plan,
    trigger: { state: triggerState, reason: plan?.lastReason ?? null },
    risk: { state: riskState, reason: plan?.lastReason ?? null },
    execution: {
      finalAction: position ? (position.side === 'sell' ? 'SELL' : 'BUY') : pendingOrderSide ? (pendingOrderSide === 'sell' ? 'SELL' : 'BUY') : 'NONE',
      orderStatus: pendingOrder ? 'PENDING' : account?.pendingPaperOrders?.some((order) => order.symbol === symbol && order.status === 'filled') ? 'FILLED' : 'NONE',
      orderSide: pendingOrderSide,
      positionStatus: position ? 'OPEN' : 'NONE',
      positionSide: position ? position.side : null,
      positionEntry: position ? position.entryPrice : null,
      positionQuantity: position ? position.quantity : null,
    },
    ledger,
    lastProcessedCandleAt: processedAt ? new Date(processedAt * 1000).toISOString() : null,
    lastClosedTradeAt: lastTrade?.closedAt ?? null,
    closedTradeCount: account?.trades?.length ?? 0,
    blockingReason,
    updatedAt: new Date().toISOString(),
  };
}
