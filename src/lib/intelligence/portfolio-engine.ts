import { analyzePortfolioRisk, type PortfolioPosition, type PortfolioRisk } from '../risk/portfolio';
import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

export interface PortfolioTradeProposal {
  symbol: string;
  marketType: string;
  size: number;
  entryPrice: number;
}

export interface PortfolioEngineContext extends EngineContext {
  portfolio: {
    value: number;
    positions: PortfolioPosition[];
    proposedTrade: PortfolioTradeProposal;
    limits: {
      maxExposureRatio: number;
      maxConcentrationRisk: number;
      maxCorrelationRisk: number;
    };
    ruleVersion: string;
  };
}

export interface PortfolioDecision {
  approved: boolean;
  current: PortfolioRisk;
  projected: PortfolioRisk;
  violatedRules: string[];
  ruleVersion: string;
}

const ENGINE_NAME = 'portfolio-intelligence';
const ENGINE_VERSION = '1.0.0';

function buildEvidence(decision: PortfolioDecision): EngineEvidence[] {
  const evidence: EngineEvidence[] = decision.violatedRules.map((rule, index) => ({
    id: `${ENGINE_NAME}:violation:${index}`,
    kind: 'calculated' as const,
    source: ENGINE_NAME,
    direction: 'neutral' as const,
    explanation: rule,
  }));

  evidence.push({
    id: `${ENGINE_NAME}:projected-exposure`,
    kind: 'calculated',
    source: ENGINE_NAME,
    direction: 'neutral',
    score: decision.projected.totalExposure,
    explanation: `Projected exposure is ${decision.projected.totalExposure.toFixed(2)} after the proposed position.`,
  });
  return evidence;
}

export const portfolioIntelligenceEngine: IntelligenceEngine<PortfolioDecision> & {
  analyze(context: PortfolioEngineContext): EngineResult<PortfolioDecision>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: PortfolioEngineContext): EngineResult<PortfolioDecision> {
    const startedAt = performance.now();
    const { portfolio } = context;
    const current = analyzePortfolioRisk(portfolio.positions);
    const proposedPosition: PortfolioPosition = {
      ...portfolio.proposedTrade,
      currentPrice: portfolio.proposedTrade.entryPrice,
      pnl: 0,
      pnlPct: 0,
      weight: 0,
    };
    const projected = analyzePortfolioRisk([...portfolio.positions, proposedPosition]);
    const violatedRules: string[] = [];
    const projectedExposureRatio = portfolio.value > 0 ? projected.totalExposure / portfolio.value : Infinity;

    if (projectedExposureRatio > portfolio.limits.maxExposureRatio) {
      violatedRules.push(`Projected exposure would exceed ${(portfolio.limits.maxExposureRatio * 100).toFixed(0)}% of portfolio value.`);
    }
    if (projected.concentrationRisk > portfolio.limits.maxConcentrationRisk) {
      violatedRules.push('Projected concentration risk exceeds the configured limit.');
    }
    if (projected.correlationRisk > portfolio.limits.maxCorrelationRisk) {
      violatedRules.push('Projected correlation risk exceeds the configured limit.');
    }

    const decision: PortfolioDecision = {
      approved: violatedRules.length === 0,
      current,
      projected,
      violatedRules,
      ruleVersion: portfolio.ruleVersion,
    };

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: 'ok',
      result: decision,
      confidence: violatedRules.length === 0 ? 1 : 0,
      evidence: buildEvidence(decision),
      warnings: [],
      latencyMs: performance.now() - startedAt,
    };
  },
};