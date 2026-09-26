import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';
import type { TradeDecision } from './decision-engine';
import type { PaperTrade } from './paper-execution';

export type TradeOutcomeClass =
  | 'correct_thesis_good_execution'
  | 'correct_thesis_poor_execution'
  | 'incorrect_thesis'
  | 'risk_failure'
  | 'data_failure'
  | 'strategy_mismatch'
  | 'uncertain';

export interface TradeReviewContext extends EngineContext {
  trade: PaperTrade;
  decision: TradeDecision;
  riskApproved: boolean;
  dataQualityValid: boolean;
  strategyMatched: boolean;
  executionSlippagePct: number;
}

export interface TradeReview {
  outcomeClass: TradeOutcomeClass;
  thesisDirection: 'long' | 'short' | 'none';
  realizedPnl: number;
  executionQuality: 'good' | 'poor' | 'unknown';
  lessons: string[];
}

const ENGINE_NAME = 'trade-review';
const ENGINE_VERSION = '1.0.0';

function thesisDirection(decision: TradeDecision): TradeReview['thesisDirection'] {
  if (decision.decision === 'BUY') return 'long';
  if (decision.decision === 'SELL') return 'short';
  return 'none';
}

export const tradeReviewEngine: IntelligenceEngine<TradeReview> & {
  analyze(context: TradeReviewContext): EngineResult<TradeReview>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: TradeReviewContext): EngineResult<TradeReview> {
    const startedAt = performance.now();
    const executionQuality = Number.isFinite(context.executionSlippagePct)
      ? context.executionSlippagePct <= 0.25 ? 'good' : 'poor'
      : 'unknown';
    let outcomeClass: TradeOutcomeClass = 'uncertain';
    const lessons: string[] = [];

    if (!context.dataQualityValid) {
      outcomeClass = 'data_failure';
      lessons.push('Review the market-data freshness and validation record.');
    } else if (!context.riskApproved) {
      outcomeClass = 'risk_failure';
      lessons.push('Review why the trade reached execution without an approved risk check.');
    } else if (!context.strategyMatched) {
      outcomeClass = 'strategy_mismatch';
      lessons.push('Compare the selected strategy with the recorded market regime and context.');
    } else if (context.trade.realizedPnl > 0 && executionQuality === 'good') {
      outcomeClass = 'correct_thesis_good_execution';
    } else if (context.trade.realizedPnl > 0 && executionQuality === 'poor') {
      outcomeClass = 'correct_thesis_poor_execution';
      lessons.push('The thesis was profitable, but execution slippage should be investigated.');
    } else if (context.trade.realizedPnl < 0) {
      outcomeClass = 'incorrect_thesis';
      lessons.push('Compare the decision evidence with the market context at entry and exit.');
    } else {
      lessons.push('Outcome is near flat; collect more evidence before drawing a conclusion.');
    }

    const result: TradeReview = {
      outcomeClass,
      thesisDirection: thesisDirection(context.decision),
      realizedPnl: context.trade.realizedPnl,
      executionQuality,
      lessons,
    };
    const evidence: EngineEvidence[] = [
      {
        id: `${ENGINE_NAME}:outcome`,
        kind: 'observed',
        source: 'paper-trade',
        direction: 'neutral',
        score: context.trade.realizedPnl,
        explanation: `Recorded realized P&L: ${context.trade.realizedPnl.toFixed(4)}.`,
      },
      {
        id: `${ENGINE_NAME}:execution`,
        kind: 'calculated',
        source: ENGINE_NAME,
        direction: 'neutral',
        score: context.executionSlippagePct,
        explanation: `Recorded execution slippage: ${context.executionSlippagePct.toFixed(4)}%.`,
      },
    ];

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: 'ok',
      result,
      confidence: outcomeClass === 'uncertain' ? 0 : 1,
      evidence,
      warnings: [],
      latencyMs: performance.now() - startedAt,
    };
  },
};