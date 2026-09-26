import { masterDecisionEngine, type DecisionEngineContext } from '../engines/decision-engine';
import type { Candle, Timeframe } from '../../../src/lib/types';

export interface AnalyzeInput {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  inputContextId?: string;
}

function buildContext(input: AnalyzeInput): DecisionEngineContext {
  const latest = input.candles[input.candles.length - 1];
  const entry = latest?.close ?? 0;
  const size = entry > 0 ? 1 : 0;

  return {
    inputContextId: input.inputContextId ?? `${input.symbol}:${input.timeframe}:${latest?.time ?? Date.now()}`,
    symbol: input.symbol,
    timeframe: input.timeframe,
    candles: input.candles,
    observedAt: Date.now(),
    risk: {
      trade: { size, entryPrice: entry, stopLossPrice: entry * 0.99, takeProfitPrice: entry * 1.02, portfolioValue: 100_000 },
      state: { currentDailyPnL: 0, currentDrawdown: 0, currentExposure: 0, currentLeverage: 0 },
      limits: { maxDailyLoss: -0.03, maxDrawdown: -0.2, maxPortfolioExposure: 0.06, maxLeverage: 1, minRiskReward: 1.5 },
      ruleVersion: 'quantum-backend-defaults-1.0.0',
    },
    portfolio: {
      value: 100_000,
      positions: [],
      proposedTrade: { symbol: input.symbol, marketType: 'crypto', size, entryPrice: entry },
      limits: { maxExposureRatio: 0.06, maxConcentrationRisk: 0.5, maxCorrelationRisk: 0.75 },
      ruleVersion: 'quantum-backend-defaults-1.0.0',
    },
  };
}

export async function analyze(input: AnalyzeInput) {
  if (!input.symbol || !input.timeframe || input.candles.length < 60) {
    throw new Error('A symbol, timeframe, and at least 60 candles are required.');
  }
  const context = buildContext(input);
  const decision = masterDecisionEngine.analyze(context);
  return { decision };
}