import { DomainError } from './errors';
import { createCorrelationId } from './observability';
import { supabase } from './supabase';
import type { DecisionEngineContext } from '../../backend/src/engines/decision-engine';
import type { DecisionServiceResult } from './application/decision-service';

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export async function requestDecisionAnalysis(context: DecisionEngineContext): Promise<DecisionServiceResult> {
  const correlationId = createCorrelationId();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new DomainError('AUTHENTICATION_ERROR', 'Authentication is required for decision analysis.', {}, correlationId);
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/decision-analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey ?? '',
      Authorization: `Bearer ${session.access_token}`,
      'x-correlation-id': correlationId,
    },
    body: JSON.stringify(context),
  });

  if (!response.ok) {
    throw new DomainError(
      'INTELLIGENCE_ERROR',
      `Decision analysis failed (${response.status}).`,
      { status: response.status },
      correlationId,
    );
  }
  return await response.json() as DecisionServiceResult;
}
