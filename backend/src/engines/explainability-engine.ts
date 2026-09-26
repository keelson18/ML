import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';
import type { TradeDecision } from './decision-engine';

export interface ExplainabilityContext extends EngineContext {
  decision: TradeDecision;
  evidence: EngineEvidence[];
}

export interface DecisionExplanation {
  summary: string;
  supportingFactors: string[];
  contradictingFactors: string[];
  engineContributions: string[];
  invalidationConditions: string[];
  confidenceBreakdown: { factor: string; contribution: number }[];
}

const ENGINE_NAME = 'explainability';
const ENGINE_VERSION = '1.0.0';

export const explainabilityEngine: IntelligenceEngine<DecisionExplanation> & {
  analyze(context: ExplainabilityContext): EngineResult<DecisionExplanation>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: ExplainabilityContext): EngineResult<DecisionExplanation> {
    const startedAt = performance.now();
    const supportingFactors = context.decision.supportingEvidence.map((item) => item.explanation);
    const contradictingFactors = context.decision.contradictions;
    const engineContributions = [...new Set(context.evidence.map((item) => item.source))];
    const confidenceBreakdown = context.evidence
      .filter((item) => item.score !== undefined)
      .map((item) => ({ factor: item.source, contribution: item.score ?? 0 }));
    const invalidationConditions = [
      'No explicit price invalidation level was supplied by the current decision context.',
    ];
    const summary = context.decision.explanation;
    const result: DecisionExplanation = {
      summary,
      supportingFactors,
      contradictingFactors,
      engineContributions,
      invalidationConditions,
      confidenceBreakdown,
    };

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: 'ok',
      result,
      confidence: context.decision.confidence,
      evidence: context.evidence,
      warnings: invalidationConditions,
      latencyMs: performance.now() - startedAt,
    };
  },
};