import { closePaperPosition, reducePaperPosition, simulatePaperOrder, type PaperAccountState, type PaperOrderRequest, type PaperOrderResult, type PaperTrade } from '../engines/paper-execution';
import type { Candle } from '../../../src/lib/types';
import { getMarket } from '../../../src/lib/markets';
import type { TradeDecision } from '../engines/decision-engine';
import { atr } from '../../../src/lib/indicators';
import { analyzeMarketStructure } from '../../../src/lib/market-structure';
import { getSupabaseClient, getSupabaseClientWithToken } from '../db';
import { fetchMarketData } from './marketDataService';
import { traderConfig } from '../trader/config';
import { calculatePositionSize, markToMarket } from '../trader/risk';
import { managePaperPosition } from '../trader/manager';
import { advanceTradePlan, type EntryGateResult } from '../trader/executor';
import { getCorrelationCluster } from '../trader/constants';
import type { PendingPaperOrder, PlanEvent, TradePlan } from '../trader/types';
import type { Timeframe } from '../../../src/lib/types';
import { randomUUID, createHash } from 'node:crypto';
import { computeResearchMetrics, createDailyReview, type JournalSample } from '../trader/research';
import { getMarketAvailability } from './marketAvailability';
import { evaluateEventEntryGate, getEventRiskStatus } from '../trader/event-risk';

const testAccounts = new Map<string, PaperAccountState>();

interface LoadedAccount {
  account: PaperAccountState;
  version: number;
}

async function loadAccount(accountId: string, accessToken?: string): Promise<LoadedAccount> {
  if (!accountId) throw new Error('An account ID is required.');
  if (process.env.NODE_ENV === 'test') {
    const account = testAccounts.get(accountId);
    if (account) return { account, version: 0 };
    const created = { accountId, cash: traderConfig.TRADER_STARTING_EQUITY, positions: [], trades: [] };
    testAccounts.set(accountId, created);
    return { account: created, version: 0 };
  }
  const supabase = accessToken ? getSupabaseClientWithToken(accessToken) : getSupabaseClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('paper_sim_accounts')
      .select('state,version')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) throw new Error(`Could not load paper account: ${error.message}`);
    if (data?.state) return { account: data.state as PaperAccountState, version: Number(data.version) };

    const account: PaperAccountState = { accountId, cash: traderConfig.TRADER_STARTING_EQUITY, positions: [], trades: [] };
    const { error: insertError } = await supabase.from('paper_sim_accounts').insert({ account_id: accountId, state: account, version: 0 });
    if (!insertError) return { account, version: 0 };
    if (insertError.code !== '23505') throw new Error(`Could not create paper account: ${insertError.message}`);
  }
  throw new Error('Could not initialize paper account after concurrent creation.');
}

export function getAccount(accountId = 'autonomy:default', accessToken?: string) {
  return loadAccount(accountId, accessToken).then(({ account }) => account);
}

export async function storeTradePlan(accountId: string, plan: TradePlan, accessToken?: string): Promise<void> {
  await updateAccount(accountId, (account) => {
    if ((account.tradePlans ?? []).some((candidate) => candidate.id === plan.id)) return { account, result: undefined };
    const event: PlanEvent = {
      id: randomUUID(), planId: plan.id, accountId, fromStatus: null, toStatus: plan.status,
      actor: 'planner', reason: 'Falsifiable plan hypothesis created.', timeframe: traderConfig.HTF_TIMEFRAMES[0] as Timeframe,
      engineVersion: plan.engineVersions['market-structure'], occurredAt: plan.createdAt,
    };
    return { account: { ...account, tradePlans: [...(account.tradePlans ?? []), plan], planEvents: [...(account.planEvents ?? []), event] }, result: undefined };
  }, accessToken);
}

export async function listStoredTradePlans(accountId: string, accessToken?: string): Promise<TradePlan[]> {
  const account = await getAccount(accountId, accessToken);
  return account.tradePlans ?? [];
}

export interface StoredPlanExecutionResult {
  plans: TradePlan[];
  events: PlanEvent[];
  orders: PendingPaperOrder[];
  filled: number;
  shadowSignals: Array<{ planId: string; candleTime: number; reason: string }>;
}

export async function advanceStoredTradePlans(input: {
  accountId: string;
  symbol: string;
  timeframe: Timeframe;
  candle: Candle;
  candles: Candle[];
  shadowMode?: boolean;
  accessToken?: string;
}): Promise<StoredPlanExecutionResult> {
  const eventRisk = await getEventRiskStatus(input.symbol);
  return updateAccount(input.accountId, (startingAccount) => {
    let account = startingAccount;
    const checkpoint = candleCheckpoint(input.symbol, input.timeframe, 'executor');
    if (account.processedCandles?.[checkpoint] === input.candle.time) {
      return { account, result: { plans: account.tradePlans ?? [], events: [], orders: account.pendingPaperOrders ?? [], filled: 0, shadowSignals: [] } };
    }
    const events: PlanEvent[] = [];
    const shadowSignals: StoredPlanExecutionResult['shadowSignals'] = [];
    let filled = 0;
    const timeframeSeconds: Record<Timeframe, number> = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800, '1M': 2592000 };
    const barIndex = Math.floor(input.candle.time / timeframeSeconds[input.timeframe]);
    const plans = [...(account.tradePlans ?? [])];
    const pendingOrders = [...(account.pendingPaperOrders ?? [])];
    const isShadow = input.shadowMode ?? traderConfig.SHADOW_MODE_ENABLED;

    for (let index = 0; index < plans.length; index += 1) {
      const plan = plans[index]!;
      if (plan.symbol !== input.symbol || !['WATCHING', 'ARMED', 'PENDING_ORDER'].includes(plan.status)) continue;
      let gateResult: EntryGateResult = { approved: false, quantity: 0, reason: 'Entry gates have not passed.' };
      const gate = (entryPrice: number): EntryGateResult => {
        const eventDecision = evaluateEventEntryGate(eventRisk, traderConfig.EVENT_BLACKOUT_MIN_IMPACT);
        if (!eventDecision.approved) return gateResult = { approved: false, quantity: 0, reason: eventDecision.reason, activeEventIds: eventDecision.activeEventIds };
        const market = getMarket(plan.symbol);
        const availability = getMarketAvailability().find((candidate) => candidate.symbol === plan.symbol)?.status;
        if (!market?.isActive || market.priceCurrency !== 'USD' || availability !== 'available') return gateResult = { approved: false, quantity: 0, reason: availability === 'unavailable' ? 'Market is unavailable from the configured provider.' : availability === 'unverified' ? 'Market availability is unverified; entry is blocked.' : 'Market is inactive or not USD quoted.' };
        if (plan.side !== 'long') return gateResult = { approved: false, quantity: 0, reason: 'Spot paper accounts only support long entries.' };
        if (!traderConfig.ALLOWED_GRADES.includes(plan.grade) || !traderConfig.ALLOWED_SETUP_TYPES.includes(plan.setupType)) return gateResult = { approved: false, quantity: 0, reason: 'Setup grade or type is not enabled.' };
        if (!isShadow && !traderConfig.PROMOTED_SETUP_TYPES.includes(plan.setupType)) return gateResult = { approved: false, quantity: 0, reason: 'Setup has not passed the forward-evidence promotion gate.' };
        const target = plan.targets[0]?.price;
        const stopDistance = entryPrice - plan.invalidation;
        if (!target || stopDistance <= 0 || (target - entryPrice) / stopDistance < Math.max(traderConfig.MIN_RR, plan.minRR)) return gateResult = { approved: false, quantity: 0, reason: 'Plan risk/reward is below the configured minimum.' };
        const openPositions = account.positions.filter((position) => position.status === 'open');
        if (openPositions.some((position) => position.symbol === plan.symbol)) return gateResult = { approved: false, quantity: 0, reason: 'A paper position is already open for this symbol.' };
        if (openPositions.length >= traderConfig.MAX_CONCURRENT_POSITIONS) return gateResult = { approved: false, quantity: 0, reason: 'Maximum concurrent paper positions reached.' };
        const cluster = getCorrelationCluster(plan.symbol);
        const correlated = openPositions.filter((position) => getCorrelationCluster(position.symbol) === cluster).length;
        if (cluster && correlated >= traderConfig.MAX_CORRELATED_POSITIONS) return gateResult = { approved: false, quantity: 0, reason: 'Correlation cluster limit reached.' };
        const instant = input.candle.time * 1000;
        const dayStart = new Date(instant).setUTCHours(0, 0, 0, 0);
        const weekStart = dayStart - ((new Date(dayStart).getUTCDay() + 6) % 7) * 86_400_000;
        const dailyPnl = account.trades.filter((trade) => Date.parse(trade.closedAt) >= dayStart).reduce((sum, trade) => sum + trade.realizedPnl, 0);
        const weeklyPnl = account.trades.filter((trade) => Date.parse(trade.closedAt) >= weekStart).reduce((sum, trade) => sum + trade.realizedPnl, 0);
        const markPrices: Record<string, number> = { [plan.symbol]: input.candle.close };
        for (const position of openPositions) if (markPrices[position.symbol] === undefined) markPrices[position.symbol] = position.entryPrice;
        const snapshot = markToMarket(account, markPrices);
        if (dailyPnl <= -(snapshot.equity * traderConfig.DAILY_LOSS_STOP_PCT / 100)) return gateResult = { approved: false, quantity: 0, reason: 'Daily loss limit reached.' };
        if (weeklyPnl <= -(snapshot.equity * traderConfig.WEEKLY_LOSS_STOP_PCT / 100)) return gateResult = { approved: false, quantity: 0, reason: 'Weekly loss limit reached.' };
        if (snapshot.drawdownPct >= traderConfig.MAX_DRAWDOWN_PCT) return gateResult = { approved: false, quantity: 0, reason: 'Maximum drawdown limit reached.' };
        const sizing = calculatePositionSize({
          equity: snapshot.equity, entry: entryPrice, invalidation: plan.invalidation, cash: account.cash,
          grossExposure: snapshot.grossExposure,
          symbolExposure: snapshot.positions.filter((position) => position.position.symbol === plan.symbol).reduce((sum, position) => sum + position.currentPrice * position.position.quantity, 0),
        });
        if (!sizing.accepted) return gateResult = { approved: false, quantity: 0, reason: sizing.reason };
        const openRisk = openPositions.reduce((sum, position) => sum + Math.max(0, (position.entryPrice - (position.stopLoss ?? position.entryPrice)) * position.quantity), 0);
        const heatHeadroom = Math.max(0, snapshot.equity * traderConfig.MAX_PORTFOLIO_HEAT_PCT / 100 - openRisk);
        const quantity = Math.min(sizing.quantity, heatHeadroom / stopDistance);
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
          shadowSignals.push({ planId: plan.id, candleTime: input.candle.time, reason: step.fill ? 'Shadow order would have filled on this later candle; no paper position was opened.' : 'Trigger confirmed; shadow order queued without opening a paper position.' });
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
            quantity: fill.order.quantity, requestedPrice: fill.price, feeRate: traderConfig.FEE_RATE, slippageRate: 0,
            stopLoss: plan.invalidation, takeProfit: plan.targets[0]?.price, targets: plan.targets,
            planId: plan.id, executionVersion: 'paper-simulator-1.0.0', timestamp: decision.timestamp,
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
  }, input.accessToken);
}

async function updateAccount<T>(
  accountId: string,
  update: (account: PaperAccountState) => { account: PaperAccountState; result: T },
  accessToken?: string,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const loaded = await loadAccount(accountId, accessToken);
    const changed = update(loaded.account);
    if (process.env.NODE_ENV === 'test') {
      testAccounts.set(accountId, changed.account);
      return changed.result;
    }
    const supabase = accessToken ? getSupabaseClientWithToken(accessToken) : getSupabaseClient();
    const { data, error } = await supabase
      .from('paper_sim_accounts')
      .update({ state: changed.account, version: loaded.version + 1 })
      .eq('account_id', accountId)
      .eq('version', loaded.version)
      .select('version')
      .maybeSingle();
    if (error) throw new Error(`Could not update paper account: ${error.message}`);
    if (data) return changed.result;
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
    datasetId: plan?.datasetId ?? 'manual-paper', configHash: createHash('sha256').update(JSON.stringify(traderConfig)).digest('hex'),
    engineVersions: plan?.engineVersions ?? {},
    activeEventIds: plan?.activeEventIds ?? [],
    metrics: { rMultiple: risk > 0 ? trade.realizedPnl / risk : 0, pnl: trade.realizedPnl, fees: trade.fees, quantity: trade.quantity,
      barsHeld: position?.barsHeld ?? 0, entryPrice: trade.entryPrice, exitPrice: trade.exitPrice, exitReason: trade.exitReason ?? 'paper-exit' },
    createdAt: timestamp,
  };
  return { ...updated, tradeJournal: [...(updated.tradeJournal ?? []), journal] };
}

export async function closeOpenPaperPosition(accountId: string, symbol: string, accessToken?: string): Promise<PaperTrade> {
  const candles = (await fetchMarketData(symbol, '1m', 1)).candles;
  const candle = candles.at(-1);
  const exitPrice = candle?.close;
  if (!exitPrice || !Number.isFinite(exitPrice)) throw new Error('A current market price is unavailable.');
  return updateAccount(accountId, (account) => {
    const result = closePaperPosition(account, symbol, exitPrice, traderConfig.FEE_RATE, 'paper-simulator-1.0.0', `trade-${Date.now()}`);
    if ('error' in result) throw new Error(result.error);
    return { account: recordPaperTrade(result.account, result.trade, '1m', candle), result: result.trade };
  }, accessToken);
}

export async function manageOpenPositions(accountId: string, symbol: string, candle: Candle, history: Candle[] = [candle], thesisInvalidated = false, timeframe: Timeframe = traderConfig.MGMT_TIMEFRAME as Timeframe): Promise<PaperTrade[]> {
  return updateAccount(accountId, (startingAccount) => {
    let account = startingAccount;
    const closedTrades: PaperTrade[] = [];
    const openPositions = account.positions.filter((position) => position.status === 'open' && position.symbol === symbol);
    const atrSeries = atr(history, 14);
    const currentAtr = atrSeries.at(-1);
    const swingLow = analyzeMarketStructure(history).lows.at(-1)?.value;
    for (const position of openPositions) {
      const managed = managePaperPosition({
        position,
        candle,
        atr: currentAtr,
        swingLow,
        barIndex: (position.barsHeld ?? 0) + 1,
        invalidationObservedAtBar: thesisInvalidated ? position.barsHeld ?? 0 : undefined,
      });
      account = { ...account, positions: account.positions.map((candidate) => candidate.id === position.id
        ? {
            ...candidate,
            stopLoss: managed.position.stopLoss,
            targetsTaken: managed.position.targetsTaken,
            barsHeld: managed.position.barsHeld,
            maxFavorablePrice: managed.position.maxFavorablePrice,
            managementEvents: [...(position.managementEvents ?? []), ...managed.actions.map((action) => ({
              occurredAt: new Date(candle.time * 1000).toISOString(),
              action,
            }))],
          }
        : candidate) };
      for (const exit of managed.exits) {
        const result = reducePaperPosition(account, position.id, exit.quantity, exit.price, traderConfig.FEE_RATE,
          'paper-simulator-1.0.0', `trade-${Date.now()}-${closedTrades.length}`, new Date(candle.time * 1000).toISOString(), exit.reason);
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
    return { account, result: closedTrades };
  });
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

export async function executeDecision(input: {
  accountId?: string;
  symbol: string;
  decision: TradeDecision;
  processedCandle?: { timeframe: string; time: number };
    marketDataStale?: boolean;
  accessToken?: string;
}) {
  const accountId = input.accountId ?? 'autonomy:default';
  const decision = input.decision;
  const requestedPrice = decision.entry ?? 0;
  const market = getMarket(input.symbol);
  const quoteCurrency = market?.priceCurrency ?? market?.quoteAsset;
  const orderId = `paper-${Date.now()}`;
  const checkpoint = input.processedCandle ? candleCheckpoint(input.symbol, input.processedCandle.timeframe, 'executor') : undefined;
  const accountSnapshot = await getAccount(accountId, input.accessToken);
  const markPrices: Record<string, number> = { [input.symbol]: requestedPrice };
  if (process.env.NODE_ENV !== 'test') {
    await Promise.all(accountSnapshot.positions.filter((position) => position.status === 'open').map(async (position) => {
      const candles = (await fetchMarketData(position.symbol, '1m', 2)).candles;
      const mark = candles.at(-1)?.close;
      if (!mark || !Number.isFinite(mark)) throw new Error('A mark-to-market price is unavailable for an open position.');
      markPrices[position.symbol] = mark;
    }));
  } else {
    for (const position of accountSnapshot.positions.filter((candidate) => candidate.status === 'open')) markPrices[position.symbol] = position.entryPrice;
  }

  return updateAccount<PaperOrderResult>(accountId, (account) => {
    if (quoteCurrency !== 'USD') {
      return {
        account,
        result: { accepted: false, orderId, status: 'rejected', reason: 'Paper accounts support USD-quoted markets only.', account },
      };
    }
    if (checkpoint && account.processedCandles?.[checkpoint] === input.processedCandle?.time) {
      return { account, result: simulatePaperOrder(account, {
        orderId: 'duplicate-candle', positionId: 'duplicate-candle', decisionId: `decision-${decision.timestamp}`,
        assetId: input.symbol, symbol: input.symbol, decision, riskApproved: false, portfolioApproved: false,
        quantity: 0, requestedPrice: 0, feeRate: 0, slippageRate: 0, executionVersion: 'paper-simulator-1.0.0',
      }) };
    }
    const snapshot = markToMarket(account, markPrices);
    const stop = decision.invalidation;
    const target = decision.targets?.[0]?.price;
    const sizing = stop === undefined ? { accepted: false, quantity: 0, reason: 'Invalid stop distance.' } : calculatePositionSize({
      equity: snapshot.equity,
      entry: requestedPrice,
      invalidation: stop,
      cash: account.cash,
      grossExposure: snapshot.grossExposure,
      symbolExposure: snapshot.positions.filter((item) => item.position.symbol === input.symbol)
        .reduce((sum, item) => sum + item.currentPrice * item.position.quantity, 0),
    });
    const quantity = sizing.quantity;
    const riskDistance = stop === undefined ? 0 : Math.abs(requestedPrice - stop);
    const rewardDistance = target === undefined ? 0 : Math.abs(target - requestedPrice);
    const directionValid = decision.decision === 'BUY'
      ? stop !== undefined && target !== undefined && stop < requestedPrice && target > requestedPrice
      : decision.decision === 'SELL'
        ? stop !== undefined && target !== undefined && stop > requestedPrice && target < requestedPrice
        : false;
    const riskApproved = !input.marketDataStale
      && (decision.decision === 'BUY' || decision.decision === 'SELL')
      && requestedPrice > 0
      && stop !== undefined && stop > 0
      && target !== undefined && target > 0
      && directionValid && riskDistance > 0 && rewardDistance / riskDistance >= traderConfig.MIN_RR
      && sizing.accepted
      && quantity > 0
      && snapshot.equity > 0;
    const request: PaperOrderRequest = {
      orderId,
      positionId: `position-${Date.now()}`,
      decisionId: `decision-${decision.timestamp}`,
      assetId: input.symbol,
      symbol: input.symbol,
      decision,
      riskApproved,
      portfolioApproved: riskApproved,
      quantity,
      requestedPrice,
      feeRate: traderConfig.FEE_RATE,
      slippageRate: traderConfig.SLIPPAGE_RATE,
      stopLoss: decision.invalidation,
      takeProfit: decision.targets?.[0]?.price,
      executionVersion: 'paper-simulator-1.0.0',
    };
    const result = simulatePaperOrder(account, request);
    const nextAccount = checkpoint
      ? { ...result.account, processedCandles: { ...result.account.processedCandles, [checkpoint]: input.processedCandle!.time } }
      : result.account;
    return { account: nextAccount, result: { ...result, account: nextAccount } };
  }, input.accessToken);
}
