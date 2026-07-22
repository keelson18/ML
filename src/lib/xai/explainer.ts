import type { Signal, Recommendation, Candle } from '../types';
import { analyzeMarketStructure } from '../market-structure';

// Explainable AI: Generate human-readable explanations for trade signals

export interface TradeExplanation {
  summary: string;
  reasoning: string[];
  riskLevel: 'low' | 'medium' | 'high';
  confidenceBreakdown: { factor: string; contribution: number }[];
  marketContext: string;
}

export function explainTrade(
  recommendation: Recommendation,
  signals: Signal[],
  candles: Candle[],
): TradeExplanation {
  const structure = analyzeMarketStructure(candles.slice(-50));
  const last = candles[candles.length - 1];

  // Determine risk level
  const atrPct = recommendation.atr && last.close
    ? (recommendation.atr / last.close) * 100
    : 0;
  const riskLevel = atrPct > 2 ? 'high' : atrPct > 1 ? 'medium' : 'low';

  // Build reasoning chain
  const reasoning: string[] = [];

  // Market context
  reasoning.push(`Market is in a ${structure.state} phase (strength: ${(structure.trendStrength * 100).toFixed(0)}%)`);

  // Primary signal
  const topContributor = recommendation.contributors
    .filter((c) => c.side === recommendation.side)
    .sort((a, b) => b.weight - a.weight)[0];

  if (topContributor) {
    reasoning.push(`Primary driver: ${topContributor.source} — ${topContributor.reason}`);
  }

  // Confluence
  const sameDirection = signals.filter((s) => s.side === recommendation.side);
  const oppositeDirection = signals.filter((s) => s.side !== 'neutral' && s.side !== recommendation.side);

  if (sameDirection.length >= 2) {
    reasoning.push(`${sameDirection.length} signals align in the ${recommendation.side} direction`);
  }
  if (oppositeDirection.length > 0) {
    reasoning.push(`${oppositeDirection.length} signals suggest caution (${oppositeDirection.map((s) => s.strategy).join(', ')})`);
  }

  // Confidence breakdown
  const confidenceBreakdown = recommendation.contributors.map((c) => ({
    factor: c.source,
    contribution: c.weight * c.confidence,
  }));

  // Summary
  const summary = `${recommendation.side.toUpperCase()} signal with ${(Math.abs(recommendation.score) * 100).toFixed(0)}% conviction. ` +
    `${sameDirection.length} of ${signals.length} active signals support this direction.`;

  return {
    summary,
    reasoning,
    riskLevel,
    confidenceBreakdown,
    marketContext: `Price: $${last.close.toFixed(2)} | ATR: ${atrPct.toFixed(2)}% | Structure: ${structure.state}`,
  };
}

