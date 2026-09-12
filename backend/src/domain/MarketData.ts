/**
 * Market Data Domain
 * Represents OHLCV candle data and market states
 */

export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';

export interface OHLCV {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleMetadata {
  source: string; // e.g., 'binance', 'provider-x'
  qualityStatus: 'valid' | 'questionable' | 'suspicious';
  fetchedAt?: Date;
}

/**
 * Candle: Immutable market data point
 */
export class Candle implements OHLCV {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly metadata: CandleMetadata;

  constructor(
    data: OHLCV,
    metadata: CandleMetadata = { source: 'unknown', qualityStatus: 'valid' },
  ) {
    this.time = data.time;
    this.open = data.open;
    this.high = data.high;
    this.low = data.low;
    this.close = data.close;
    this.volume = data.volume;
    this.metadata = metadata;

    this.validate();
  }

  private validate(): void {
    if (this.open <= 0 || this.high <= 0 || this.low <= 0 || this.close <= 0) {
      throw new Error('Invalid OHLC: prices must be positive');
    }
    if (this.high < this.low || this.high < this.open || this.high < this.close) {
      throw new Error('Invalid candle: high < low or high < open/close');
    }
    if (this.low > this.open || this.low > this.close) {
      throw new Error('Invalid candle: low > open or low > close');
    }
    if (this.volume < 0) {
      throw new Error('Invalid candle: volume cannot be negative');
    }
  }

  range(): number {
    return this.high - this.low;
  }

  isValid(): boolean {
    return this.metadata.qualityStatus === 'valid';
  }

  toJSON() {
    return {
      time: this.time,
      open: this.open,
      high: this.high,
      low: this.low,
      close: this.close,
      volume: this.volume,
    };
  }
}

/**
 * CandleSequence: Time-ordered sequence of candles
 */
export class CandleSequence {
  private candles: Candle[];

  constructor(candles: Candle[] = []) {
    this.candles = candles.sort((a, b) => a.time - b.time);
    this.validateSequence();
  }

  private validateSequence(): void {
    for (let i = 1; i < this.candles.length; i++) {
      if (this.candles[i].time <= this.candles[i - 1].time) {
        throw new Error('Duplicate or out-of-order timestamps in sequence');
      }
    }
  }

  length(): number {
    return this.candles.length;
  }

  get(index: number): Candle | undefined {
    return this.candles[index];
  }

  latest(): Candle | undefined {
    return this.candles[this.candles.length - 1];
  }

  range(from: number, to: number): Candle[] {
    return this.candles.filter((c) => c.time >= from && c.time <= to);
  }

  last(count: number): Candle[] {
    return this.candles.slice(Math.max(0, this.candles.length - count));
  }

  toArray(): Candle[] {
    return [...this.candles];
  }

  add(candle: Candle): void {
    if (this.candles.length > 0 && candle.time <= this.candles[this.candles.length - 1].time) {
      throw new Error('Cannot add candle with time <= latest candle time');
    }
    this.candles.push(candle);
  }

  update(index: number, candle: Candle): void {
    if (index < 0 || index >= this.candles.length) {
      throw new Error('Index out of bounds');
    }
    this.candles[index] = candle;
  }
}
