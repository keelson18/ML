import { DomainError } from './errors';
import { createCorrelationId } from './observability';
import { supabase } from './supabase';
import type { DecisionEngineContext } from './intelligence/decision-engine';
import type { DecisionServiceResult } from './application/decision-service';

export async function requestDecisionAnalysis(context: DecisionEngineContext): Promise<DecisionServiceResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const correlationId = createCorrelationId();
  if (!session) {
    throw new DomainError('AUTHENTICATION_ERROR', 'Authentication is required for decision analysis.', {}, correlationId);
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/decision-analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      'x-correlation-id': correlationId,
    },
    body: JSON.stringify(context),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new DomainError(
      response.status === 401 ? 'AUTHENTICATION_ERROR' : response.status === 403 ? 'AUTHORIZATION_ERROR' : 'INTELLIGENCE_ERROR',
      payload.error ?? 'Decision analysis failed.',
      { status: response.status },
      payload.correlationId ?? correlationId,
    );
  }
  return payload as DecisionServiceResult;
}