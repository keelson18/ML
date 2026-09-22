import { DomainError } from './errors';
import { createCorrelationId } from './observability';
import { api } from '../api';
import type { DecisionEngineContext } from './intelligence/decision-engine';
import type { DecisionServiceResult } from './application/decision-service';

export async function requestDecisionAnalysis(context: DecisionEngineContext): Promise<DecisionServiceResult> {
  const correlationId = createCorrelationId();
  try {
    const result = await api.post<DecisionServiceResult>('/decision/analyze', context);
    return result;
  } catch (e) {
    throw new DomainError(
      'INTELLIGENCE_ERROR',
      e instanceof Error ? e.message : 'Decision analysis failed.',
      {},
      correlationId,
    );
  }
}
