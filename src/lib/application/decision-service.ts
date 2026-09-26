import type { EngineResult } from '../../../backend/src/engines/contracts';
import { masterDecisionEngine, type DecisionEngineContext, type TradeDecision } from '../../../backend/src/engines/decision-engine';
import { explainabilityEngine, type DecisionExplanation } from '../../../backend/src/engines/explainability-engine';
import { persistTradeDecision, type DecisionPersistenceInput, type PersistedDecision } from '../persistence/persistence';

export interface DecisionServiceInput extends DecisionEngineContext {
  persistence?: Omit<DecisionPersistenceInput, 'decision'>;
}

export interface DecisionServiceResult {
  decision: EngineResult<TradeDecision>;
  explanation: EngineResult<DecisionExplanation>;
  persisted?: PersistedDecision;
}

export async function analyzeDecision(input: DecisionServiceInput): Promise<DecisionServiceResult> {
  const decision = masterDecisionEngine.analyze(input);
  const explanation = explainabilityEngine.analyze({
    ...input,
    decision: decision.result,
    evidence: decision.evidence,
  });
  const persisted = input.persistence
    ? await persistTradeDecision({ ...input.persistence, decision })
    : undefined;

  return { decision, explanation, persisted };
}