import { checkRiskLimits, type RiskLimits, type RiskState } from '../risk/limits';
import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

export interface RiskTradeProposal {
  size: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  portfolioValue: number;
}

export interface RiskEngineContext extends EngineContext {
  risk: {
    trade: RiskTradeProposal;
    state: RiskState;
    limits: RiskLimits;
    ruleVersion: string;
  };
}

export interface RiskDecision {
  approved: boolean;
  riskScore: number;
  violatedRules: string[];
  requiredAdjustments: string[];
  ruleVersion: string;
}

const ENGINE_NAME = 'risk-intelligence';
const ENGINE_VERSION = '1.0.0';

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validateTrade(trade: RiskTradeProposal): string[] {
  const reasons: string[] = [];
  if (!isFinitePositive(trade.size)) reasons.push('Position size must be greater than zero.');
  if (!isFinitePositive(trade.entryPrice)) reasons.push('Entry price must be greater than zero.');
  if (!isFinitePositive(trade.stopLossPrice)) reasons.push('Stop loss price must be greater than zero.');
  if (!isFinitePositive(trade.takeProfitPrice)) reasons.push('Take profit price must be greater than zero.');
  if (!isFinitePositive(trade.portfolioValue)) reasons.push('Portfolio value must be greater than zero.');
  return reasons;
}

function buildEvidence(decision: RiskDecision): EngineEvidence[] {
  const evidence = decision.violatedRules.map((rule, index) => ({
    id: `${ENGINE_NAME}:violation:${index}`,
    kind: 'calculated' as const,
    source: ENGINE_NAME,
    direction: 'neutral' as const,
    score: decision.riskScore,
    explanation: rule,
  }));

  if (evidence.length === 0) {
    evidence.push({
      id: `${ENGINE_NAME}:approved`,
      kind: 'calculated',
      source: ENGINE_NAME,
      direction: 'neutral',
      score: decision.riskScore,
      explanation: 'All configured risk limits passed.',
    });
  }

  return evidence;
}

export const riskIntelligenceEngine: IntelligenceEngine<RiskDecision> & {
  analyze(context: RiskEngineContext): EngineResult<RiskDecision>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: RiskEngineContext): EngineResult<RiskDecision> {
    const startedAt = performance.now();
    const invalidTradeReasons = validateTrade(context.risk.trade);
    const limitResult = invalidTradeReasons.length === 0
      ? checkRiskLimits(context.risk.trade, context.risk.state, context.risk.limits)
      : { allowed: false, reasons: invalidTradeReasons };
    const violatedRules = limitResult.reasons;
    const riskScore = Math.min(1, violatedRules.length / 4);
    const requiredAdjustments = violatedRules.length > 0
      ? ['Resolve every violated risk rule before paper execution.']
      : [];
    const decision: RiskDecision = {
      approved: limitResult.allowed,
      riskScore,
      violatedRules,
      requiredAdjustments,
      ruleVersion: context.risk.ruleVersion,
    };

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: 'ok',
      result: decision,
      confidence: limitResult.allowed ? 1 : 0,
      evidence: buildEvidence(decision),
      warnings: [],
      latencyMs: performance.now() - startedAt,
    };
  },
};