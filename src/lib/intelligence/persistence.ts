import { supabase } from '../supabase';
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
  const { data, error } = await supabase
    .from('trade_decisions')
    .insert({
      asset_id: input.assetId,
      timeframe_id: input.timeframeId,
      market_context_id: input.marketContextId,
      strategy_version_id: input.strategyVersionId,
      decision_type: decision.decision,
      confidence: decision.confidence,
      risk_score: input.riskScore,
      status: decision.decision === 'NO_TRADE' ? 'rejected' : 'created',
      decision_version: input.decision.engineVersion,
      reasoning: {
        explanation: decision.explanation,
        contradictions: decision.contradictions,
        strategy: decision.strategy,
        inputContextId: input.decision.inputContextId,
      },
    })
    .select('id')
    .single();

  if (error) {
    writeLog(createLogEvent('error', 'decision.persistence.failed', correlationId, { stage: 'decision', error: error.message }));
    throw new DomainError('DATA_ERROR', `Decision persistence failed: ${error.message}`, { stage: 'decision' }, correlationId);
  }

  const decisionRow = data as { id: string } | null;
  if (!decisionRow?.id) {
    throw new DomainError('DATA_ERROR', 'Decision persistence failed: database returned no decision ID.', { stage: 'decision' }, correlationId);
  }

  const evidenceRows = input.decision.evidence.map((item) => ({
    decision_id: decisionRow.id,
    source_type: item.source,
    direction: item.direction,
    weight: item.score ?? 0,
    score: item.score,
    explanation: item.explanation,
    engine_version: input.decision.engineVersion,
  }));

  if (evidenceRows.length > 0) {
    const { error: evidenceError } = await supabase
      .from('decision_evidence')
      .insert(evidenceRows);
    if (evidenceError) {
      writeLog(createLogEvent('error', 'decision.persistence.failed', correlationId, { stage: 'evidence', error: evidenceError.message }));
      throw new DomainError('DATA_ERROR', `Decision evidence persistence failed: ${evidenceError.message}`, { stage: 'evidence', decisionId: decisionRow.id }, correlationId);
    }
  }

  writeLog(createLogEvent('info', 'decision.persistence.completed', correlationId, {
    decisionId: decisionRow.id,
    evidenceCount: evidenceRows.length,
  }));
  return { id: decisionRow.id, evidenceCount: evidenceRows.length };
}