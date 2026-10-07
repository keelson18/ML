// Builds decision-engine risk context from actual plans and marked account state.
import { masterDecisionEngine, type DecisionEngineContext } from '../engines/decision-engine';
import type { Candle, Timeframe } from '../../../src/lib/types';
import type { TradePlan } from '../trader/types';
import { traderConfig } from '../trader/config';
import { markToMarket, calculatePositionSize } from '../trader/risk';
import { getAccount } from './paperTradingService';
import { fetchMarketData } from './marketDataService';

export interface AnalyzeInput {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  inputContextId?: string;
  plan?: TradePlan;
}

async function buildContext(input: AnalyzeInput, accountId: string, accessToken?: string): Promise<DecisionEngineContext> {
  const latest = input.candles[input.candles.length - 1];
  const entry = latest?.close ?? 0;
  const account = await getAccount(accountId, accessToken);
  const openPositions = account.positions.filter((position) => position.status === 'open');
  const markPrices: Record<string, number> = { [input.symbol]: entry };
  if (process.env.NODE_ENV === 'test') {
    for (const position of openPositions) markPrices[position.symbol] = position.entryPrice;
  } else {
    await Promise.all(openPositions.map(async (position) => {
      const series = await fetchMarketData(position.symbol, '1m', 2);
      const mark = series.candles.at(-1)?.close;
      if (!mark || !Number.isFinite(mark)) throw new Error('A mark-to-market price is unavailable for an open position.');
      markPrices[position.symbol] = mark;
    }));
  }
  const marked = markToMarket(account, markPrices);
  const stop = input.plan?.invalidation ?? 0;
  const target = input.plan?.targets[0]?.price ?? 0;
  const sizing = input.plan
    ? calculatePositionSize({
        equity: marked.equity,
        entry: input.plan.zone.high,
        invalidation: stop,
        cash: account.cash,
        grossExposure: marked.grossExposure,
        symbolExposure: marked.positions.filter((item) => item.position.symbol === input.symbol)
          .reduce((sum, item) => sum + item.currentPrice * item.position.quantity, 0),
      })
    : { accepted: false, quantity: 0 };

  const utcDayStart = new Date();
  utcDayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(utcDayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const dailyPnl = account.trades.filter((trade) => Date.parse(trade.closedAt) >= utcDayStart.getTime())
    .reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const weeklyPnl = account.trades.filter((trade) => Date.parse(trade.closedAt) >= weekStart.getTime())
    .reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const portfolioValue = marked.equity;
  const dailyPnlRatio = traderConfig.TRADER_STARTING_EQUITY > 0 ? dailyPnl / traderConfig.TRADER_STARTING_EQUITY : 0;
  const weeklyPnlRatio = traderConfig.TRADER_STARTING_EQUITY > 0 ? weeklyPnl / traderConfig.TRADER_STARTING_EQUITY : 0;
  const exposureRatio = portfolioValue > 0 ? marked.grossExposure / portfolioValue : 0;

  return {
    inputContextId: input.inputContextId ?? `${input.symbol}:${input.timeframe}:${latest?.time ?? Date.now()}`,
    symbol: input.symbol,
    timeframe: input.timeframe,
    candles: input.candles,
    observedAt: Math.floor(Date.now() / 1000),
    risk: {
      trade: {
        size: sizing.quantity,
        entryPrice: input.plan ? input.plan.zone.high : entry,
        stopLossPrice: stop,
        takeProfitPrice: target,
        portfolioValue,
      },
      state: { currentDailyPnL: dailyPnlRatio, currentWeeklyPnL: weeklyPnlRatio, currentDrawdown: -marked.drawdownPct / 100, currentExposure: exposureRatio, currentLeverage: exposureRatio },
      limits: {
        maxDailyLoss: -traderConfig.DAILY_LOSS_STOP_PCT / 100,
        maxWeeklyLoss: -traderConfig.WEEKLY_LOSS_STOP_PCT / 100,
        maxDrawdown: -traderConfig.MAX_DRAWDOWN_PCT / 100,
        maxPortfolioExposure: traderConfig.MAX_GROSS_EXPOSURE_PCT / 100,
        maxLeverage: 1,
        minRiskReward: traderConfig.MIN_RR,
      },
      ruleVersion: 'trader-risk-config-1.0.0',
    },
    portfolio: {
      value: portfolioValue,
      positions: marked.positions.map(({ position, currentPrice, pnl, pnlPct, weight }) => ({
        symbol: position.symbol,
        marketType: 'crypto',
        size: position.quantity,
        entryPrice: position.entryPrice,
        currentPrice,
        pnl,
        pnlPct,
        weight,
      })),
      proposedTrade: { symbol: input.symbol, marketType: 'crypto', size: sizing.quantity, entryPrice: input.plan ? input.plan.zone.high : entry },
      limits: {
        maxExposureRatio: traderConfig.MAX_GROSS_EXPOSURE_PCT / 100,
        maxConcentrationRisk: traderConfig.MAX_SYMBOL_EXPOSURE_PCT / 100,
        maxCorrelationRisk: traderConfig.MAX_CORRELATED_POSITIONS / traderConfig.MAX_CONCURRENT_POSITIONS,
      },
      ruleVersion: 'trader-risk-config-1.0.0',
    },
  };
}

export async function analyze(input: AnalyzeInput, accountId = 'autonomy:default', accessToken?: string) {
  if (!input?.symbol || !input.timeframe || !Array.isArray(input.candles) || input.candles.length < 60) {
    throw new Error('A symbol, timeframe, and at least 60 candles are required.');
  }
  const context = await buildContext(input, accountId, accessToken);
  const decision = masterDecisionEngine.analyze(context);
  return { decision };
}
