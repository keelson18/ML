// Authenticated plan reads and server-generated plan refreshes for the Trader Desk.
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Timeframe } from '../../../src/lib/types';
import { MARKET_UNIVERSE } from '../../../src/lib/markets';
import type { Market } from '../../../src/lib/types';
import { getSupabaseClientWithToken } from '../db';
import { config } from '../config';
import { fetchMarketData } from '../services/marketDataService';
import { getMarketAvailability, type MarketAvailability } from '../services/marketAvailability';
import { traderConfig } from '../trader/config';
import { createTradePlan, rankPlannerResults } from '../trader/planner';
import { getAccount, listStoredTradePlans, storeTradePlan } from '../services/paperTradingService';
import { markToMarket } from '../trader/risk';
import type { TradePlan } from '../trader/types';
import { candleSeconds, isClosed, selectClosedCandles } from '../trader/candle-math';
import { hasFreshClosedCandleData } from '../trader/market-data-quality';
import { reconcilePaperAccount } from '../trader/decision-ledger';
import { getSupabaseClient } from '../db';
import { paperAutopilotScheduler, isAutopilotSymbol, type PaperAutopilotConfig } from '../autonomy/paper-autopilot';

const listQuery = z.object({ status: z.enum(['WATCHING', 'ARMED', 'PENDING_ORDER', 'OPEN', 'MANAGING', 'CLOSED']).optional() }).strict();
const historyQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
const tradeChartQuery = z.object({ symbol: z.string().regex(/^[A-Z0-9]{3,12}$/) }).strict();
const autopilotSymbols = z.array(z.string().regex(/^[A-Z0-9]{3,12}$/)).min(1).max(MARKET_UNIVERSE.length);
const autopilotUpdate = z.object({ enabled: z.boolean(), symbols: autopilotSymbols }).strict();
const defaultAutopilotSymbols = MARKET_UNIVERSE.filter((market) => market.isActive).slice(0, 3).map((market) => market.symbol);
const ledgerVerificationCache = new Map<string, { checkedAt: number; status: 'verified' | 'broken' | 'unavailable' }>();

export function selectVerifiedPlannerMarkets(selectedSymbols: readonly string[], availability: readonly MarketAvailability[]): Market[] {
  const selected = new Set(selectedSymbols);
  const verified = new Set(availability.filter((market) => market.status === 'available').map((market) => market.symbol));
  return MARKET_UNIVERSE.filter((market) => selected.has(market.symbol) && verified.has(market.symbol)
    && market.isActive && market.marketType === 'crypto' && ['massive', 'twelvedata'].includes(market.provider) && market.priceCurrency === 'USD');
}

async function accountLedgerStatus(accountId: string): Promise<'verified' | 'broken' | 'unavailable'> {
  const cached = ledgerVerificationCache.get(accountId);
  if (cached && Date.now() - cached.checkedAt < 30_000) return cached.status;
  let status: 'verified' | 'broken' | 'unavailable' = 'unavailable';
  try {
    const { data, error } = await getSupabaseClient().rpc('verify_decision_ledger', { p_account_id: accountId });
    const verification = Array.isArray(data) ? data[0] : data;
    if (!error && verification) status = verification.ok ? 'verified' : 'broken';
  } catch { status = 'unavailable'; }
  ledgerVerificationCache.set(accountId, { checkedAt: Date.now(), status });
  return status;
}

function closedCandles(candles: Awaited<ReturnType<typeof fetchMarketData>>['candles'], timeframe: Timeframe) {
  return selectClosedCandles(candles, timeframe, Date.now(), traderConfig.CLOSE_GRACE_MS);
}

export async function traderRoutes(app: FastifyInstance) {
  app.get('/api/v1/trader/autopilot', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    if (!request.accessToken || !request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required.' });
    const { data, error } = await getSupabaseClientWithToken(request.accessToken).from('paper_autopilot')
      .select('account_id,enabled,symbols,paused_reason,last_run_at').eq('account_id', request.authenticatedUserId).maybeSingle();
    if (error) return reply.code(503).send({ error: 'Autopilot settings are unavailable; apply the paper core migration.' });
    const { data: limits } = await getSupabaseClientWithToken(request.accessToken).rpc('get_paper_autopilot_limits');
    const availableSymbols = MARKET_UNIVERSE.filter((market) => isAutopilotSymbol(market.symbol)).map((market) => market.symbol);
    return { enabled: Boolean(data?.enabled), symbols: data?.symbols ?? defaultAutopilotSymbols.filter((symbol) => availableSymbols.includes(symbol)),
      pausedReason: data?.paused_reason ?? null, lastRunAt: data?.last_run_at ?? null,
      availableSymbols,
      maxSymbolsPerUser: Number((limits as { maxSymbolsPerUser?: number } | null)?.maxSymbolsPerUser ?? 0) };
  });

  app.put('/api/v1/trader/autopilot', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: 5, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    const parsed = autopilotUpdate.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Choose one or more supported symbols.' });
    if (!request.accessToken || !request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required.' });
    if (new Set(parsed.data.symbols).size !== parsed.data.symbols.length) return reply.code(400).send({ error: 'Symbols must be unique.' });
    const unavailable = parsed.data.symbols.filter((symbol) => !isAutopilotSymbol(symbol)
      || getMarketAvailability().find((candidate) => candidate.symbol === symbol)?.status !== 'available');
    if (parsed.data.enabled && unavailable.length) return reply.code(409).send({ error: `Autopilot requires active, verified configured USD crypto markets: ${unavailable.join(', ')}.` });
    const { data, error } = await getSupabaseClientWithToken(request.accessToken).rpc('set_paper_autopilot', {
      p_enabled: parsed.data.enabled, p_symbols: parsed.data.symbols,
    });
    if (error) return reply.code(error.message.includes('Global autopilot symbol limit') ? 409 : 503)
      .send({ error: error.message.includes('Global autopilot symbol limit') ? error.message : 'Autopilot settings could not be saved; verify that migrations are applied.' });
    const row = (Array.isArray(data) ? data[0] : data) as PaperAutopilotConfig | null;
    if (!row) return reply.code(503).send({ error: 'Autopilot settings could not be saved; verify that migrations are applied.' });
    return { enabled: row.enabled, symbols: row.symbols, pausedReason: row.paused_reason, lastRunAt: row.last_run_at };
  });

  app.post('/api/v1/trader/autopilot/run', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: 2, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    if (!z.object({}).strict().safeParse(request.body ?? {}).success) return reply.code(400).send({ error: 'Run now does not accept request parameters.' });
    if (!request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required.' });
    try { return await paperAutopilotScheduler.queueAccountRun(request.authenticatedUserId); }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Autopilot run failed.';
      return reply.code(message.startsWith('Enable paper autopilot') || message.startsWith('Paper autopilot is paused') || message.startsWith('AUTONOMOUS_TRADING is disabled') ? 409 : 503).send({ error: message });
    }
  });

  app.get('/api/v1/trader/overview', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    if (!request.accessToken || !request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required.' });
    try {
      const account = await getAccount(request.authenticatedUserId);
      const reconciliation = reconcilePaperAccount(account);
      const ledgerStatus = await accountLedgerStatus(request.authenticatedUserId);
      const open = account.positions.filter((position) => position.status === 'open');
      const prices: Record<string, number> = {};
      const staleSymbols: string[] = [];
      await Promise.all(open.map(async (position) => {
        try {
          const data = await fetchMarketData(position.symbol, '1m', 2, { priority: true });
          const now = Date.now();
          const closed = selectClosedCandles(data.candles, '1m', now, traderConfig.CLOSE_GRACE_MS).at(-1);
          const closeAt = closed ? (closed.time + candleSeconds('1m', closed.time)) * 1000 : Number.NaN;
          const maxAge = closed ? candleSeconds('1m', closed.time) * 1000 * config.marketDataMaxStaleTtlMultiplier : 0;
          const usable = !data.stale && closed && isClosed(closed, '1m', now, traderConfig.CLOSE_GRACE_MS)
            && Number.isFinite(closed.close) && closed.close > 0 && now - closeAt <= maxAge;
          if (!usable) staleSymbols.push(position.symbol);
          prices[position.symbol] = usable ? closed.close : position.entryPrice;
        } catch {
          staleSymbols.push(position.symbol);
          prices[position.symbol] = position.entryPrice;
        }
      }));
      const marked = markToMarket(account, prices);
      const current = Date.now();
      const dayStart = new Date(new Date(current).setUTCHours(0, 0, 0, 0)).getTime();
      const weekStart = dayStart - ((new Date(dayStart).getUTCDay() + 6) % 7) * 86_400_000;
      const dailyPnl = account.trades.filter((trade) => Date.parse(trade.closedAt) >= dayStart).reduce((sum, trade) => sum + trade.realizedPnl, 0);
      const weeklyPnl = account.trades.filter((trade) => Date.parse(trade.closedAt) >= weekStart).reduce((sum, trade) => sum + trade.realizedPnl, 0);
      const openRiskCash = open.reduce((sum, position) => sum + Math.max(0, (position.entryPrice - (position.stopLoss ?? position.entryPrice)) * position.quantity), 0);
      return {
        cash: account.cash, startingEquity: traderConfig.TRADER_STARTING_EQUITY,
        equity: marked.equity, unrealizedPnl: marked.unrealizedPnl, drawdownPct: marked.drawdownPct,
        openRiskCash, heatPct: marked.equity > 0 ? openRiskCash / marked.equity * 100 : 0,
        grossExposurePct: marked.equity > 0 ? marked.grossExposure / marked.equity * 100 : 0,
        riskLimits: {
          dailyLossStopPct: traderConfig.DAILY_LOSS_STOP_PCT,
          maxDrawdownPct: traderConfig.MAX_DRAWDOWN_PCT,
          maxGrossExposurePct: traderConfig.MAX_GROSS_EXPOSURE_PCT,
          maxPortfolioHeatPct: traderConfig.MAX_PORTFOLIO_HEAT_PCT,
          riskPerTradePct: traderConfig.RISK_PER_TRADE_PCT,
          minRewardRisk: traderConfig.MIN_RR,
        },
        dailyPnl, weeklyPnl, dailyLossLimitPct: traderConfig.DAILY_LOSS_STOP_PCT,
        weeklyLossLimitPct: traderConfig.WEEKLY_LOSS_STOP_PCT, staleSymbols,
        ledgerStatus, reconciliation,
        positions: marked.positions.map(({ position, currentPrice, pnl }) => ({ ...position, currentPrice, unrealizedPnl: pnl,
          rMultiple: position.initialRisk && position.initialRisk > 0 ? (currentPrice - position.entryPrice) / position.initialRisk : 0 })),
        recentTrades: [...account.trades].sort((left, right) => Date.parse(right.closedAt) - Date.parse(left.closedAt)).slice(0, 20),
      };
    } catch (error) {
      request.log.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'Trader overview failed');
      return reply.code(503).send({ error: 'Trader overview is temporarily unavailable.' });
    }
  });

  app.get('/api/v1/trader/trades', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    const query = tradeChartQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'A valid symbol is required.' });
    if (!request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required.' });
    try {
      const account = await getAccount(request.authenticatedUserId);
      const symbol = query.data.symbol;
      const positions = account.positions.filter((position) => position.symbol === symbol);
      const positionIds = new Set(positions.map((position) => position.id));
      const trades = account.trades.filter((trade) => trade.symbol === symbol || positionIds.has(trade.positionId))
        .sort((left, right) => Date.parse(left.openedAt) - Date.parse(right.openedAt));
      const plans = (account.tradePlans ?? []).filter((plan) => plan.symbol === symbol);
      const journal = (account.tradeJournal ?? []).filter((entry) => entry.symbol === symbol);
      return { symbol, trades, positions, plans, journal };
    } catch (error) {
      request.log.error({ reason: error instanceof Error ? error.message : 'unknown', symbol: query.data.symbol }, 'Chart trade history failed');
      return reply.code(503).send({ error: 'Chart trade history is temporarily unavailable.' });
    }
  });

  app.get('/api/v1/trader/plans', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    const query = listQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid plan query.' });
    if (!request.accessToken || !request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required.' });
    const supabase = getSupabaseClientWithToken(request.accessToken);
    let plansQuery = supabase.from('trade_plans').select('plan').eq('account_id', request.authenticatedUserId).order('created_at', { ascending: false }).limit(100);
    if (query.data.status) plansQuery = plansQuery.eq('status', query.data.status);
    const { data, error } = await plansQuery;
    if (error) request.log.warn({ code: error.code }, 'SQL plan history unavailable; using paper account plan state');
    const accountPlans = await listStoredTradePlans(request.authenticatedUserId);
    const plansById = new Map<string, TradePlan>();
    for (const row of data ?? []) plansById.set((row.plan as TradePlan).id, row.plan as TradePlan);
    for (const plan of accountPlans) plansById.set(plan.id, plan);
    const plans = [...plansById.values()].filter((plan) => !query.data.status || plan.status === query.data.status)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, 100);
    return { plans };
  });

  app.post('/api/v1/trader/plans/refresh', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: 1, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    if (!request.accessToken || !request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required.' });
    const { data: enrollment } = await getSupabaseClientWithToken(request.accessToken).from('paper_autopilot')
      .select('symbols').eq('account_id', request.authenticatedUserId).maybeSingle();
    const selectedSymbols = enrollment?.symbols ?? defaultAutopilotSymbols;
    const candidates = selectVerifiedPlannerMarkets(selectedSymbols, getMarketAvailability());
    const results = [];
    for (const market of candidates) {
      try {
        const triggerTimeframe = traderConfig.TRIGGER_TIMEFRAMES[0] as Timeframe;
        const [daily, fourHour, setup, trigger] = await Promise.all([
          fetchMarketData(market.symbol, '1d', 100, { priority: true }),
          fetchMarketData(market.symbol, '4h', 100, { priority: true }),
          fetchMarketData(market.symbol, traderConfig.SETUP_TIMEFRAME, 100, { priority: true }),
          fetchMarketData(market.symbol, triggerTimeframe, 100, { priority: true }),
        ]);
        if (traderConfig.STALE_DATA_BLOCKS_ENTRIES && (daily.stale || fourHour.stale || setup.stale || trigger.stale
          || !hasFreshClosedCandleData(daily.candles, '1d')
          || !hasFreshClosedCandleData(fourHour.candles, '4h')
          || !hasFreshClosedCandleData(setup.candles, traderConfig.SETUP_TIMEFRAME as Timeframe)
          || !hasFreshClosedCandleData(trigger.candles, triggerTimeframe))) continue;
        const dailyCandles = closedCandles(daily.candles, '1d');
        const fourHourCandles = closedCandles(fourHour.candles, '4h');
        const setupCandles = closedCandles(setup.candles, traderConfig.SETUP_TIMEFRAME);
        const triggerCandles = closedCandles(trigger.candles, triggerTimeframe);
        results.push(createTradePlan({
          accountId: request.authenticatedUserId,
          symbol: market.symbol,
          htfCandles: { '1d': dailyCandles, '4h': fourHourCandles },
          setupCandles,
          triggerCandles,
          triggerTimeframe,
          datasetId: `${daily.dataset.id}:${fourHour.dataset.id}:${setup.dataset.id}:${trigger.dataset.id}`,
        }));
      } catch (error) {
        request.log.warn({ symbol: market.symbol, reason: error instanceof Error ? error.message : 'unknown' }, 'Trader planner skipped market');
      }
    }
    const ranked = rankPlannerResults(results);
    const plans = ranked.flatMap((result) => result.plan ? [result.plan] : []);
    for (const plan of plans) await storeTradePlan(request.authenticatedUserId, plan);
    if (plans.length > 0) {
      const supabase = getSupabaseClientWithToken(request.accessToken);
      const { error } = await supabase.rpc('save_trade_plans', { p_plans: plans });
      if (error) {
        request.log.warn({ code: error.code }, 'SQL plan journal unavailable; plan remains in paper account state');
      }
    }
    return { plans, watchlist: ranked.map(({ bias, regime, keyLevels, qualityScore, reason }) => ({ bias, regime, keyLevels, qualityScore, reason })), count: plans.length };
  });

  const registerOwnedHistory = (path: string, table: 'plan_events' | 'paper_orders' | 'trade_journal' | 'daily_reviews', orderColumn: string, responseKey: string) => {
    app.get(path, {
      preHandler: app.requireAuth,
      config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } },
    }, async (request, reply) => {
      const query = historyQuery.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: 'Invalid history query.' });
      if (!request.accessToken || !request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required.' });
      const supabase = getSupabaseClientWithToken(request.accessToken);
      const { data, error } = await supabase.from(table).select('*')
        .eq('account_id', request.authenticatedUserId)
        .order(orderColumn, { ascending: false })
        .limit(query.data.limit);
      const account = await getAccount(request.authenticatedUserId);
      const fallback = table === 'plan_events' ? account.planEvents
        : table === 'paper_orders' ? account.pendingPaperOrders
          : table === 'trade_journal' ? account.tradeJournal
            : account.dailyReviews;
      if (error) {
        request.log.warn({ code: error.code, table }, 'SQL trader history unavailable; using paper account state');
        return { [responseKey]: fallback ?? [] };
      }
      const rows = [...(data ?? [])] as Array<Record<string, unknown>>;
      const fallbackRows = (fallback ?? []) as unknown as Array<Record<string, unknown>>;
      const identity = (row: Record<string, unknown>) => String(row.id ?? row.review_date ?? row.reviewDate ?? '');
      const combined = new Map<string, Record<string, unknown>>();
      for (const row of fallbackRows) combined.set(identity(row), row);
      for (const row of rows) combined.set(identity(row), row);
      return { [responseKey]: [...combined.values()].sort((left, right) => String(right.created_at ?? right.createdAt ?? right.occurred_at ?? right.review_date ?? '').localeCompare(String(left.created_at ?? left.createdAt ?? left.occurred_at ?? left.review_date ?? ''))).slice(0, query.data.limit) };
    });
  };

  registerOwnedHistory('/api/v1/trader/events', 'plan_events', 'occurred_at', 'events');
  registerOwnedHistory('/api/v1/trader/orders', 'paper_orders', 'created_at', 'orders');
  registerOwnedHistory('/api/v1/trader/journal', 'trade_journal', 'created_at', 'entries');
  registerOwnedHistory('/api/v1/trader/reviews', 'daily_reviews', 'review_date', 'reviews');
}
