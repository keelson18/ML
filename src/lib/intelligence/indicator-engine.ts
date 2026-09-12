import { adx } from '../indicators/adx';
import { atr, bollinger, ema, macd, rsi, sma } from '../indicators';
import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

export interface IndicatorAnalysis {
  latest: {
    sma20?: number;
    ema20?: number;
    rsi?: number;
    macd?: number;
    macdSignal?: number;
    atr?: number;
    atrPct?: number;
    adx?: number;
    bollingerWidth?: number;
  };
  momentumState: 'bullish' | 'bearish' | 'neutral' | 'unknown';
  volatilityState: 'high' | 'normal' | 'low' | 'unknown';
}

const ENGINE_NAME = 'indicator-intelligence';
const ENGINE_VERSION = '1.0.0';

function finiteOrUndefined(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function evidenceFor(result: IndicatorAnalysis): EngineEvidence[] {
  const evidence: EngineEvidence[] = [];
  if (result.latest.rsi !== undefined) {
    evidence.push({
      id: `${ENGINE_NAME}:rsi`,
      kind: 'calculated',
      source: 'RSI',
      direction: result.momentumState === 'bullish' ? 'bullish' : result.momentumState === 'bearish' ? 'bearish' : 'neutral',
      score: result.latest.rsi / 100,
      explanation: `RSI is ${result.latest.rsi.toFixed(2)}.`,
    });
  }
  if (result.latest.atrPct !== undefined) {
    evidence.push({
      id: `${ENGINE_NAME}:atr`,
      kind: 'calculated',
      source: 'ATR',
      direction: 'neutral',
      score: result.latest.atrPct,
      explanation: `ATR is ${result.latest.atrPct.toFixed(4)} of price; volatility is ${result.volatilityState}.`,
    });
  }
  return evidence;
}

export const indicatorIntelligenceEngine: IntelligenceEngine<IndicatorAnalysis> & {
  analyze(context: EngineContext): EngineResult<IndicatorAnalysis>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: EngineContext): EngineResult<IndicatorAnalysis> {
    const startedAt = performance.now();
    const closes = context.candles.map((candle) => candle.close);
    const latestIndex = closes.length - 1;
    const smaValues = sma(closes, 20);
    const emaValues = ema(closes, 20);
    const rsiValues = rsi(closes, 14);
    const macdValues = macd(closes);
    const atrValues = atr(context.candles, 14);
    const adxValues = adx(context.candles, 14);
    const bands = bollinger(closes, 20, 2);
    const latestPrice = context.candles[latestIndex]?.close;
    const latestAtr = finiteOrUndefined(atrValues[latestIndex]);
    const atrPct = latestAtr !== undefined && latestPrice > 0 ? latestAtr / latestPrice : undefined;
    const latestRsi = finiteOrUndefined(rsiValues[latestIndex]);
    const latestMacd = finiteOrUndefined(macdValues.macd[latestIndex]);
    const latestMacdSignal = finiteOrUndefined(macdValues.signal[latestIndex]);
    const momentumState = latestRsi === undefined || latestMacd === undefined || latestMacdSignal === undefined
      ? 'unknown'
      : latestRsi >= 55 && latestMacd >= latestMacdSignal ? 'bullish'
        : latestRsi <= 45 && latestMacd <= latestMacdSignal ? 'bearish'
          : 'neutral';
    const volatilityState = atrPct === undefined
      ? 'unknown'
      : atrPct >= 0.02 ? 'high'
        : atrPct <= 0.005 ? 'low'
          : 'normal';
    const result: IndicatorAnalysis = {
      latest: {
        sma20: finiteOrUndefined(smaValues[latestIndex]),
        ema20: finiteOrUndefined(emaValues[latestIndex]),
        rsi: latestRsi,
        macd: latestMacd,
        macdSignal: latestMacdSignal,
        atr: latestAtr,
        atrPct,
        adx: finiteOrUndefined(adxValues.adx[latestIndex]),
        bollingerWidth: finiteOrUndefined(bands.width[latestIndex]),
      },
      momentumState,
      volatilityState,
    };

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: context.candles.length < 20 ? 'degraded' : 'ok',
      result,
      confidence: momentumState === 'unknown' ? 0.2 : 0.7,
      evidence: evidenceFor(result),
      warnings: context.candles.length < 20 ? ['At least 20 candles are recommended for indicator analysis.'] : [],
      latencyMs: performance.now() - startedAt,
    };
  },
};