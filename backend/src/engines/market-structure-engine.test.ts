import { describe, expect, it } from 'vitest';
import type { Candle } from '../../../src/lib/types';
import { masterDecisionEngine } from './decision-engine';
import { confidenceEngine } from './confidence-engine';
import { explainabilityEngine } from './explainability-engine';
import { historicalSimilarityEngine } from './historical-similarity-engine';
import { indicatorIntelligenceEngine } from './indicator-engine';
import { knowledgeIntelligenceEngine } from './knowledge-engine';
import { learningIntelligenceEngine } from './learning-engine';
import { marketStructureEngine } from './market-structure-engine';
import { analyzeMarketIntelligence } from './orchestrator';
import { closePaperPosition, simulatePaperOrder, type PaperAccountState } from './paper-execution';
import { portfolioIntelligenceEngine } from './portfolio-engine';
import { riskIntelligenceEngine } from './risk-engine';
import { researchIntelligenceEngine } from './research-engine';
import { strategyIntelligenceEngine } from './strategy-engine';
import { tradeReviewEngine } from './trade-review-engine';
import { dataQualityEngine } from './data-quality-engine';
import { aiReasoningEngine } from './ai-reasoning-engine';
import { liquidityIntelligenceEngine } from './liquidity-engine';
import { marketContextEngine } from './market-context-engine';
import { marketRegimeEngine } from './regime-engine';
import { mlIntelligenceEngine } from './ml-engine';
import { patternIntelligenceEngine } from './pattern-engine';
import { LIVE_STRATEGY_IDS, selectBestStrategy, STRATEGY_REGISTRY } from '../../../src/lib/strategies/index';

function candles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.25 + Math.sin(index / 3) * 2;
    return {
      time: index * 60,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000 + index,
    };
  });
}

function closedDecisionInput(inputContextId: string) {
  const boundary = Math.floor(Date.now() / 3_600_000) * 3_600;
  const inputCandles = Array.from({ length: 80 }, (_, index) => {
    const close = 100 + index * 0.25;
    return { time: boundary - (80 - index) * 3_600, open: close - 0.1, high: close + 0.2, low: close - 0.2, close, volume: 100 };
  });
  const entry = inputCandles.at(-1)!.close;
  return {
    inputContextId, symbol: 'BTCUSD', timeframe: '1h' as const, candles: inputCandles,
    observedAt: Math.floor(Date.now() / 1000), candleClosure: 'verified_closed' as const,
    dataState: 'ready' as const, dataSource: { provider: 'fixture', fetchedAt: Date.now(), datasetId: 'synthetic-test-fixture' },
    risk: {
      trade: { size: 1, entryPrice: entry, stopLossPrice: entry - 1, takeProfitPrice: entry + 2, portfolioValue: 10_000 },
      state: { currentDailyPnL: 0, currentDrawdown: 0, currentExposure: 0, currentLeverage: 0 },
      limits: { maxDailyLoss: -0.05, maxDrawdown: -0.2, maxPortfolioExposure: 0.5, maxLeverage: 1, minRiskReward: 1.5 },
      ruleVersion: 'test-risk',
    },
    portfolio: {
      value: 10_000, positions: [],
      proposedTrade: { symbol: 'BTCUSD', marketType: 'crypto', size: 1, entryPrice: entry },
      limits: { maxExposureRatio: 0.5, maxConcentrationRisk: 1, maxCorrelationRisk: 1 }, ruleVersion: 'test-portfolio',
    },
  };
}

describe('marketStructureEngine', () => {
  it('does not authorize a directional action when candle closure and freshness are unknown', () => {
    const input = candles(80).map((candle, index) => {
      const close = 100 + index;
      return { time: index * 3_600, open: close - 0.1, high: close + 0.2, low: close - 0.2, close, volume: 100 };
    });
    const originalDetectors = STRATEGY_REGISTRY.map((strategy) => strategy.detect);
    try {
      STRATEGY_REGISTRY.forEach((strategy, index) => {
        strategy.detect = index === 0
          ? () => [{ strategy: 'test-only forced direction', side: 'buy', confidence: 0.99, reason: 'Synthetic fixture signal.' }]
          : () => [];
      });
      const result = masterDecisionEngine.analyze({
        inputContextId: 'unknown-candle-state', symbol: 'BTCUSDT', timeframe: '1h', candles: input,
        risk: {
          trade: { size: 1, entryPrice: 180, stopLossPrice: 170, takeProfitPrice: 200, portfolioValue: 10_000 },
          state: { currentDailyPnL: 0, currentDrawdown: 0, currentExposure: 0, currentLeverage: 0 },
          limits: { maxDailyLoss: -0.05, maxDrawdown: -0.2, maxPortfolioExposure: 0.5, maxLeverage: 1, minRiskReward: 1.5 },
          ruleVersion: 'test-risk',
        },
        portfolio: {
          value: 10_000, positions: [],
          proposedTrade: { symbol: 'BTCUSDT', marketType: 'crypto', size: 1, entryPrice: 180 },
          limits: { maxExposureRatio: 0.5, maxConcentrationRisk: 1, maxCorrelationRisk: 1 }, ruleVersion: 'test-portfolio',
        },
      });
      expect(result.result.decision).toBe('NO_TRADE');
      expect(result.result.contradictions.join(' ')).toMatch(/freshness|closure|candle/i);
    } finally {
      STRATEGY_REGISTRY.forEach((strategy, index) => { strategy.detect = originalDetectors[index]; });
    }
  });

  it('reports strategy detector exceptions instead of treating them as no signal', () => {
    const strategy = STRATEGY_REGISTRY[0];
    const originalDetector = strategy.detect;
    try {
      strategy.detect = () => { throw new Error('synthetic detector failure'); };
      const result = strategyIntelligenceEngine.analyze({
        inputContextId: 'strategy-exception', symbol: 'BTCUSDT', timeframe: '1h', candles: candles(80),
      });
      expect(result.status).toBe('degraded');
      expect(result.warnings.join(' ')).toContain(strategy.id);
      expect(result.warnings.join(' ')).toContain('failed');
    } finally {
      strategy.detect = originalDetector;
    }
  });

  it('does not count same-price-series strategy votes as independent confirmation', () => {
    const candlesInput = candles(80);
    const market = analyzeMarketIntelligence({ inputContextId: 'correlated-votes', symbol: 'BTCUSD', timeframe: '1h', candles: candlesInput });
    const evidence = Array.from({ length: 4 }, (_, index) => ({
      id: `strategy:${index}`, kind: 'calculated' as const, source: `strategy-${index}`,
      correlationGroup: 'ohlcv-derived-strategy-signals', direction: 'bullish' as const,
      score: 0.9, explanation: 'Synthetic correlated test evidence.',
    }));
    const result = confidenceEngine.analyze({
      inputContextId: 'correlated-votes', symbol: 'BTCUSD', timeframe: '1h', candles: candlesInput,
      market, evidence, contradictions: [], riskApproved: true, portfolioApproved: true,
      dataQualityBlocked: false, decisionDirection: 'buy',
    });
    expect(result.result.factors.find((factor) => factor.factor === 'evidence-independence')?.score).toBe(0.25);
  });

  it('does not let a high-confidence signal from an unselected strategy substitute for a setup', () => {
    const context = closedDecisionInput('missing-selected-setup');
    const selected = selectBestStrategy(context.candles, context.timeframe);
    const alternative = STRATEGY_REGISTRY.find((strategy) => strategy.id !== selected.id && LIVE_STRATEGY_IDS.has(strategy.id));
    expect(alternative).toBeDefined();
    const originalDetectors = STRATEGY_REGISTRY.map((strategy) => strategy.detect);
    try {
      STRATEGY_REGISTRY.forEach((strategy) => {
        strategy.detect = strategy.id === alternative!.id
          ? () => [{ strategy: strategy.name, side: 'buy', confidence: 0.99, reason: 'Synthetic non-selected signal.' }]
          : () => [];
      });
      const result = masterDecisionEngine.analyze(context);
      expect(result.result.decision).toBe('NO_TRADE');
      expect(result.result.explanation).toContain(`selected strategy ${selected.name}`);
    } finally {
      STRATEGY_REGISTRY.forEach((strategy, index) => { strategy.detect = originalDetectors[index]; });
    }
  });

  it('publishes the exact stop and target that passed risk approval', () => {
    const context = closedDecisionInput('risk-level-consistency');
    const selected = selectBestStrategy(context.candles, context.timeframe);
    const strategy = STRATEGY_REGISTRY.find((item) => item.id === selected.id)!;
    const originalDetectors = STRATEGY_REGISTRY.map((item) => item.detect);
    try {
      STRATEGY_REGISTRY.forEach((item) => { item.detect = () => []; });
      strategy.detect = () => [{ strategy: strategy.name, side: 'buy', confidence: 0.8, reason: 'Synthetic selected setup trigger.' }];
      const result = masterDecisionEngine.analyze({ ...context, entryZone: { low: context.risk.trade.entryPrice - 0.25, high: context.risk.trade.entryPrice } });
      expect(result.result.decision).toBe('BUY');
      expect(result.result.entry).toBe(context.risk.trade.entryPrice);
      expect(result.result.invalidation).toBe(context.risk.trade.stopLossPrice);
      expect(result.result.targets).toEqual([{ price: context.risk.trade.takeProfitPrice }]);
    } finally {
      STRATEGY_REGISTRY.forEach((item, index) => { item.detect = originalDetectors[index]; });
    }
  });

  it('degrades safely when the context is too short', () => {
    const result = marketStructureEngine.analyze({
      inputContextId: 'short-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: candles(20),
    });

    expect(result.status).toBe('degraded');
    expect(result.inputContextId).toBe('short-context');
    expect(result.warnings).toContain('At least 50 candles are required for a full structure analysis.');
  });

  it('returns versioned, traceable analysis metadata', () => {
    const result = marketStructureEngine.analyze({
      inputContextId: 'full-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: candles(80),
    });

    expect(result.status).toBe('ok');
    expect(result.engineName).toBe('market-structure');
    expect(result.engineVersion).toBe('1.0.0');
    expect(result.timestamp).toEqual(expect.any(String));
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.result.state).toBeDefined();
    expect(result.evidence.every((item) => item.kind === 'calculated')).toBe(true);
  });

  it('wraps strategy selection and signals in the shared result contract', () => {
    const result = strategyIntelligenceEngine.analyze({
      inputContextId: 'strategy-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: candles(80),
    });

    expect(result.engineName).toBe('strategy-intelligence');
    expect(result.result.selectedStrategy.name).toBeTruthy();
    expect(result.result.signals).toEqual(expect.any(Array));
    expect(result.evidence.length).toBe(result.result.signals.length);
  });

  it('aggregates independent market intelligence engines without making a decision', () => {
    const snapshot = analyzeMarketIntelligence({
      inputContextId: 'orchestration-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: candles(80),
    });

    expect(snapshot.structure.inputContextId).toBe('orchestration-context');
    expect(snapshot.strategy.inputContextId).toBe('orchestration-context');
    expect(snapshot.structure.engineName).toBe('market-structure');
    expect(snapshot.strategy.engineName).toBe('strategy-intelligence');
  });

  it('rejects a proposal that breaches a hard risk limit', () => {
    const result = riskIntelligenceEngine.analyze({
      inputContextId: 'risk-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: [],
      risk: {
        trade: {
          size: 1,
          entryPrice: 100,
          stopLossPrice: 99,
          takeProfitPrice: 100.5,
          portfolioValue: 1000,
        },
        state: {
          currentDailyPnL: -0.06,
          currentDrawdown: -0.01,
          currentExposure: 0,
          currentLeverage: 0,
        },
        limits: {
          maxDailyLoss: -0.05,
          maxDrawdown: -0.2,
          maxPortfolioExposure: 0.5,
          maxLeverage: 1,
          minRiskReward: 1.5,
        },
        ruleVersion: 'risk-1',
      },
    });

    expect(result.result.approved).toBe(false);
    expect(result.result.violatedRules).toContain('Daily loss limit reached');
    expect(result.result.requiredAdjustments).toHaveLength(1);
  });

  it('enforces the configured leverage limit', () => {
    const result = riskIntelligenceEngine.analyze({
      inputContextId: 'leverage-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: [],
      risk: {
        trade: {
          size: 1,
          entryPrice: 100,
          stopLossPrice: 99,
          takeProfitPrice: 102,
          portfolioValue: 1000,
        },
        state: {
          currentDailyPnL: 0,
          currentDrawdown: 0,
          currentExposure: 0,
          currentLeverage: 2,
        },
        limits: {
          maxDailyLoss: -0.05,
          maxDrawdown: -0.2,
          maxPortfolioExposure: 0.5,
          maxLeverage: 1,
          minRiskReward: 1.5,
        },
        ruleVersion: 'risk-1',
      },
    });

    expect(result.result.approved).toBe(false);
    expect(result.result.violatedRules).toContain('Current leverage 2.00 exceeds 1.00 limit');
  });

  it('rejects a proposal that would exceed portfolio exposure', () => {
    const result = portfolioIntelligenceEngine.analyze({
      inputContextId: 'portfolio-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: [],
      portfolio: {
        value: 1000,
        positions: [],
        proposedTrade: {
          symbol: 'BTCUSDT',
          marketType: 'crypto',
          size: 6,
          entryPrice: 100,
        },
        limits: {
          maxExposureRatio: 0.5,
          maxConcentrationRisk: 1,
          maxCorrelationRisk: 1,
        },
        ruleVersion: 'portfolio-1',
      },
    });

    expect(result.result.approved).toBe(false);
    expect(result.result.violatedRules).toContain('Projected exposure would exceed 50% of portfolio value.');
  });

  it('produces NO_TRADE when the independent risk gate rejects the proposal', () => {
    const result = masterDecisionEngine.analyze({
      inputContextId: 'decision-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: candles(80),
      risk: {
        trade: {
          size: 1,
          entryPrice: 100,
          stopLossPrice: 99,
          takeProfitPrice: 102,
          portfolioValue: 1000,
        },
        state: {
          currentDailyPnL: -0.06,
          currentDrawdown: -0.01,
          currentExposure: 0,
          currentLeverage: 0,
        },
        limits: {
          maxDailyLoss: -0.05,
          maxDrawdown: -0.2,
          maxPortfolioExposure: 0.5,
          maxLeverage: 1,
          minRiskReward: 1.5,
        },
        ruleVersion: 'risk-1',
      },
      portfolio: {
        value: 1000,
        positions: [],
        proposedTrade: { symbol: 'BTCUSDT', marketType: 'crypto', size: 1, entryPrice: 100 },
        limits: { maxExposureRatio: 0.5, maxConcentrationRisk: 1, maxCorrelationRisk: 1 },
        ruleVersion: 'portfolio-1',
      },
    });

    expect(result.result.decision).toBe('NO_TRADE');
    expect(result.result.contradictions).toContain('Daily loss limit reached');
    expect(result.result.explanation).toContain('No trade:');
  });

  it('explains the decision from persisted evidence without inventing invalidation data', () => {
    const decision = masterDecisionEngine.analyze({
      inputContextId: 'explanation-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: candles(80),
      risk: {
        trade: { size: 1, entryPrice: 100, stopLossPrice: 99, takeProfitPrice: 102, portfolioValue: 1000 },
        state: { currentDailyPnL: -0.06, currentDrawdown: 0, currentExposure: 0, currentLeverage: 0 },
        limits: { maxDailyLoss: -0.05, maxDrawdown: -0.2, maxPortfolioExposure: 0.5, maxLeverage: 1, minRiskReward: 1.5 },
        ruleVersion: 'risk-1',
      },
      portfolio: {
        value: 1000,
        positions: [],
        proposedTrade: { symbol: 'BTCUSDT', marketType: 'crypto', size: 1, entryPrice: 100 },
        limits: { maxExposureRatio: 0.5, maxConcentrationRisk: 1, maxCorrelationRisk: 1 },
        ruleVersion: 'portfolio-1',
      },
    });
    const explanation = explainabilityEngine.analyze({
      inputContextId: decision.inputContextId,
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: candles(80),
      decision: decision.result,
      evidence: decision.evidence,
    });

    expect(explanation.result.summary).toContain('No trade:');
    expect(explanation.result.contradictingFactors).toContain('Daily loss limit reached');
    expect(explanation.result.invalidationConditions[0]).toContain('No explicit price invalidation');
  });

  it('simulates an approved paper order and closes it with fees and P&L', () => {
    const account: PaperAccountState = { accountId: 'paper-1', cash: 1000, positions: [], trades: [] };
    const order = simulatePaperOrder(account, {
      orderId: 'order-1',
      positionId: 'position-1',
      decisionId: 'decision-1',
      assetId: 'asset-1',
      symbol: 'BTCUSDT',
      decision: {
        decision: 'BUY',
        confidence: 0.8,
        entry: 100,
        strategy: 'test',
        supportingEvidence: [],
        contradictions: [],
        explanation: 'Approved test decision',
      },
      riskApproved: true,
      portfolioApproved: true,
      quantity: 2,
      requestedPrice: 100,
      feeRate: 0.01,
      slippageRate: 0.01,
      executionVersion: 'paper-1',
      stopLoss: 95,
      timestamp: '2026-08-09T00:00:00.000Z',
    });

    expect(order.accepted).toBe(true);
    expect(order.fillPrice).toBe(101);
    expect(order.account.cash).toBeCloseTo(795.98, 2);

    const closed = closePaperPosition(order.account, 'BTCUSDT', 110, 0.01, 'paper-1', 'trade-1', '2026-08-09T01:00:00.000Z', { high: 112, low: 97 });
    expect('trade' in closed).toBe(true);
    if ('trade' in closed) {
      expect(closed.trade.realizedPnl).toBeCloseTo(13.78, 2);
      expect(closed.trade.maeR).toBeLessThan(0);
      expect(closed.trade.mfeR).toBeGreaterThan(1);
      expect(closed.account.positions[0].status).toBe('closed');
    }
  });

  it('rejects paper execution when a hard gate is not approved', () => {
    const account: PaperAccountState = { accountId: 'paper-1', cash: 1000, positions: [], trades: [] };
    const result = simulatePaperOrder(account, {
      orderId: 'order-2',
      positionId: 'position-2',
      decisionId: 'decision-2',
      assetId: 'asset-1',
      symbol: 'ETHUSDT',
      decision: {
        decision: 'BUY',
        confidence: 0.8,
        strategy: 'test',
        supportingEvidence: [],
        contradictions: [],
        explanation: 'Rejected test decision',
      },
      riskApproved: false,
      portfolioApproved: true,
      quantity: 1,
      requestedPrice: 100,
      feeRate: 0,
      slippageRate: 0,
      executionVersion: 'paper-1',
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('approved risk and portfolio gates');
  });

  it('reviews a completed paper trade from recorded outcome and execution evidence', () => {
    const review = tradeReviewEngine.analyze({
      inputContextId: 'review-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: [],
      trade: {
        id: 'trade-1',
        positionId: 'position-1',
        symbol: 'BTCUSDT',
        side: 'buy',
        quantity: 1,
        entryPrice: 100,
        exitPrice: 110,
        fees: 0.2,
        slippage: 0.1,
        realizedPnl: 9.8,
        executionVersion: 'paper-1',
        openedAt: '2026-08-09T00:00:00.000Z',
        closedAt: '2026-08-09T01:00:00.000Z',
        maeR: -0.2,
        mfeR: 2,
      },
      decision: {
        decision: 'BUY',
        confidence: 0.8,
        strategy: 'test',
        supportingEvidence: [],
        contradictions: [],
        reasoning: 'Recorded test decision',
        explanation: 'Recorded test decision',
        engineVersions: { 'master-decision': '1.0.0' },
        timestamp: '2026-08-09T00:00:00.000Z',
      },
      riskApproved: true,
      dataQualityValid: true,
      strategyMatched: true,
      executionSlippagePct: 0.1,
    });

    expect(review.result.outcomeClass).toBe('correct_thesis_good_execution');
    expect(review.result.thesisDirection).toBe('long');
    expect(review.result.realizedPnl).toBe(9.8);
  });

  it('fails data quality when candle structure is invalid', () => {
    const invalidCandles = candles(10);
    invalidCandles[4] = { ...invalidCandles[4], high: invalidCandles[4].close - 1 };
    const result = dataQualityEngine.analyze({
      inputContextId: 'quality-invalid',
      symbol: 'BTCUSDT',
      timeframe: '1m',
      candles: invalidCandles,
      observedAt: invalidCandles[9].time + 60,
    });

    expect(result.status).toBe('failed');
    expect(result.result.valid).toBe(false);
    expect(result.result.anomalies).toContain('Candle 4 has an invalid high value.');
  });

  it('distinguishes non-continuous market-session gaps from crypto data gaps', () => {
    const input: Candle[] = [
      { time: 1_800_000_000, open: 100, high: 101, low: 99, close: 100, volume: 100 },
      { time: 1_800_086_400, open: 100, high: 102, low: 99, close: 101, volume: 100 },
      { time: 1_800_345_600, open: 101, high: 103, low: 100, close: 102, volume: 100 },
    ];
    const common = {
      inputContextId: 'session-gap', symbol: 'TEST', timeframe: '1d' as const, candles: input,
      observedAt: 1_800_432_000, candleClosure: 'verified_closed' as const, dataState: 'ready' as const,
    };
    const stock = dataQualityEngine.analyze({
      ...common, dataSource: { provider: 'fixture', fetchedAt: common.observedAt * 1000, datasetId: 'stock-fixture', marketType: 'stock' },
    });
    const crypto = dataQualityEngine.analyze({
      ...common, dataSource: { provider: 'fixture', fetchedAt: common.observedAt * 1000, datasetId: 'crypto-fixture', marketType: 'crypto' },
    });
    expect(stock.status).toBe('ok');
    expect(stock.warnings.join(' ')).toContain('possible scheduled market-session gap');
    expect(crypto.status).toBe('failed');
    expect(crypto.warnings.join(' ')).toContain('data gap');
  });

  it('degrades stale data and derives a versioned market context', () => {
    const input = candles(80);
    const stale = dataQualityEngine.analyze({
      inputContextId: 'quality-stale',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: input,
      observedAt: input[79].time + 20000,
    });
    const context = marketContextEngine.analyze({
      inputContextId: 'market-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: input,
    });

    expect(stale.status).toBe('degraded');
    expect(stale.result.freshnessStatus).toBe('stale');
    expect(context.result.contextVersion).toBe('1.0.0');
    expect(context.result.regimeCandidates.length).toBeGreaterThan(0);
    expect(context.result.volatilityState).toBeDefined();
  });

  it('blocks decisions when the market data quality engine detects invalid candles', () => {
    const invalidCandles = candles(80);
    invalidCandles[10] = { ...invalidCandles[10], low: invalidCandles[10].close + 1 };
    const result = masterDecisionEngine.analyze({
      inputContextId: 'invalid-decision-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: invalidCandles,
      risk: {
        trade: { size: 1, entryPrice: 100, stopLossPrice: 99, takeProfitPrice: 102, portfolioValue: 1000 },
        state: { currentDailyPnL: 0, currentDrawdown: 0, currentExposure: 0, currentLeverage: 0 },
        limits: { maxDailyLoss: -0.05, maxDrawdown: -0.2, maxPortfolioExposure: 0.5, maxLeverage: 1, minRiskReward: 1.5 },
        ruleVersion: 'risk-1',
      },
      portfolio: {
        value: 1000,
        positions: [],
        proposedTrade: { symbol: 'BTCUSDT', marketType: 'crypto', size: 1, entryPrice: 100 },
        limits: { maxExposureRatio: 0.5, maxConcentrationRisk: 1, maxCorrelationRisk: 1 },
        ruleVersion: 'portfolio-1',
      },
    });

    expect(result.result.decision).toBe('NO_TRADE');
    expect(result.result.contradictions).toContain('Candle 10 has an invalid low value.');
  });

  it('separates calculated liquidity zones from inferred sweep candidates', () => {
    const result = liquidityIntelligenceEngine.analyze({
      inputContextId: 'liquidity-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: candles(80),
    });

    expect(result.result.observedCount).toBeGreaterThanOrEqual(0);
    expect(result.result.inferredCount).toBeGreaterThanOrEqual(0);
    expect(result.evidence.every((item) => item.kind === 'calculated' || item.kind === 'inferred')).toBe(true);
  });

  it('classifies a regime from the versioned market context', () => {
    const context = marketContextEngine.analyze({
      inputContextId: 'regime-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: candles(80),
    });
    const regime = marketRegimeEngine.analyze({
      inputContextId: 'regime-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: candles(80),
      marketContext: context,
    });

    expect(regime.result.detectorVersion).toBe('1.0.0');
    expect(['trending', 'ranging', 'high-volatility', 'low-volatility', 'breakout', 'transition', 'uncertain'])
      .toContain(regime.result.regime);
    expect(regime.evidence.length).toBeGreaterThan(0);
  });

  it('scores detected patterns as contextual evidence', () => {
    const result = patternIntelligenceEngine.analyze({
      inputContextId: 'pattern-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: candles(80),
    });

    expect(result.result.candlestickCount).toBeGreaterThanOrEqual(0);
    expect(result.result.chartPatternCount).toBeGreaterThanOrEqual(0);
    expect(result.result.patterns.every((pattern) => pattern.score >= 0 && pattern.score <= 1)).toBe(true);
  });

  it('returns finite latest indicator measurements when enough candles exist', () => {
    const result = indicatorIntelligenceEngine.analyze({
      inputContextId: 'indicator-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: candles(80),
    });

    expect(result.status).toBe('ok');
    expect(result.result.latest.rsi).toEqual(expect.any(Number));
    expect(result.result.latest.atr).toEqual(expect.any(Number));
    expect(result.result.latest.bollingerWidth).toEqual(expect.any(Number));
  });

  it('returns only sufficiently similar historical cases with sample quality', () => {
    const result = historicalSimilarityEngine.analyze({
      inputContextId: 'history-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: [],
      currentFeatureVector: [1, 2, 3],
      historicalCases: [
        { id: 'case-1', featureVector: [1, 2, 3], outcome: 'win', sampleQuality: 'high', timestamp: '2026-01-01T00:00:00.000Z' },
        { id: 'case-2', featureVector: [10, 10, 10], outcome: 'loss', sampleQuality: 'low', timestamp: '2026-01-02T00:00:00.000Z' },
      ],
    });

    expect(result.result.matches).toHaveLength(1);
    expect(result.result.matches[0].id).toBe('case-1');
    expect(result.result.sampleQuality).toBe('high');
    expect(result.evidence[0].kind).toBe('historical');
  });

  it('retrieves only validated or approved knowledge by matching tags', () => {
    const result = knowledgeIntelligenceEngine.analyze({
      inputContextId: 'knowledge-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: [],
      queryTags: ['trend', 'crypto'],
      knowledgeNodes: [
        { id: 'k1', nodeType: 'regime', title: 'Trend memory', content: 'Use trend strategies in stable trends.', tags: ['trend', 'crypto'], confidence: 0.8, status: 'approved', version: '1.0.0' },
        { id: 'k2', nodeType: 'hypothesis', title: 'Unvalidated idea', content: 'Not production evidence.', tags: ['trend', 'crypto'], confidence: 0.99, status: 'draft', version: '1.0.0' },
      ],
    });

    expect(result.result.matches).toHaveLength(1);
    expect(result.result.matches[0].id).toBe('k1');
    expect(result.result.approvedOnly).toBe(true);
  });

  it('downgrades ML evidence when model lineage is incomplete', () => {
    const result = mlIntelligenceEngine.analyze({
      inputContextId: 'ml-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: [],
      prediction: {
        pair: 'BTCUSDT',
        timeframe: '1h',
        prediction: 'up',
        probability: 0.7,
        expected_move_pct: 1.2,
        model_version: 'model-1',
        confidence: 'medium',
      },
    });

    expect(result.status).toBe('degraded');
    expect(result.result.lineageComplete).toBe(false);
    expect(result.result.calibrated).toBe(false);
    expect(result.warnings[0]).toContain('lineage is incomplete');
  });

  it('marks an ML model calibrated only when a matching measurement exists', () => {
    const result = mlIntelligenceEngine.analyze({
      inputContextId: 'ml-calibrated-context', symbol: 'BTCUSD', timeframe: '1h', candles: [], datasetId: 'dataset-1',
      prediction: { pair: 'BTCUSD', timeframe: '1h', prediction: 'up', probability: 0.7, expected_move_pct: 1, model_version: 'model-1', confidence: 'medium' },
      featureSnapshot: { momentum: 0.4 },
      calibration: { modelVersion: 'model-1', timeframe: '1h', sampleCount: 120, brierScore: 0.18, measuredAt: '2026-10-06T00:00:00.000Z' },
    });
    expect(result.result.lineageComplete).toBe(true);
    expect(result.result.calibrated).toBe(true);
  });

  it('keeps structured AI reasoning explicitly non-authoritative', () => {
    const result = aiReasoningEngine.analyze({
      inputContextId: 'reasoning-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: [],
      evidence: [{
        id: 'evidence-1',
        kind: 'calculated',
        source: 'RSI',
        direction: 'bullish',
        score: 0.7,
        explanation: 'Momentum is positive.',
      }],
      contradictions: ['Higher timeframe disagrees.'],
    });

    expect(result.result.authoritative).toBe(false);
    expect(result.result.supportingEvidence).toContain('Momentum is positive.');
    expect(result.result.uncertainty).toContain('Conflicting evidence requires a lower-confidence or no-trade outcome.');
  });

  it('records optional ML, history, and knowledge evidence without bypassing risk', () => {
    const result = masterDecisionEngine.analyze({
      inputContextId: 'optional-evidence-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: candles(80),
      risk: {
        trade: { size: 1, entryPrice: 100, stopLossPrice: 99, takeProfitPrice: 102, portfolioValue: 1000 },
        state: { currentDailyPnL: -0.06, currentDrawdown: 0, currentExposure: 0, currentLeverage: 0 },
        limits: { maxDailyLoss: -0.05, maxDrawdown: -0.2, maxPortfolioExposure: 0.5, maxLeverage: 1, minRiskReward: 1.5 },
        ruleVersion: 'risk-1',
      },
      portfolio: {
        value: 1000,
        positions: [],
        proposedTrade: { symbol: 'BTCUSDT', marketType: 'crypto', size: 1, entryPrice: 100 },
        limits: { maxExposureRatio: 0.5, maxConcentrationRisk: 1, maxCorrelationRisk: 1 },
        ruleVersion: 'portfolio-1',
      },
      ml: {
        prediction: { pair: 'BTCUSDT', timeframe: '1h', prediction: 'up', probability: 0.7, expected_move_pct: 1, model_version: 'model-1', confidence: 'medium' },
        featureSnapshot: { rsi: 60, atr: 0.02 },
        datasetId: 'dataset-1',
      },
      historical: {
        currentFeatureVector: [1, 2, 3],
        historicalCases: [{ id: 'case-1', featureVector: [1, 2, 3], outcome: 'win', sampleQuality: 'high', timestamp: '2026-01-01T00:00:00.000Z' }],
      },
      knowledge: {
        queryTags: ['trend'],
        knowledgeNodes: [{ id: 'knowledge-1', nodeType: 'regime', title: 'Trend memory', content: 'Validated memory.', tags: ['trend'], confidence: 0.8, status: 'approved', version: '1.0.0' }],
      },
    });

    expect(result.result.decision).toBe('NO_TRADE');
    expect(result.result.contradictions).toContain('Daily loss limit reached');
    expect(result.evidence.some((item) => item.source === 'ml-intelligence')).toBe(true);
    expect(result.evidence.some((item) => item.source === 'historical-similarity')).toBe(true);
    expect(result.evidence.some((item) => item.source === 'knowledge-intelligence')).toBe(true);
  });

  it('rejects caller-supplied validation booleans without reproducible evidence', () => {
    const result = learningIntelligenceEngine.analyze({
      inputContextId: 'learning-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: [],
      observation: { id: 'obs-1', source: 'paper_trade', facts: { pnl: -10 } },
      hypothesis: 'The setup fails in high volatility.',
      experimentCompleted: true,
      validationPassed: true,
      approved: false,
    });

    expect(result.result.stage).toBe('rejected');
    expect(result.result.nextAction).toContain('INSUFFICIENT_RESEARCH_EVIDENCE');
    expect(result.result.productionMutationAllowed).toBe(false);
  });

  it('keeps a validated research candidate pending an auditable approval record', () => {
    const result = learningIntelligenceEngine.analyze({
      inputContextId: 'learning-evidence-context', symbol: 'BTCUSDT', timeframe: '1h', candles: [],
      observation: { id: 'obs-2', source: 'research', facts: {} },
      hypothesis: 'The setup remains stable in ranging conditions.', experimentCompleted: true,
      validationPassed: true, approved: true,
      validationEvidence: {
        reportId: 'report-1', strategyVersion: 'strategy-1', datasetProvenance: 'provider:dataset-version',
        testWindow: { start: '2026-01-01T00:00:00Z', end: '2026-02-01T00:00:00Z' },
        costsIncluded: true, sampleSize: 100, acceptanceChecksPassed: true,
        metrics: { expectancyR: 0.1, profitFactor: 1.2, maxDrawdownR: 3 },
      },
    });
    expect(result.result.stage).toBe('candidate');
    expect(result.result.productionMutationAllowed).toBe(false);
  });

  it('does not call a zero-trade run out-of-sample ready', () => {
    const input = candles(40);
    const result = researchIntelligenceEngine.analyze({
      inputContextId: 'research-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: input,
      datasetId: 'dataset-1',
      experimentVersion: 'experiment-1',
      signalFn: () => [],
      trainingEndIndex: 30,
      testStartIndex: 30,
      transactionCostRate: 0.001,
      slippageRate: 0.001,
    });

    expect(result.result.leakageDetected).toBe(false);
    expect(result.result.outOfSampleReady).toBe(false);
    expect(result.result.reproducible).toBe(false);
    expect(result.result.warnings.join(' ')).toMatch(/trade|outcome|evidence/i);
  });
});
