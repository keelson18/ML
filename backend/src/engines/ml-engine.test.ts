import { describe, expect, it } from 'vitest';
import { mlIntelligenceEngine } from './ml-engine';

const baseContext = {
  inputContextId: 'ctx-1',
  symbol: 'BTCUSD',
  timeframe: '1h' as const,
  candles: [],
  datasetId: 'dataset-1',
  featureSnapshot: { candleCount: 100 },
};

function prediction(overrides: Record<string, unknown> = {}) {
  return {
    pair: 'BTCUSD',
    timeframe: '1h' as const,
    prediction: 'up' as const,
    probability: 0.7,
    expected_move_pct: 1,
    model_version: 'model-1',
    confidence: 'high' as const,
    edge_status: 'beats-momentum-baseline' as const,
    dataset_id: 'dataset-1',
    data_fetched_at: Date.now(),
    prediction_timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('ML intelligence engine', () => {
  it('accepts only fresh, lineage-matched predictions with a validated edge', () => {
    const result = mlIntelligenceEngine.analyze({ ...baseContext, prediction: prediction() });

    expect(result.status).toBe('ok');
    expect(result.result.usable).toBe(true);
    expect(result.confidence).toBe(0.7);
  });

  it('downgrades mismatched lineage and no-edge predictions', () => {
    const mismatched = mlIntelligenceEngine.analyze({
      ...baseContext,
      prediction: prediction({ dataset_id: 'other-dataset', edge_status: 'no-edge' }),
    });

    expect(mismatched.status).toBe('degraded');
    expect(mismatched.result.usable).toBe(false);
    expect(mismatched.confidence).toBe(0);
    expect(mismatched.warnings.length).toBeGreaterThan(0);
  });
});
