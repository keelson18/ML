import { closePaperPosition, reducePaperPosition, simulatePaperOrder, type PaperAccountState, type PaperTrade } from '../engines/paper-execution';
import type { Candle } from '../../../src/lib/types';
import { getMarket } from '../../../src/lib/markets';
import { atr } from '../../../src/lib/indicators';
import { analyzeMarketStructure } from '../../../src/lib/market-structure';
import { getSupabaseClient } from '../db';
import { fetchMarketData } from './marketDataService';
import { traderConfig } from '../trader/config';
import { calculatePositionSize, estimateOpenLongStopRisk, lossStreakCooldownReason, markToMarket } from '../trader/risk';
import { managePaperPosition } from '../trader/manager';
import { advanceTradePlan, type EntryGateResult } from '../trader/executor';
import { getCorrelationCluster } from '../trader/constants';
import type { PendingPaperOrder, PlanEvent, TradePlan } from '../trader/types';
import type { Timeframe } from '../../../src/lib/types';
import { randomUUID, createHash } from 'node:crypto';
import { computeResearchMetrics, createDailyReview, type JournalSample } from '../trader/research';
import { getMarketAvailability } from './marketAvailability';
import { evaluateEventEntryGate, getEventRiskStatus } from '../trader/event-risk';
import { reconcilePaperAccount } from '../trader/decision-ledger';
import { candleIndex, candleSeconds, isClosed, selectClosedCandles } from '../trader/candle-math';
import { config } from '../config';
import type { PaperAccountWriteFence } from './paperAutopilotLease';

const testAccounts = new Map<string, PaperAccountState>();

function freshestClosedCandle(candles: Candle[], timeframe: Timeframe, stale: boolean, now = Date.now()): Candle | undefined {
  if (stale) return undefined;
  const closed = selectClosedCandles(candles, timeframe, now, traderConfig.CLOSE_GRACE_MS).at(-1);
  if (!closed || !isClosed(closed, timeframe, now, traderConfig.CLOSE_GRACE_MS)
    || !Number.isFinite(closed.close) || closed.close <= 0) return undefined;
  const closeTime = (closed.time + candleSeconds(timeframe, closed.time)) * 1000;
  const maximumAgeMs = candleSeconds(timeframe, closed.time) * 1000 * config.marketDataMaxStaleTtlMultiplier;
  return now - closeTime <= maximumAgeMs ? closed : undefined;
}

async function activePromotedSetups(): Promise<Set<string>> {
  if (process.env.NODE_ENV === 'test') return new Set(traderConfig.PROMOTED_SETUP_TYPES);
  const { data, error } = await getSupabaseClient().from('strategy_promotions').select('setup_type').eq('status', 'active');
  if (error || !data) throw new Error('Could not verify stored strategy promotion evidence; entries are blocked.');
  return new Set(data.map((row) => String(row.setup_type)));
}

interface LoadedAccount {
  account: PaperAccountState;
  version: number;
}

async function loadAccount(accountId: string): Promise<LoadedAccount> {
  if (!accountId) throw new Error('An account ID is required.');
  if (process.env.NODE_ENV === 'test') {
    const account = testAccounts.get(accountId);
    if (account) return { account, version: 0 };
    const created = { accountId, cash: traderConfig.TRADER_STARTING_EQUITY, positions: [], trades: [] };
    testAccounts.set(accountId, created);
    return { account: created, version: 0 };
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('paper_sim_accounts')
    .select('state,version')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) throw new Error(`Could not load paper account: ${error.message}`);
  if (data?.state) return { account: data.state as PaperAccountState, version: Number(data.version) };
  // Reads never create account state. The next real mutation initializes the row and ledger atomically.
  return { account: { accountId, cash: traderConfig.TRADER_STARTING_EQUITY, positions: [], trades: [] }, version: -1 };
}

export function getAccount(accountId = 'autonomy:default') {
  return loadAccount(accountId).then(({ account }) => account);
}

export async function assertPaperAccountIntegrity(accountId: string, account: PaperAccountState): Promise<void> {
  const reconciliation = reconcilePaperAccount(account);
  if (!reconciliation.ok) throw new Error('Paper account reconciliation is broken; new entries are blocked until reviewed.');

  const { data, error } = await getSupabaseClient().rpc('verify_decision_ledger', { p_account_id: accountId });
  const verification = Array.isArray(data) ? data[0] : data;
  if (error || !verification || typeof verification !== 'object' || !('ok' in verification) || verification.ok !== true) {
    throw new Error('Paper decision ledger verification failed or is unavailable; new entries are blocked until reviewed.');
  }
}

export async function storeTradePlan(accountId: string, plan: TradePlan, writeFence?: PaperAccountWriteFence): Promise<void> {
  await updateAccount(accountId, (account) => {
    if ((account.tradePlans ?? []).some((candidate) => candidate.id === plan.id)) return { account, result: undefined };
    const event: PlanEvent = {
      id: randomUUID(), planId: plan.id, accountId, fromStatus: null, toStatus: plan.status,
      actor: 'planner', reason: 'Falsifiable plan hypothesis created.', timeframe: traderConfig.HTF_TIMEFRAMES[0] as Timeframe,
      engineVersion: plan.engineVersions['market-structure'], occurredAt: plan.createdAt,
    };
    return { account: { ...account, tradePlans: [...(account.tradePlans ?? []), plan], planEvents: [...(account.planEvents ?? []), event] }, result: undefined };
  }, writeFence);
}

export async function listStoredTradePlans(accountId: string): Promise<TradePlan[]> {
  const account = await getAccount(accountId);
  return account.tradePlans ?? [];
}

export interface StoredPlanExecutionResult {
  plans: TradePlan[];
  events: PlanEvent[];
  orders: PendingPaperOrder[];
  filled: number;
  shadowSignals: Array<{ planId: string; symbol: string; candleTime: number; reason: string }>;
}

export async function advanceStoredTradePlans(input: {
  accountId: string;
  symbol: string;
  timeframe: Timeframe;
  candle: Candle;
  candles: Candle[];
  shadowMode?: boolean;
  entriesAllowed?: boolean;
  writeFence?: PaperAccountWriteFence;
}): Promise<StoredPlanExecutionResult> {
  const candleValues = [input.candle.time, input.candle.open, input.candle.high, input.candle.low, input.candle.close, input.candle.volume];
  if (candleValues.some((value) => !Number.isFinite(value)) || input.candle.time < 0
    || input.candle.open <= 0 || input.candle.high <= 0 || input.candle.low <= 0 || input.candle.close <= 0 || input.candle.volume < 0
    || input.candle.high < Math.max(input.candle.open, input.candle.close, input.candle.low)
    || input.candle.low > Math.min(input.candle.open, input.candle.close, input.candle.high)) {
    throw new Error('Paper execution requires a valid finite OHLCV market price.');
  }
  if (!isClosed(input.candle, input.timeframe, Date.now(), traderConfig.CLOSE_GRACE_MS)) {
    throw new Error('Paper execution requires a boundary-verified closed candle.');
  }
  const isShadow = input.shadowMode ?? traderConfig.SHADOW_MODE_ENABLED;
  const promotedSetups = isShadow ? new Set<string>() : await activePromotedSetups();
  const eventRisk = await getEventRiskStatus(input.symbol);
  const riskMarks: Record<string, number> = { [input.symbol]: input.candle.close };
  const observedAccount = await getAccount(input.accountId);
  const hasEntryCandidate = (observedAccount.tradePlans ?? []).some((plan) =>
    plan.symbol === input.symbol
      && (plan.triggerTimeframe ?? traderConfig.TRIGGER_TIMEFRAMES[0]) === input.timeframe
      && ['WATCHING', 'ARMED', 'PENDING_ORDER'].includes(plan.status));
  if (input.entriesAllowed === true && hasEntryCandidate) await assertPaperAccountIntegrity(input.accountId, observedAccount);
  const marksToLoad = [...new Set(observedAccount.positions
    .filter((position) => position.status === 'open' && position.symbol !== input.symbol)
    .map((position) => position.symbol))];
  await Promise.all(marksToLoad.map(async (symbol) => {
    if (process.env.NODE_ENV === 'test') {
      const position = observedAccount.positions.find((candidate) => candidate.status === 'open' && candidate.symbol === symbol);
      if (position) riskMarks[symbol] = position.entryPrice;
      return;
    }
    try {
      const series = await fetchMarketData(symbol, '1m', 3, { priority: true });
      const closed = freshestClosedCandle(series.candles, '1m', series.stale);
      if (!closed) return;
      riskMarks[symbol] = closed.close;
    } catch {
      // A missing current mark blocks new risk; entry-price fallback is diagnostic only.
    }
  }));
  return updateAccount(input.accountId, (startingAccount) => {
    let account = startingAccount;
    const checkpoint = candleCheckpoint(input.symbol, input.timeframe, 'executor');
    if (account.processedCandles?.[checkpoint] === input.candle.time) {
      return { account, result: { plans: account.tradePlans ?? [], events: [], orders: account.pendingPaperOrders ?? [], filled: 0, shadowSignals: [] } };
    }
    const events: PlanEvent[] = [];
    const shadowSignals: StoredPlanExecutionResult['shadowSignals'] = [];
    let filled = 0;
    const barIndex = candleIndex(input.timeframe, input.candle.time);
    const plans = [...(account.tradePlans ?? [])];
    const pendingOrders = [...(account.pendingPaperOrders ?? [])];
    for (let index = 0; index < plans.length; index += 1) {
      const plan = plans[index]!;
      if (plan.symbol !== input.symbol || (plan.triggerTimeframe ?? traderConfig.TRIGGER_TIMEFRAMES[0]) !== input.timeframe || !['WATCHING', 'ARMED', 'PENDING_ORDER'].includes(plan.status)) continue;
      let gateResult: EntryGateResult = { approved: false, quantity: 0, reason: 'Entry gates have not passed.' };
      const gate = (entryPrice: number): EntryGateResult => {
        if (input.entriesAllowed !== true) return gateResult = { approved: false, quantity: 0, reason: 'Entry paused: trigger candle freshness was not verified or exceeds the configured maximum entry age.' };
        const eventDecision = evaluateEventEntryGate(eventRisk, traderConfig.EVENT_BLACKOUT_MIN_IMPACT);
        if (!eventDecision.approved) return gateResult = { approved: false, quantity: 0, reason: eventDecision.reason, activeEventIds: eventDecision.activeEventIds };
        const market = getMarket(plan.symbol);
        const availability = getMarketAvailability().find((candidate) => candidate.symbol === plan.symbol)?.status;
        if (!market?.isActive || market.priceCurrency !== 'USD' || availability !== 'available') return gateResult = { approved: false, quantity: 0, reason: availability === 'unavailable' ? 'Market is unavailable from the configured provider.' : availability === 'unverified' ? 'Market availability is unverified; entry is blocked.' : 'Market is inactive or not USD quoted.' };
        if (plan.side !== 'long') return gateResult = { approved: false, quantity: 0, reason: 'Spot paper accounts only support long entries.' };
        if (!traderConfig.ALLOWED_GRADES.includes(plan.grade) || !traderConfig.ALLOWED_SETUP_TYPES.includes(plan.setupType)) return gateResult = { approved: false, quantity: 0, reason: 'Setup grade or type is not enabled.' };
        if (!isShadow && !promotedSetups.has(plan.setupType)) return gateResult = { approved: false, quantity: 0, reason: 'Setup has not passed the server-validated research promotion gate.' };
        const target = plan.targets[0]?.price;
        const stopDistance = entryPrice - plan.invalidation;
        if (!target || stopDistance <= 0 || (target - entryPrice) / stopDistance < Math.max(traderConfig.MIN_RR, plan.minRR)) return gateResult = { approved: false, quantity: 0, reason: 'Plan risk/reward is below the configured minimum.' };
        const instant = input.candle.time * 1000;
        const dayStart = new Date(instant).setUTCHours(0, 0, 0, 0);
        const openPositions = account.positions.filter((position) => position.status === 'open');
        const dailyEntries = new Map<string, string>();
        for (const trade of account.trades) if (Date.parse(trade.openedAt) >= dayStart) dailyEntries.set(trade.positionId, trade.symbol);
        for (const position of account.positions) if (Date.parse(position.openedAt) >= dayStart) dailyEntries.set(position.id, position.symbol);
        if (dailyEntries.size >= traderConfig.MAX_TRADES_PER_DAY) return gateResult = { approved: false, quantity: 0, reason: `Daily trade cap reached (${traderConfig.MAX_TRADES_PER_DAY}).` };
        const symbolEntries = [...dailyEntries.values()].filter((symbol) => symbol === plan.symbol).length;
        if (symbolEntries >= traderConfig.MAX_TRADES_PER_SYMBOL_PER_DAY) return gateResult = { approved: false, quantity: 0, reason: `Daily trade cap for ${plan.symbol} reached (${traderConfig.MAX_TRADES_PER_SYMBOL_PER_DAY}).` };
        if (openPositions.some((position) => position.symbol === plan.symbol)) return gateResult = { approved: false, quantity: 0, reason: 'A paper position is already open for this symbol.' };
        if (openPositions.length >= traderConfig.MAX_CONCURRENT_POSITIONS) return gateResult = { approved: false, quantity: 0, reason: 'Maximum concurrent paper positions reached.' };
        const cluster = getCorrelationCluster(plan.symbol);
        const correlated = openPositions.filter((position) => getCorrelationCluster(position.symbol) === cluster).length;
        if (cluster && correlated >= traderConfig.MAX_CORRELATED_POSITIONS) return gateResult = { approved: false, quantity: 0, reason: 'Correlation cluster limit reached.' };
        const weekStart = dayStart - ((new Date(dayStart).getUTCDay() + 6) % 7) * 86_400_000;
        const dailyPnl = account.trades.filter((trade) => Date.parse(trade.closedAt) >= dayStart).reduce((sum, trade) => sum + trade.realizedPnl, 0);
        const weeklyPnl = account.trades.filter((trade) => Date.parse(trade.closedAt) >= weekStart).reduce((sum, trade) => sum + trade.realizedPnl, 0);
        const snapshot = markToMarket(account, riskMarks);
        if (snapshot.missingMarkSymbols.length > 0) return gateResult = {
          approved: false, quantity: 0,
          reason: `Risk approval requires a fresh mark for every open position: ${snapshot.missingMarkSymbols.join(', ')}.`,
        };
        if (dailyPnl <= -(snapshot.equity * traderConfig.DAILY_LOSS_STOP_PCT / 100)) return gateResult = { approved: false, quantity: 0, reason: 'Daily loss limit reached.' };
        if (weeklyPnl <= -(snapshot.equity * traderConfig.WEEKLY_LOSS_STOP_PCT / 100)) return gateResult = { approved: false, quantity: 0, reason: 'Weekly loss limit reached.' };
        if (snapshot.drawdownPct >= traderConfig.MAX_DRAWDOWN_PCT) return gateResult = { approved: false, quantity: 0, reason: 'Maximum drawdown limit reached.' };
        const cooldownReason = lossStreakCooldownReason({
          trades: account.trades,
          closedPositionIds: new Set(account.positions.filter((position) => position.status === 'closed').map((position) => position.id)),
          asOfMs: (input.candle.time + candleSeconds(input.timeframe, input.candle.time)) * 1000,
          timeframe: input.timeframe,
        });
        if (cooldownReason) return gateResult = { approved: false, quantity: 0, reason: cooldownReason };
        const sizing = calculatePositionSize({
          equity: snapshot.equity, entry: entryPrice, invalidation: plan.invalidation, cash: account.cash,
          grossExposure: snapshot.grossExposure,
          symbolExposure: snapshot.positions.filter((position) => position.position.symbol === plan.symbol).reduce((sum, position) => sum + position.currentPrice * position.position.quantity, 0),
        });
        if (!sizing.accepted) return gateResult = { approved: false, quantity: 0, reason: sizing.reason };
        const openRisk = openPositions.reduce((sum, position) => sum + estimateOpenLongStopRisk(position), 0);
        const heatHeadroom = Math.max(0, snapshot.equity * traderConfig.MAX_PORTFOLIO_HEAT_PCT / 100 - openRisk);
        const quantity = Math.min(sizing.quantity, heatHeadroom / sizing.perUnitRisk);
        if (quantity <= 0) return gateResult = { approved: false, quantity: 0, reason: 'Portfolio heat limit reached.' };
        gateResult = { approved: true, quantity };
        return gateResult;
      };

      const previousCandle = input.candles.at(-2);
      const step = advanceTradePlan({
        plan, candle: input.candle, previousCandle, recentCandles: input.candles.slice(-20), barIndex,
        timeframe: input.timeframe, pendingOrder: pendingOrders.find((order) => order.planId === plan.id && order.status === 'pending'), gate,
      });
      let nextPlan = step.plan;
      if (isShadow && (plan.status !== 'PENDING_ORDER' && step.plan.status === 'PENDING_ORDER' || step.fill !== undefined)) {
        const signalKey = `${plan.id}:${input.candle.time}`;
        if (!(account.shadowSignals ?? []).some((signal) => `${signal.planId}:${signal.candleTime}` === signalKey)) {
          shadowSignals.push({ planId: plan.id, symbol: plan.symbol, candleTime: input.candle.time, reason: step.fill ? 'Shadow order would have filled on this later candle; no paper position was opened.' : 'Trigger confirmed; shadow order queued without opening a paper position.' });
        }
        nextPlan = { ...plan, status: 'PENDING_ORDER', lastReason: step.fill ? 'Shadow order would have filled; live paper opening is disabled.' : 'Trigger confirmed; shadow order queued without opening a paper position.', updatedAt: new Date(input.candle.time * 1000).toISOString() };
        for (const event of step.events) if (event.toStatus !== 'PENDING_ORDER' && event.toStatus !== 'OPEN') events.push(event);
        if (step.pendingOrder) {
          const shadowOrder = { ...step.pendingOrder, status: 'pending' as const };
          const existing = pendingOrders.findIndex((order) => order.id === shadowOrder.id);
          if (existing >= 0) pendingOrders[existing] = shadowOrder;
          else pendingOrders.push(shadowOrder);
        }
        if (step.plan.status === 'PENDING_ORDER' && plan.status !== 'PENDING_ORDER') events.push({
          id: randomUUID(), planId: plan.id, accountId: input.accountId, fromStatus: plan.status, toStatus: 'PENDING_ORDER',
          actor: 'executor', reason: 'Shadow trigger confirmed; pending order remains simulated only.', candle: input.candle,
          timeframe: input.timeframe, occurredAt: new Date(input.candle.time * 1000).toISOString(),
        });
      } else {
        nextPlan = { ...step.plan, lastReason: step.reason, activeEventIds: step.plan.activeEventIds ?? [] };
        events.push(...step.events);
        if (step.pendingOrder) {
          const existing = pendingOrders.findIndex((order) => order.id === step.pendingOrder!.id);
          if (existing >= 0) pendingOrders[existing] = step.pendingOrder;
          else pendingOrders.push(step.pendingOrder);
        }
        if (step.fill) {
          const fill = step.fill;
          const decision = { decision: 'BUY' as const, entry: fill.price, invalidation: plan.invalidation, targets: plan.targets.map(({ price }) => ({ price })), timestamp: new Date(input.candle.time * 1000).toISOString() };
          const result = simulatePaperOrder(account, {
            orderId: fill.order.id, positionId: `position-${fill.order.id}`, decisionId: `plan-${plan.id}`,
            assetId: plan.symbol, symbol: plan.symbol, decision, riskApproved: true, portfolioApproved: true,
            quantity: fill.order.quantity, requestedPrice: fill.price, feeRate: traderConfig.FEE_RATE, slippageRate: traderConfig.SLIPPAGE_RATE,
            stopLoss: plan.invalidation, takeProfit: plan.targets[0]?.price, targets: plan.targets,
            planId: plan.id, datasetId: plan.datasetId, executionVersion: 'paper-simulator-1.0.0', timestamp: decision.timestamp,
          });
          if (!result.accepted) {
            nextPlan = { ...plan, status: 'CANCELLED', updatedAt: decision.timestamp };
            events.push({ id: randomUUID(), planId: plan.id, accountId: input.accountId, fromStatus: 'PENDING_ORDER', toStatus: 'CANCELLED', actor: 'executor', reason: result.reason ?? 'Paper account rejected the filled order.', candle: input.candle, timeframe: input.timeframe, occurredAt: decision.timestamp });
          } else {
            account = result.account;
            filled += 1;
          }
        }
      }
      plans[index] = nextPlan;
    }
    account = {
      ...account, tradePlans: plans, pendingPaperOrders: pendingOrders,
      planEvents: [...(account.planEvents ?? []), ...events],
      shadowSignals: [...(account.shadowSignals ?? []), ...shadowSignals].slice(-500),
      processedCandles: { ...account.processedCandles, [checkpoint]: input.candle.time },
    };
    return { account, result: { plans, events, orders: pendingOrders, filled, shadowSignals } };
  }, input.writeFence);
}

function ledgerEvents(previous: PaperAccountState, next: PaperAccountState) {
  const events: Array<{ idempotencyKey: string; eventType: string; payload: unknown }> = [];
  const add = (eventType: string, idempotencyKey: string, payload: unknown) => events.push({ eventType, idempotencyKey, payload });
  const previousPlanEvents = new Set((previous.planEvents ?? []).map((event) => event.id));
  for (const event of next.planEvents ?? []) if (!previousPlanEvents.has(event.id)) add('plan.event', `plan-event:${event.id}`, event);
  const previousTrades = new Set(previous.trades.map((trade) => trade.id));
  for (const trade of next.trades) if (!previousTrades.has(trade.id)) {
    add('paper.trade.closed', `trade:${trade.id}`, trade);
    add('paper.fill.exit', `exit-fill:${trade.id}`, trade);
  }
  const previousShadows = new Set((previous.shadowSignals ?? []).map((signal) => `${signal.planId}:${signal.candleTime}`));
  for (const signal of next.shadowSignals ?? []) {
    const key = `${signal.planId}:${signal.candleTime}`;
    if (!previousShadows.has(key)) add('shadow.signal', `shadow:${key}`, signal);
  }
  const previousOrders = new Map((previous.pendingPaperOrders ?? []).map((order) => [order.id, order]));
  for (const order of next.pendingPaperOrders ?? []) {
    if (JSON.stringify(previousOrders.get(order.id)) !== JSON.stringify(order)) add('paper.order', `order:${order.id}:${order.status}`, order);
  }
  const previousPositions = new Map(previous.positions.map((position) => [position.id, position]));
  for (const position of next.positions) {
    if (JSON.stringify(previousPositions.get(position.id)) !== JSON.stringify(position)) {
      if (position.status === 'open' && previousPositions.get(position.id)?.status !== 'open') {
        add('paper.fill', `fill:${position.id}`, { position, orderId: position.orderId ?? position.id, candleTime: Date.parse(position.openedAt) / 1000 });
      }
    }
  }
  const previousJournal = new Set((previous.tradeJournal ?? []).map((entry) => entry.id));
  for (const entry of next.tradeJournal ?? []) if (!previousJournal.has(entry.id)) add('trade.journal', `journal:${entry.id}`, entry);
  const previousReviews = new Set((previous.dailyReviews ?? []).map((review) => review.reviewDate));
  for (const review of next.dailyReviews ?? []) if (!previousReviews.has(review.reviewDate)) add('daily.review', `review:${review.reviewDate}`, review);
  const previousGates = new Set((previous.executionGateResults ?? []).map((entry) => entry.id));
  for (const entry of next.executionGateResults ?? []) if (!previousGates.has(entry.id)) add('risk.gate', `risk-gate:${entry.id}`, entry);
  return events;
}

async function updateAccount<T>(
  accountId: string,
  update: (account: PaperAccountState) => { account: PaperAccountState; result: T },
  writeFence?: PaperAccountWriteFence,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const loaded = await loadAccount(accountId);
    const changed = update(loaded.account);
    if (process.env.NODE_ENV === 'test') {
      testAccounts.set(accountId, changed.account);
      return changed.result;
    }
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('record_paper_account_update', {
      p_account_id: accountId,
      p_expected_version: loaded.version,
      p_state: changed.account,
      p_events: ledgerEvents(loaded.account, changed.account),
      p_lease_owner_id: writeFence?.ownerId ?? null,
      p_lease_fencing_token: writeFence?.fencingToken ?? null,
    });
    if (error) throw new Error(`Could not atomically record paper account and ledger update: ${error.message}`);
    if (Number(data) >= 0) return changed.result;
  }
  throw new Error('Paper account changed concurrently too many times. Please retry.');
}

function recordPaperTrade(account: PaperAccountState, trade: PaperTrade, timeframe: Timeframe, candle?: Candle): PaperAccountState {
  if ((account.tradeJournal ?? []).some((entry) => entry.id === trade.id)) return account;
  const position = account.positions.find((candidate) => candidate.id === trade.positionId);
  const plan = position?.planId ? account.tradePlans?.find((candidate) => candidate.id === position.planId) : undefined;
  const risk = (position?.initialRisk ?? 0) * trade.quantity;
  const timestamp = trade.closedAt;
  let updated = account;
  if (plan && position?.status === 'closed') {
    const event: PlanEvent = { id: randomUUID(), planId: plan.id, accountId: account.accountId, fromStatus: plan.status, toStatus: 'CLOSED', actor: 'manager', reason: trade.exitReason ?? 'Paper position closed.', candle, timeframe, occurredAt: timestamp };
    updated = { ...updated, tradePlans: updated.tradePlans?.map((candidate) => candidate.id === plan.id ? { ...candidate, status: 'CLOSED', updatedAt: timestamp } : candidate), planEvents: [...(updated.planEvents ?? []), event] };
  }
  const journal = {
    id: trade.id, planId: position?.planId, accountId: account.accountId, symbol: trade.symbol,
    datasetId: plan?.datasetId ?? position?.datasetId ?? 'manual-paper', configHash: createHash('sha256').update(JSON.stringify(traderConfig)).digest('hex'),
    engineVersions: plan?.engineVersions ?? position?.engineVersions ?? {},
    active_event_ids: plan?.activeEventIds ?? [],
    metrics: { rMultiple: risk > 0 ? trade.realizedPnl / risk : 0, pnl: trade.realizedPnl, fees: trade.fees, quantity: trade.quantity,
      barsHeld: position?.barsHeld ?? 0, entryPrice: trade.entryPrice, exitPrice: trade.exitPrice,
      maeR: trade.maeR, mfeR: trade.mfeR, exitReason: trade.exitReason ?? 'paper-exit' },
    createdAt: timestamp,
  };
  return { ...updated, tradeJournal: [...(updated.tradeJournal ?? []), journal] };
}

export async function closeOpenPaperPosition(accountId: string, symbol: string): Promise<PaperTrade> {
  const series = await fetchMarketData(symbol, '1m', 3, { priority: true });
  const candle = freshestClosedCandle(series.candles, '1m', series.stale);
  const exitPrice = candle?.close;
  if (!candle || !exitPrice) throw new Error('A fresh, closed market price is unavailable; the paper position was not changed.');
  return updateAccount(accountId, (account) => {
    const result = closePaperPosition(account, symbol, exitPrice, traderConfig.FEE_RATE, 'paper-simulator-1.0.0', `trade-${Date.now()}`, undefined, candle, traderConfig.SLIPPAGE_RATE);
    if ('error' in result) throw new Error(result.error);
    return { account: recordPaperTrade(result.account, result.trade, '1m', candle), result: result.trade };
  });
}

export async function manageOpenPositions(accountId: string, symbol: string, candle: Candle, history: Candle[] = [candle], invalidationCandles: Candle[] = [], timeframe: Timeframe = traderConfig.MGMT_TIMEFRAME as Timeframe, writeFence?: PaperAccountWriteFence): Promise<PaperTrade[]> {
  return updateAccount(accountId, (startingAccount) => {
    const checkpoint = candleCheckpoint(symbol, timeframe, 'manager');
    if (startingAccount.processedCandles?.[checkpoint] === candle.time) return { account: startingAccount, result: [] };
    let account = startingAccount;
    const closedTrades: PaperTrade[] = [];
    const openPositions = account.positions.filter((position) => position.status === 'open' && position.symbol === symbol);
    const atrSeries = atr(history, 14);
    const currentAtr = atrSeries.at(-1);
    const structure = analyzeMarketStructure(history);
    const swingLow = structure.lows.at(-1)?.value;
    const swingHigh = structure.highs.at(-1)?.value;
    for (const position of openPositions) {
      const plan = position.planId ? account.tradePlans?.find((candidate) => candidate.id === position.planId) : undefined;
      const invalidationCandle = position.thesisInvalidatedAt || plan?.side !== 'long' || position.side !== 'buy'
        ? undefined
        : invalidationCandles
          .filter((candidate) => {
            const closesAt = (candidate.time + candleSeconds('4h', candidate.time)) * 1000;
            return closesAt > Date.parse(position.openedAt) && closesAt <= candle.time * 1000 && candidate.close < plan.invalidation;
          })
          .sort((left, right) => left.time - right.time)[0];
      const thesisInvalidatedAt = position.thesisInvalidatedAt ?? (invalidationCandle
        ? new Date((invalidationCandle.time + candleSeconds('4h', invalidationCandle.time)) * 1000).toISOString()
        : undefined);
      const observedPosition = thesisInvalidatedAt ? { ...position, thesisInvalidatedAt } : position;
      const managed = managePaperPosition({
        position: observedPosition,
        candle,
        atr: currentAtr,
        swingLow,
        swingHigh,
        thesisInvalidatedAt,
      });
      account = { ...account, positions: account.positions.map((candidate) => candidate.id === position.id
        ? {
            ...candidate,
            stopLoss: managed.position.stopLoss,
            targetsTaken: managed.position.targetsTaken,
            barsHeld: managed.position.barsHeld,
            maxFavorablePrice: managed.position.maxFavorablePrice,
            maxAdversePrice: managed.position.maxAdversePrice,
            thesisInvalidatedAt: managed.position.thesisInvalidatedAt,
            managementEvents: [...(position.managementEvents ?? []), ...managed.actions.map((action) => ({
              occurredAt: new Date(candle.time * 1000).toISOString(),
              action,
            }))],
          }
        : candidate) };
      for (const exit of managed.exits) {
        const result = reducePaperPosition(account, position.id, exit.quantity, exit.price, traderConfig.FEE_RATE,
          'paper-simulator-1.0.0', `trade-${Date.now()}-${closedTrades.length}`, new Date(candle.time * 1000).toISOString(), exit.reason, candle, traderConfig.SLIPPAGE_RATE);
        if ('trade' in result) {
          account = recordPaperTrade(result.account, result.trade, timeframe, candle);
          closedTrades.push(result.trade);
        }
      }
      const current = account.positions.find((candidate) => candidate.id === position.id);
      if (current && current.status === 'open') {
        account = { ...account, positions: account.positions.map((candidate) => candidate.id === position.id
          ? {
              ...managed.position,
              quantity: current.quantity,
              entryFee: current.entryFee,
              managementEvents: [...(position.managementEvents ?? []), ...managed.actions.map((action) => ({
                occurredAt: new Date(candle.time * 1000).toISOString(),
                action,
              }))],
            }
          : candidate) };
      }
    }
    return { account: { ...account, processedCandles: { ...account.processedCandles, [checkpoint]: candle.time } }, result: closedTrades };
  }, writeFence);
}

export async function generateDailyAccountReview(accountId: string, reviewDate: string): Promise<void> {
  await updateAccount(accountId, (account) => {
    if ((account.dailyReviews ?? []).some((review) => review.reviewDate === reviewDate)) return { account, result: undefined };
    const samples: JournalSample[] = (account.tradeJournal ?? []).map((entry) => {
      const metrics = entry.metrics;
      return {
        rMultiple: Number(metrics.rMultiple ?? 0), pnl: Number(metrics.pnl ?? 0), barsHeld: Number(metrics.barsHeld ?? 0),
        symbol: entry.symbol, setupType: account.tradePlans?.find((plan) => plan.id === entry.planId)?.setupType ?? 'trend-pullback',
        regime: 'unknown', grade: account.tradePlans?.find((plan) => plan.id === entry.planId)?.grade ?? 'unknown',
      };
    });
    const metrics = computeResearchMetrics(samples, 0);
    const dayStart = Date.parse(`${reviewDate}T00:00:00.000Z`);
    const planReasons = (account.planEvents ?? []).filter((event) => Date.parse(event.occurredAt) >= dayStart && Date.parse(event.occurredAt) < dayStart + 86_400_000)
      .map((event) => event.reason);
    const review = createDailyReview({ accountId, reviewDate, planReasons, metrics });
    return { account: { ...account, dailyReviews: [...(account.dailyReviews ?? []), { ...review, metrics }].slice(-365) }, result: undefined };
  });
}

function candleCheckpoint(symbol: string, timeframe: string, role = 'executor'): string {
  return `${symbol}:${role}:${timeframe}`;
}

export async function wasCandleProcessed(accountId: string, symbol: string, timeframe: string, time: number, role = 'executor'): Promise<boolean> {
  const { account } = await loadAccount(accountId);
  const checkpoints = account.processedCandles ?? {};
  return checkpoints[candleCheckpoint(symbol, timeframe, role)] === time
    || role === 'executor' && checkpoints[`${symbol}:${timeframe}`] === time;
}

export async function markCandleProcessed(accountId: string, symbol: string, timeframe: string, time: number, role = 'executor'): Promise<void> {
  await updateAccount(accountId, (account) => {
    const key = candleCheckpoint(symbol, timeframe, role);
    return {
      account: { ...account, processedCandles: { ...account.processedCandles, [key]: time } },
      result: undefined,
    };
  });
}
