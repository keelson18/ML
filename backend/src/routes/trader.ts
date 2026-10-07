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
import { getAccount } from '../services/paperTradingService';
import { markToMarket } from '../trader/risk';

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
    if (error) {
      request.log.error({ code: error.code }, 'Trader plan read failed');
      return reply.code(503).send({ error: 'Trader plans are temporarily unavailable.' });
    }
    return { plans: (data ?? []).map((row) => row.plan) };
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
    if (plans.length > 0) {
      const supabase = getSupabaseClientWithToken(request.accessToken);
      const { error } = await supabase.rpc('save_trade_plans', { p_plans: plans });
      if (error) {
        request.log.error({ code: error.code }, 'Trader plan persistence failed');
        return reply.code(503).send({ error: 'Trader plans are temporarily unavailable.' });
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
      if (error) {
        request.log.error({ code: error.code, table }, 'Trader history read failed');
        return reply.code(503).send({ error: 'Trader history is temporarily unavailable.' });
      }
      return { [responseKey]: data ?? [] };
    });
  };

  registerOwnedHistory('/api/v1/trader/events', 'plan_events', 'occurred_at', 'events');
  registerOwnedHistory('/api/v1/trader/orders', 'paper_orders', 'created_at', 'orders');
  registerOwnedHistory('/api/v1/trader/journal', 'trade_journal', 'created_at', 'entries');
  registerOwnedHistory('/api/v1/trader/reviews', 'daily_reviews', 'review_date', 'reviews');
}
