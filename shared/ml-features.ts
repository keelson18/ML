export interface MlCandle { time: number; open: number; high: number; low: number; close: number; volume: number }

export function computeRsi(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(50);
  if (closes.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i]! - closes[i - 1]!;
    if (change > 0) gain += change;
    else loss -= change;
  }

  let averageGain = gain / period;
  let averageLoss = loss / period;
  out[period] = averageGain === 0 && averageLoss === 0
    ? 50
    : averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);

  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i]! - closes[i - 1]!;
    averageGain = (averageGain * (period - 1) + Math.max(0, change)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(0, -change)) / period;
    out[i] = averageGain === 0 && averageLoss === 0
      ? 50
      : averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return out;
}

export function computeMlFeatures(
  candles: MlCandle[],
  options: { predictionHorizon?: number; minimumMoveAtr?: number } = {},
): { features: number[][]; labels: Array<number | null>; sampleIndices: number[]; forwardReturns: number[]; valid: boolean } {
  const predictionHorizon = options.predictionHorizon ?? 5;
  const minimumMoveAtr = options.minimumMoveAtr ?? 0.1;
  if (!Number.isInteger(predictionHorizon) || predictionHorizon < 1) throw new Error('Prediction horizon must be a positive integer.');
  if (!Number.isFinite(minimumMoveAtr) || minimumMoveAtr < 0) throw new Error('Minimum ATR move must be finite and non-negative.');
  if (candles.length < 210) return { features: [], labels: [], sampleIndices: [], forwardReturns: [], valid: false };

  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const volumes = candles.map((candle) => candle.volume);
  const ema = (values: number[], period: number) => {
    const multiplier = 2 / (period + 1);
    let previous = values[0]!;
    return values.map((_, index) => (index === 0 ? previous : (previous = values[index]! * multiplier + previous * (1 - multiplier))));
  };
  const sma = (values: number[], period: number) => values.map((_, index) =>
    index < period - 1 ? Number.NaN : values.slice(index - period + 1, index + 1).reduce((sum, value) => sum + value, 0) / period);

  const rsi = computeRsi(closes);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((value, index) => value - ema26[index]!);
  const macdSignal = ema(macdLine, 9);
  const bbWidth = ma20.map((middle, index) => {
    if (Number.isNaN(middle)) return 0;
    let sumSquared = 0;
    for (let cursor = index - 19; cursor <= index; cursor += 1) sumSquared += (closes[cursor]! - middle) ** 2;
    return (4 * Math.sqrt(sumSquared / 20)) / middle;
  });
  const volumeChange = volumes.map((volume, index) => index === 0 ? 0 : volume / (volumes[index - 1]! || 1) - 1);
  const atr = new Array<number>(closes.length).fill(0);
  for (let i = 1; i < closes.length; i += 1) {
    const trueRange = Math.max(highs[i]! - lows[i]!, Math.abs(highs[i]! - closes[i - 1]!), Math.abs(lows[i]! - closes[i - 1]!));
    atr[i] = i < 14 ? trueRange : (atr[i - 1]! * 13 + trueRange) / 14;
  }

  const features: number[][] = [];
  const labels: Array<number | null> = [];
  const sampleIndices: number[] = [];
  const forwardReturns: number[] = [];
  for (let i = 200; i < closes.length - predictionHorizon; i += 1) {
    const price = closes[i]!;
    const threshold = minimumMoveAtr * atr[i]!;
    const future = closes[i + predictionHorizon]!;
    const label = future > price + threshold ? 1 : future < price - threshold ? 0 : undefined;
    const ret = (period: number) => price / closes[i - period]! - 1;
    features.push([
      ret(1), ret(3), ret(5), ret(10), ret(20), rsi[i]! / 100,
      macdLine[i]! / price, macdSignal[i]! / price,
      ma20[i]! / price - 1, ma50[i]! / price - 1, ma200[i]! / price - 1,
      bbWidth[i]!, volumeChange[i]!, atr[i]! / price,
    ]);
    labels.push(label ?? null);
    sampleIndices.push(i);
    forwardReturns.push((future - price) / price);
  }
  return { features, labels, sampleIndices, forwardReturns, valid: labels.filter((label) => label !== null).length > 50 };
}
