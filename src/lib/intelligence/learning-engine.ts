import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

export type LearningStage = 'observation' | 'hypothesis' | 'validated' | 'candidate' | 'approved' | 'rejected';

export interface LearningContext extends EngineContext {
  observation: {
    id: string;
    source: 'paper_trade' | 'research' | 'risk_event' | 'data_quality';
    facts: Record<string, unknown>;
  };
  hypothesis: string;
  experimentCompleted: boolean;
  validationPassed: boolean;
  approved: boolean;
}

export interface LearningAnalysis {
  stage: LearningStage;
  productionMutationAllowed: false;
  nextAction: string;
  observationId: string;
}

const ENGINE_NAME = 'learning-intelligence';
const ENGINE_VERSION = '1.0.0';

export const learningIntelligenceEngine: IntelligenceEngine<LearningAnalysis> & {
  analyze(context: LearningContext): EngineResult<LearningAnalysis>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: LearningContext): EngineResult<LearningAnalysis> {
    const startedAt = performance.now();
    let stage: LearningStage = 'observation';
    let nextAction = 'Form a testable hypothesis from the recorded observation.';
    if (!context.hypothesis.trim()) {
      stage = 'rejected';
      nextAction = 'Provide a non-empty hypothesis before experimentation.';
    } else if (!context.experimentCompleted) {
      stage = 'hypothesis';
      nextAction = 'Run a reproducible experiment before drawing a conclusion.';
    } else if (!context.validationPassed) {
      stage = 'rejected';
      nextAction = 'Reject the hypothesis or revise it and run another validation experiment.';
    } else if (!context.approved) {
      stage = 'candidate';
      nextAction = 'Submit the validated result for explicit approval.';
    } else {
      stage = 'approved';
      nextAction = 'Promote a new versioned artifact through the controlled deployment workflow.';
    }
    const result: LearningAnalysis = {
      stage,
      productionMutationAllowed: false,
      nextAction,
      observationId: context.observation.id,
    };
    const evidence: EngineEvidence[] = [{
      id: `${ENGINE_NAME}:${context.observation.id}`,
      kind: 'calculated',
      source: ENGINE_NAME,
      direction: 'neutral',
      explanation: `Learning workflow is at the ${stage} stage; production mutation remains disabled.`,
    }];

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: stage === 'rejected' ? 'degraded' : 'ok',
      result,
      confidence: stage === 'approved' ? 0.8 : stage === 'candidate' ? 0.5 : 0.2,
      evidence,
      warnings: stage === 'rejected' ? [nextAction] : [],
      latencyMs: performance.now() - startedAt,
    };
  },
};