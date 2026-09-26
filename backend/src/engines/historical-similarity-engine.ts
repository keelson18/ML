import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

export interface HistoricalCase {
  id: string;
  featureVector: number[];
  outcome: string;
  sampleQuality: 'high' | 'medium' | 'low';
  timestamp: string;
}

export interface HistoricalSimilarityContext extends EngineContext {
  currentFeatureVector: number[];
  historicalCases: HistoricalCase[];
  minimumSimilarity?: number;
}

export interface SimilarHistoricalCase {
  id: string;
  similarity: number;
  outcome: string;
  sampleQuality: HistoricalCase['sampleQuality'];
  timestamp: string;
}

export interface HistoricalSimilarityAnalysis {
  matches: SimilarHistoricalCase[];
  sampleSize: number;
  sampleQuality: 'high' | 'medium' | 'low' | 'none';
}

const ENGINE_NAME = 'historical-similarity';
const ENGINE_VERSION = '1.0.0';

function similarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length || left.some((value) => !Number.isFinite(value)) || right.some((value) => !Number.isFinite(value))) return 0;
  const distance = Math.sqrt(left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0));
  const scale = Math.sqrt(left.reduce((sum, value) => sum + value ** 2, 0)) + Math.sqrt(right.reduce((sum, value) => sum + value ** 2, 0));
  return scale > 0 ? Math.max(0, Math.min(1, 1 - distance / scale)) : 1;
}

export const historicalSimilarityEngine: IntelligenceEngine<HistoricalSimilarityAnalysis> & {
  analyze(context: HistoricalSimilarityContext): EngineResult<HistoricalSimilarityAnalysis>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: HistoricalSimilarityContext): EngineResult<HistoricalSimilarityAnalysis> {
    const startedAt = performance.now();
    const threshold = context.minimumSimilarity ?? 0.7;
    const matches = context.historicalCases
      .map((historicalCase) => ({
        ...historicalCase,
        similarity: similarity(context.currentFeatureVector, historicalCase.featureVector),
      }))
      .filter((historicalCase) => historicalCase.similarity >= threshold)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 20)
      .map(({ id, similarity: matchScore, outcome, sampleQuality, timestamp }) => ({
        id,
        similarity: matchScore,
        outcome,
        sampleQuality,
        timestamp,
      }));
    const sampleQuality = matches.length === 0
      ? 'none'
      : matches.every((match) => match.sampleQuality === 'high')
        ? 'high'
        : matches.some((match) => match.sampleQuality === 'medium' || match.sampleQuality === 'high')
          ? 'medium'
          : 'low';
    const result: HistoricalSimilarityAnalysis = { matches, sampleSize: matches.length, sampleQuality };
    const evidence: EngineEvidence[] = matches.map((match) => ({
      id: `${ENGINE_NAME}:${match.id}`,
      kind: 'historical',
      source: ENGINE_NAME,
      direction: 'neutral',
      score: match.similarity,
      explanation: `Historical case ${match.id} matched at ${(match.similarity * 100).toFixed(1)}% similarity with ${match.sampleQuality} sample quality.`,
    }));

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: context.historicalCases.length === 0 ? 'degraded' : 'ok',
      result,
      confidence: sampleQuality === 'high' ? 0.8 : sampleQuality === 'medium' ? 0.5 : 0.2,
      evidence,
      warnings: matches.length === 0 ? ['No sufficiently similar historical cases were found.'] : [],
      latencyMs: performance.now() - startedAt,
    };
  },
};