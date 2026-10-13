import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';
import { traderConfig } from '../trader/config';

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
  validationEvidence?: {
    reportId: string;
    strategyVersion: string;
    datasetProvenance: string;
    testWindow: { start: string; end: string };
    costsIncluded: boolean;
    sampleSize: number;
    acceptanceChecksPassed: boolean;
    metrics: { expectancyR: number; profitFactor: number; maxDrawdownR: number };
  };
  approvalEvidence?: { approvalId: string; approvedBy: string; approvedAt: string; rollbackVersion: string };
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
    } else if (!context.validationPassed || !hasValidValidationEvidence(context.validationEvidence)) {
      stage = 'rejected';
      nextAction = 'INSUFFICIENT_RESEARCH_EVIDENCE: provide a reproducible out-of-sample validation report with costs, sample size, metrics, and passed acceptance checks.';
    } else if (!context.approved || !hasValidApprovalEvidence(context.approvalEvidence)) {
      stage = 'candidate';
      nextAction = 'Candidate is validated; record an attributable approval and rollback target before any promotion.';
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
      confidence: stage === 'approved' ? 0.8 : stage === 'candidate' ? 0.5 : stage === 'rejected' ? 0 : 0.2,
      evidence,
      warnings: stage === 'rejected' ? [nextAction] : [],
      latencyMs: performance.now() - startedAt,
    };
  },
};

function hasValidValidationEvidence(evidence: LearningContext['validationEvidence']): boolean {
  if (!evidence || typeof evidence.reportId !== 'string' || typeof evidence.strategyVersion !== 'string'
    || typeof evidence.datasetProvenance !== 'string' || !evidence.reportId.trim()
    || !evidence.strategyVersion.trim() || !evidence.datasetProvenance.trim()) return false;
  if (!evidence.testWindow || typeof evidence.testWindow.start !== 'string' || typeof evidence.testWindow.end !== 'string'
    || !evidence.metrics) return false;
  const start = Date.parse(evidence.testWindow.start);
  const end = Date.parse(evidence.testWindow.end);
  const windowDays = (end - start) / 86_400_000;
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    && windowDays >= traderConfig.MIN_FORWARD_DAYS
    && evidence.costsIncluded && Number.isInteger(evidence.sampleSize) && evidence.sampleSize >= traderConfig.MIN_FORWARD_TRADES
    && evidence.acceptanceChecksPassed
    && Number.isFinite(evidence.metrics.expectancyR) && evidence.metrics.expectancyR > 0
    && Number.isFinite(evidence.metrics.profitFactor) && evidence.metrics.profitFactor > 1
    && Number.isFinite(evidence.metrics.maxDrawdownR) && evidence.metrics.maxDrawdownR >= 0;
}

function hasValidApprovalEvidence(evidence: LearningContext['approvalEvidence']): boolean {
  return Boolean(evidence && typeof evidence.approvalId === 'string' && evidence.approvalId.trim()
    && typeof evidence.approvedBy === 'string' && evidence.approvedBy.trim()
    && typeof evidence.rollbackVersion === 'string' && evidence.rollbackVersion.trim()
    && Number.isFinite(Date.parse(evidence.approvedAt)));
}
