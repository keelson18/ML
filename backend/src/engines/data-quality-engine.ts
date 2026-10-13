import { TIMEFRAMES } from '../../../src/lib/types';
import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';
import { traderConfig } from '../trader/config';

export interface DataQualityAnalysis {
  valid: boolean;
  validCandleCount: number;
  qualityScore: number;
  freshnessStatus: 'fresh' | 'stale' | 'unknown';
  candleClosure: 'verified_closed' | 'forming' | 'unknown';
  dataState: 'ready' | 'degraded' | 'stale' | 'failed';
  source?: EngineContext['dataSource'];
  anomalies: string[];
}

const ENGINE_NAME = 'data-quality';
const ENGINE_VERSION = '1.0.0';

function timeframeSeconds(timeframe: EngineContext['timeframe']): number {
  const configured = TIMEFRAMES.find((item) => item.value === timeframe);
  if (configured) {
    const units: Record<string, number> = { m: 60, h: 3600, d: 86400, w: 604800, M: 2592000 };
    const unit = configured.value.slice(-1);
    const amount = Number.parseInt(configured.value, 10);
    return amount * (units[unit] ?? 60);
  }
  return 60;
}

function candleAnomalies(context: EngineContext): string[] {
  const anomalies: string[] = [];
  const expectedInterval = timeframeSeconds(context.timeframe);
  let previousTime: number | undefined;

  context.candles.forEach((candle, index) => {
    const values = [candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume];
    if (values.some((value) => !Number.isFinite(value))) {
      anomalies.push(`Candle ${index} contains a non-finite value.`);
    }
    if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0) {
      anomalies.push(`Candle ${index} contains a non-positive price.`);
    }
    if (candle.volume < 0) anomalies.push(`Candle ${index} contains negative volume.`);
    if (candle.high < Math.max(candle.open, candle.close, candle.low)) {
      anomalies.push(`Candle ${index} has an invalid high value.`);
    }
    if (candle.low > Math.min(candle.open, candle.close, candle.high)) {
      anomalies.push(`Candle ${index} has an invalid low value.`);
    }
    if (previousTime !== undefined) {
      const interval = candle.time - previousTime;
      if (interval <= 0) anomalies.push(`Candle ${index} timestamp is duplicated or out of order.`);
      else if (interval > expectedInterval * 1.5) {
        const sessionMarket = context.dataSource?.marketType && context.dataSource.marketType !== 'crypto';
        anomalies.push(sessionMarket
          ? `Candle ${index} follows a possible scheduled market-session gap.`
          : `Candle ${index} follows a data gap.`);
      }
    }
    previousTime = candle.time;
  });

  return anomalies;
}

function hasValidSource(context: EngineContext): boolean {
  const source = context.dataSource;
  if (!source || typeof source.provider !== 'string' || !source.provider.trim()
    || typeof source.datasetId !== 'string' || !source.datasetId.trim()
    || !Number.isFinite(source.fetchedAt) || source.fetchedAt <= 0) return false;
  return context.observedAt === undefined || source.fetchedAt <= context.observedAt * 1000 + 60_000;
}

function evidenceFor(analysis: DataQualityAnalysis): EngineEvidence[] {
  return analysis.anomalies.map((anomaly, index) => ({
    id: `${ENGINE_NAME}:anomaly:${index}`,
    kind: 'observed',
    source: ENGINE_NAME,
    direction: 'neutral',
    score: analysis.qualityScore,
    explanation: anomaly,
  }));
}

export const dataQualityEngine: IntelligenceEngine<DataQualityAnalysis> & {
  analyze(context: EngineContext): EngineResult<DataQualityAnalysis>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: EngineContext): EngineResult<DataQualityAnalysis> {
    const startedAt = performance.now();
    const anomalies = candleAnomalies(context);
    const lastCandle = context.candles[context.candles.length - 1];
    const interval = timeframeSeconds(context.timeframe);
    const staleAfter = interval * traderConfig.MAX_ENTRY_AGE_BARS;
    const freshnessStatus = context.observedAt === undefined || lastCandle === undefined
      ? 'unknown'
      : context.observedAt - lastCandle.time > staleAfter ? 'stale' : 'fresh';
    if (freshnessStatus === 'stale') anomalies.push('Latest candle is stale for the configured timeframe.');
    if (freshnessStatus === 'unknown') anomalies.push('Freshness could not be evaluated without observedAt.');
    if (context.candles.length === 0) anomalies.push('No candles were provided.');
    const candleClosure = context.candleClosure ?? 'unknown';
    if (candleClosure !== 'verified_closed') anomalies.push(candleClosure === 'forming'
      ? 'Latest candle is still forming.'
      : 'Latest candle closure is unknown and cannot confirm an entry.');
    const dataState = context.dataState ?? 'degraded';
    if (dataState !== 'ready') anomalies.push(`Market data state is ${dataState}; actionable analysis requires ready data.`);
    const sourceValid = hasValidSource(context);
    if (!sourceValid) anomalies.push('Provider and dataset provenance are unavailable or invalid.');

    const invalidAnomalies = anomalies.filter((anomaly) => !anomaly.includes('stale')
      && !anomaly.includes('Freshness') && !anomaly.includes('candle closure')
      && !anomaly.includes('still forming') && !anomaly.startsWith('Market data state is ')
      && !anomaly.startsWith('Provider and dataset provenance')
      && !anomaly.includes('scheduled market-session gap'));
    const qualityScore = Math.max(0, Math.min(1, context.candles.length === 0
      ? 0
      : 1 - invalidAnomalies.length / Math.max(context.candles.length, 1)));
    const valid = invalidAnomalies.length === 0 && context.candles.length > 0;
    const status = !valid || dataState === 'failed' ? 'failed'
      : freshnessStatus === 'stale' || freshnessStatus === 'unknown' || candleClosure !== 'verified_closed' || dataState !== 'ready' || !sourceValid ? 'degraded' : 'ok';
    const result: DataQualityAnalysis = {
      valid,
      validCandleCount: valid ? context.candles.length : Math.max(0, context.candles.length - invalidAnomalies.length),
      qualityScore,
      freshnessStatus,
      candleClosure,
      dataState,
      source: context.dataSource,
      anomalies,
    };

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status,
      result,
      confidence: qualityScore,
      evidence: evidenceFor(result),
      warnings: anomalies,
      latencyMs: performance.now() - startedAt,
    };
  },
};
