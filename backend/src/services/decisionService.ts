import { masterDecisionEngine, type DecisionEngineContext } from '../engines/decision-engine';
import type { Candle, Timeframe } from '../../../src/lib/types';
import { getAccount } from './paperTradingService';

export interface AnalyzeInput {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  inputContextId?: string;
}

async function buildContext(input: AnalyzeInput, accountId: string): Promise<DecisionEngineContext> {
  const latest = input.candles[input.candles.length - 1];
  const entry = latest?.close ?? 0;
  const account = await getAccount(accountId);
  const positions = account.positions.filter((position) => position.status === 'open');
  const grossExposure = positions.reduce((sum, position) => sum + position.quantity * position.entryPrice, 0);
  const portfolioValue = Math.max(0, account.cash + grossExposure);
  const proposedSize = entry > 0 ? Math.min(1, portfolioValue * 0.05 / entry) : 0;
  const utcDayStart = new Date();
  utcDayStart.setUTCHours(0, 0, 0, 0);
  const dailyPnl = account.trades
    .filter((trade) => Date.parse(trade.closedAt) >= utcDayStart.getTime())
    .reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const dailyPnlRatio = portfolioValue > 0 ? dailyPnl / portfolioValue : 0;
  const exposureRatio = portfolioValue > 0 ? grossExposure / portfolioValue : 0;
  let equityPeak = 100_000;
  let equityValue = 100_000;
  let maxDrawdown = 0;
  for (const trade of account.trades) {
    equityValue += trade.realizedPnl;
    equityPeak = Math.max(equityPeak, equityValue);
    maxDrawdown = Math.max(maxDrawdown, (equityPeak - equityValue) / equityPeak);
  }

  return {
    inputContextId: input.inputContextId ?? `${input.symbol}:${input.timeframe}:${latest?.time ?? Date.now()}`,
    symbol: input.symbol,
    timeframe: input.timeframe,
    candles: input.candles,
    observedAt: Math.floor(Date.now() / 1000),
    risk: {
      trade: { size: proposedSize, entryPrice: entry, stopLossPrice: entry * 0.99, takeProfitPrice: entry * 1.02, portfolioValue },
      state: { currentDailyPnL: dailyPnlRatio, currentDrawdown: -maxDrawdown, currentExposure: exposureRatio, currentLeverage: exposureRatio },
      limits: { maxDailyLoss: -0.05, maxDrawdown: -0.2, maxPortfolioExposure: 0.5, maxLeverage: 1, minRiskReward: 1.5 },
      ruleVersion: 'quantum-backend-defaults-1.0.0',
    },
    portfolio: {
      value: portfolioValue,
      positions: positions.map((position) => ({
        symbol: position.symbol,
        marketType: 'crypto',
        size: position.quantity,
        entryPrice: position.entryPrice,
        currentPrice: position.entryPrice,
        pnl: 0,
        pnlPct: 0,
        weight: portfolioValue > 0 ? position.quantity * position.entryPrice / portfolioValue : 0,
      })),
      proposedTrade: { symbol: input.symbol, marketType: 'crypto', size: proposedSize, entryPrice: entry },
      limits: { maxExposureRatio: 0.5, maxConcentrationRisk: 0.9, maxCorrelationRisk: 0.75 },
      ruleVersion: 'quantum-backend-defaults-1.0.0',
    },
  };
}

export async function analyze(input: AnalyzeInput, accountId = 'autonomy:default') {
  if (!input?.symbol || !input.timeframe || !Array.isArray(input.candles) || input.candles.length < 60) {
    throw new Error('A symbol, timeframe, and at least 60 candles are required.');
  }
  const context = await buildContext(input, accountId);
  const decision = masterDecisionEngine.analyze(context);
  return { decision };
}
