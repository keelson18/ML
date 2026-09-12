import type { EngineResult } from '../intelligence/contracts';
import { masterDecisionEngine, type DecisionEngineContext, type TradeDecision } from '../intelligence/decision-engine';
import { explainabilityEngine, type DecisionExplanation } from '../intelligence/explainability-engine';
import { persistTradeDecision, type DecisionPersistenceInput, type PersistedDecision } from '../intelligence/persistence';

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