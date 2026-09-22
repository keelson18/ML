import { api } from '../../api';
import { DomainError } from '../errors';
import { createCorrelationId, createLogEvent, writeLog } from '../observability';
import type { EngineResult } from './contracts';
import type { TradeDecision } from './decision-engine';

export interface DecisionPersistenceInput {
  assetId: string;
  timeframeId: string;
  marketContextId?: string;
  strategyVersionId?: string;
  riskScore?: number;
  decision: EngineResult<TradeDecision>;
  correlationId?: string;
}

export interface PersistedDecision {
  id: string;
  evidenceCount: number;
}

export async function persistTradeDecision(input: DecisionPersistenceInput): Promise<PersistedDecision> {
  const correlationId = input.correlationId ?? input.decision.correlationId ?? createCorrelationId();
  const decision = input.decision.result;
  writeLog(createLogEvent('info', 'decision.persistence.started', correlationId, {
    inputContextId: input.decision.inputContextId,
    decision: decision.decision,
  }));

  try {
    const result = await api.post<PersistedDecision>('/trading/decisions', {
      assetId: input.assetId,
      timeframeId: input.timeframeId,
      marketContextId: input.marketContextId,
      strategyVersionId: input.strategyVersionId,
      riskScore: input.riskScore,
      decision: {
        decisionType: decision.decision,
        confidence: decision.confidence,
        status: decision.decision === 'NO_TRADE' ? 'rejected' : 'created',
        decisionVersion: input.decision.engineVersion,
        reasoning: {
          explanation: decision.explanation,
          contradictions: decision.contradictions,
          strategy: decision.strategy,
          inputContextId: input.decision.inputContextId,
        },
      },
      evidence: input.decision.evidence.map((item) => ({
        sourceType: item.source,
        direction: item.direction,
        weight: item.score ?? 0,
        score: item.score,
        explanation: item.explanation,
        engineVersion: input.decision.engineVersion,
      })),
    });

    writeLog(createLogEvent('info', 'decision.persistence.completed', correlationId, {
      decisionId: result.id,
      evidenceCount: result.evidenceCount,
    }));
    return result;
  } catch (e) {
    writeLog(createLogEvent('error', 'decision.persistence.failed', correlationId, { error: e instanceof Error ? e.message : 'unknown' }));
    throw new DomainError('DATA_ERROR', `Decision persistence failed: ${e instanceof Error ? e.message : 'unknown'}`, { stage: 'decision' }, correlationId);
  }
}
