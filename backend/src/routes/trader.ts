// Authenticated plan reads and server-generated plan refreshes for the Trader Desk.
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Timeframe } from '../../../src/lib/types';
import { MARKET_UNIVERSE } from '../../../src/lib/markets';
import { getSupabaseClientWithToken } from '../db';
import { config } from '../config';
import { fetchMarketData } from '../services/marketDataService';
import { getMarketAvailability } from '../services/marketAvailability';
import { traderConfig } from '../trader/config';
import { createTradePlan, rankPlannerResults } from '../trader/planner';
import { advanceStoredTradePlans, generateDailyAccountReview, getAccount, listStoredTradePlans, manageOpenPositions, storeTradePlan, wasCandleProcessed, markCandleProcessed } from '../services/paperTradingService';
import { markToMarket } from '../trader/risk';
import type { TradePlan } from '../trader/types';

const listQuery = z.object({ status: z.enum(['WATCHING', 'ARMED', 'PENDING_ORDER', 'OPEN', 'MANAGING', 'CLOSED']).optional() }).strict();
const historyQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
const timeframeSeconds: Record<Timeframe, number> = {
  '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1_800,
  '1h': 3_600, '4h': 14_400, '1d': 86_400, '1w': 604_800, '1M': 2_592_000,
};

function closedCandles(candles: Awaited<ReturnType<typeof fetchMarketData>>['candles'], timeframe: Timeframe, nowSeconds = Date.now() / 1000) {
  return candles.filter((candle) => candle.time + timeframeSeconds[timeframe] <= nowSeconds);
}

export async function traderRoutes(app: FastifyInstance) {
  app.post('/api/v1/trader/advance', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: 2, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    if (!request.accessToken || !request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required.' });
    try {
      const accountId = request.authenticatedUserId;
      const triggerTimeframe = traderConfig.TRIGGER_TIMEFRAMES[0] as Timeframe;
      const plans = (await listStoredTradePlans(accountId, request.accessToken)).filter((plan) => ['WATCHING', 'ARMED', 'PENDING_ORDER'].includes(plan.status));
      const results = [];
      const staleSymbols: string[] = [];
      for (const symbol of [...new Set(plans.map((plan) => plan.symbol))]) {
        const series = await fetchMarketData(symbol, triggerTimeframe, 100);
        if (series.stale) { staleSymbols.push(symbol); continue; }
        const candles = closedCandles(series.candles, triggerTimeframe);
        const candle = candles.at(-1);
        if (!candle) continue;
        results.push(await advanceStoredTradePlans({ accountId, symbol, timeframe: triggerTimeframe, candle, candles, accessToken: request.accessToken }));
      }

      const account = await getAccount(accountId, request.accessToken);
      const openSymbols = [...new Set(account.positions.filter((position) => position.status === 'open').map((position) => position.symbol))];
      const managementTimeframe = traderConfig.MGMT_TIMEFRAME as Timeframe;
      const closedTrades = [];
      for (const symbol of openSymbols) {
        const series = await fetchMarketData(symbol, managementTimeframe, 100);
        if (series.stale) { staleSymbols.push(symbol); continue; }
        const candles = closedCandles(series.candles, managementTimeframe);
        const candle = candles.at(-1);
        if (!candle || await wasCandleProcessed(accountId, symbol, managementTimeframe, candle.time, 'manager')) continue;
        closedTrades.push(...await manageOpenPositions(accountId, symbol, candle, candles, false, managementTimeframe));
        await markCandleProcessed(accountId, symbol, managementTimeframe, candle.time, 'manager');
      }
      const daily = await fetchMarketData(plans[0]?.symbol ?? MARKET_UNIVERSE.find((market) => market.marketType === 'crypto')!.symbol, '1d', 2).catch(() => undefined);
      const lastDaily = daily && closedCandles(daily.candles, '1d').at(-1);
      if (lastDaily) await generateDailyAccountReview(accountId, new Date(lastDaily.time * 1000).toISOString().slice(0, 10));
      return {
        advancedPlans: results.reduce((sum, result) => sum + result.plans.filter((plan) => plan.status === 'PENDING_ORDER' || plan.status === 'OPEN').length, 0),
        filledOrders: results.reduce((sum, result) => sum + result.filled, 0),
        shadowSignals: results.flatMap((result) => result.shadowSignals), closedTrades, staleSymbols: [...new Set(staleSymbols)],
        shadowMode: traderConfig.SHADOW_MODE_ENABLED,
      };
    } catch (error) {
      request.log.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'Trader plan advancement failed');
      return reply.code(503).send({ error: 'Trader plan advancement is temporarily unavailable.' });
    }
  });

  app.get('/api/v1/trader/overview', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    if (!request.accessToken || !request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required.' });
    try {
      const account = await getAccount(request.authenticatedUserId, request.accessToken);
      const open = account.positions.filter((position) => position.status === 'open');
      const prices: Record<string, number> = {};
      const staleSymbols: string[] = [];
      await Promise.all(open.map(async (position) => {
        try {
          const data = await fetchMarketData(position.symbol, '1m', 2);
          const mark = data.candles.at(-1)?.close;
          if (!mark || !Number.isFinite(mark) || data.stale) staleSymbols.push(position.symbol);
          prices[position.symbol] = mark && Number.isFinite(mark) ? mark : position.entryPrice;
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
        dailyPnl, weeklyPnl, dailyLossLimitPct: traderConfig.DAILY_LOSS_STOP_PCT,
        weeklyLossLimitPct: traderConfig.WEEKLY_LOSS_STOP_PCT, staleSymbols,
        positions: marked.positions.map(({ position, currentPrice, pnl }) => ({ ...position, currentPrice, unrealizedPnl: pnl,
          rMultiple: position.initialRisk && position.initialRisk > 0 ? (currentPrice - position.entryPrice) / position.initialRisk : 0 })),
        recentTrades: [...account.trades].sort((left, right) => Date.parse(right.closedAt) - Date.parse(left.closedAt)).slice(0, 20),
      };
    } catch (error) {
      request.log.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'Trader overview failed');
      return reply.code(503).send({ error: 'Trader overview is temporarily unavailable.' });
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
    const accountPlans = await listStoredTradePlans(request.authenticatedUserId, request.accessToken);
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
    const availability = getMarketAvailability();
    const candidates = MARKET_UNIVERSE.filter((market) => market.isActive && market.marketType === 'crypto' && market.provider === 'massive'
      && availability.find((item) => item.symbol === market.symbol)?.status !== 'unavailable');
    const results = [];
    for (const market of candidates) {
      try {
        const [daily, fourHour, trigger] = await Promise.all([
          fetchMarketData(market.symbol, '1d', 100),
          fetchMarketData(market.symbol, '4h', 100),
          fetchMarketData(market.symbol, traderConfig.TRIGGER_TIMEFRAMES[0] as Timeframe, 100),
        ]);
        if (traderConfig.STALE_DATA_BLOCKS_ENTRIES && (daily.stale || fourHour.stale || trigger.stale)) continue;
        const dailyCandles = closedCandles(daily.candles, '1d');
        const fourHourCandles = closedCandles(fourHour.candles, '4h');
        const triggerCandles = closedCandles(trigger.candles, traderConfig.TRIGGER_TIMEFRAMES[0] as Timeframe);
        results.push(createTradePlan({
          accountId: request.authenticatedUserId,
          symbol: market.symbol,
          htfCandles: { '1d': dailyCandles, '4h': fourHourCandles },
          triggerCandles,
          datasetId: `${daily.dataset.id}:${fourHour.dataset.id}:${trigger.dataset.id}`,
        }));
      } catch (error) {
        request.log.warn({ symbol: market.symbol, reason: error instanceof Error ? error.message : 'unknown' }, 'Trader planner skipped market');
      }
    }
    const ranked = rankPlannerResults(results);
    const plans = ranked.flatMap((result) => result.plan ? [result.plan] : []);
    for (const plan of plans) await storeTradePlan(request.authenticatedUserId, plan, request.accessToken);
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
      const account = await getAccount(request.authenticatedUserId, request.accessToken);
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
