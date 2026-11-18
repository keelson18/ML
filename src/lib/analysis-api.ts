import type { DecisionEngineContext } from '../../backend/src/engines/decision-engine';
import { requestBackendDecision, type BackendDecision } from './backend-api';

/**
 * Compatibility entry point for the canonical authenticated backend decision route.
 * Browser-provided candles and auxiliary context are deliberately not forwarded;
 * the backend loads and validates its own closed-candle data and risk context.
 */
export async function requestDecisionAnalysis(context: Pick<DecisionEngineContext, 'symbol' | 'timeframe'>): Promise<BackendDecision | null> {
  return requestBackendDecision(context.symbol, context.timeframe);
}
