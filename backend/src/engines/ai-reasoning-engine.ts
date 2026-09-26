import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

export interface AIReasoningContext extends EngineContext {
  evidence: EngineEvidence[];
  contradictions: string[];
}

export interface AIReasoningAnalysis {
  summary: string;
  supportingEvidence: string[];
  conflictingEvidence: string[];
  uncertainty: string[];
  authoritative: false;
}

const ENGINE_NAME = 'ai-reasoning';
const ENGINE_VERSION = '1.0.0';

export const aiReasoningEngine: IntelligenceEngine<AIReasoningAnalysis> & {
  analyze(context: AIReasoningContext): EngineResult<AIReasoningAnalysis>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: AIReasoningContext): EngineResult<AIReasoningAnalysis> {
    const startedAt = performance.now();
    const supportingEvidence = context.evidence
      .filter((item) => item.direction !== 'neutral')
      .map((item) => item.explanation);
    const conflictingEvidence = context.contradictions;
    const uncertainty: string[] = [];
    if (context.evidence.length === 0) uncertainty.push('No structured evidence was supplied.');
    if (context.contradictions.length > 0) uncertainty.push('Conflicting evidence requires a lower-confidence or no-trade outcome.');
    const result: AIReasoningAnalysis = {
      summary: supportingEvidence.length > 0
        ? `Structured reasoning found ${supportingEvidence.length} directional evidence item(s).`
        : 'Structured reasoning found no directional evidence.',
      supportingEvidence,
      conflictingEvidence,
      uncertainty,
      authoritative: false,
    };
    const evidence: EngineEvidence[] = [{
      id: `${ENGINE_NAME}:summary`,
      kind: 'inferred',
      source: ENGINE_NAME,
      direction: 'neutral',
      score: supportingEvidence.length > 0 ? 0.5 : 0,
      explanation: result.summary,
    }];

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: 'ok',
      result,
      confidence: 0.5,
      evidence,
      warnings: uncertainty,
      latencyMs: performance.now() - startedAt,
    };
  },
};