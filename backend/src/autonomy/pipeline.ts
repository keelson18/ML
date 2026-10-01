import { fetchKlines } from '../../../src/lib/binance';
import type { Candle, Timeframe } from '../../../src/lib/types';
import { analyze } from '../services/decisionService';
import { executeDecision, getAccount, manageOpenPositions, markCandleProcessed, wasCandleProcessed } from '../services/paperTradingService';
import type { AutonomousConfig, AutonomousState, PipelineResult, PipelineSnapshot } from './types';

const DEFAULT_CONFIG: AutonomousConfig = {
  symbols: ['BTCUSDT', 'ETHUSDT'],
  timeframe: '15m',
  accountId: 'autonomy:default',
  enableExecution: true,
  killZonesUtc: [{ startHour: 8, endHour: 10 }, { startHour: 14, endHour: 17 }],
  maxConsecutiveFailures: 3,
};

export class AutonomousPipeline {
  private readonly config: AutonomousConfig;
  private state: AutonomousState = 'OFFLINE';
  private failures = 0;
  private readonly processedCandles = new Map<string, number>();
  private snapshot: PipelineSnapshot = { state: 'OFFLINE', processedDecisions: 0, executedOrders: 0, skippedRuns: 0, consecutiveFailures: 0 };

  constructor(config: Partial<AutonomousConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config, symbols: config.symbols ?? DEFAULT_CONFIG.symbols };
  }

  getSnapshot(): PipelineSnapshot {
    return { ...this.snapshot, state: this.state };
  }

  getAccount() {
    return getAccount(this.config.accountId);
  }

  start() {
    if (this.state === 'PAUSED') return;
    this.transition('MONITORING');
  }

  pause() {
    this.transition('PAUSED');
  }

  stop() {
    this.transition('OFFLINE');
  }

  async runOnce(symbol: string, timeframe: Timeframe = this.config.timeframe, candles?: Candle[]): Promise<PipelineResult> {
    const series = candles ?? await fetchKlines(symbol, timeframe, 501);
    const closedCandle = series[series.length - 2];
    if (!closedCandle) throw new Error(`No closed candle available for ${symbol}.`);
    if (this.state === 'PAUSED' || this.state === 'OFFLINE') return { symbol, timeframe, candle: closedCandle, skipped: `Pipeline is ${this.state}.`, state: this.state };
    const closedTrades = await manageOpenPositions(this.config.accountId, symbol, closedCandle);
    const candleKey = `${symbol}:${timeframe}`;
    if (this.processedCandles.get(candleKey) === closedCandle.time) return { symbol, timeframe, candle: closedCandle, skipped: 'Closed candle already processed.', closedTrades, state: this.state };
    if (await wasCandleProcessed(this.config.accountId, symbol, timeframe, closedCandle.time)) {
      this.processedCandles.set(candleKey, closedCandle.time);
      return { symbol, timeframe, candle: closedCandle, skipped: 'Closed candle already processed.', closedTrades, state: this.state };
    }
    if (!this.inKillZone()) return { ...this.skip(symbol, timeframe, closedCandle, 'Outside configured kill zone.'), closedTrades };

    this.transition('DECIDING');
    try {
      const result = await analyze({ symbol, timeframe, candles: series.slice(0, -1) }, this.config.accountId);
      const decision = result.decision.result;
      this.snapshot = { ...this.snapshot, state: 'MONITORING', lastRunAt: new Date().toISOString(), lastClosedCandle: { symbol, time: closedCandle.time }, processedDecisions: this.snapshot.processedDecisions + 1, consecutiveFailures: 0 };
      this.failures = 0;

      if (this.config.enableExecution && (decision.decision === 'BUY' || decision.decision === 'SELL')) {
        const order = await executeDecision({ accountId: this.config.accountId, symbol, decision, processedCandle: { timeframe, time: closedCandle.time } });
        this.processedCandles.set(candleKey, closedCandle.time);
        this.snapshot = { ...this.snapshot, executedOrders: this.snapshot.executedOrders + (order.accepted ? 1 : 0) };
        return { symbol, timeframe, candle: closedCandle, decision, order, closedTrades, state: this.state };
      }
      await markCandleProcessed(this.config.accountId, symbol, timeframe, closedCandle.time);
      this.processedCandles.set(candleKey, closedCandle.time);
      return { symbol, timeframe, candle: closedCandle, decision, closedTrades, state: this.state };
    } catch (error) {
      this.failures += 1;
      const errorMessage = error instanceof Error ? error.message : 'Unknown pipeline failure.';
      this.state = this.failures >= this.config.maxConsecutiveFailures ? 'PAUSED' : 'ERROR';
      this.snapshot = { ...this.snapshot, state: this.state, consecutiveFailures: this.failures, lastError: errorMessage };
      throw error;
    } finally {
      if (this.state === 'DECIDING') this.transition('MONITORING');
    }
  }

  private skip(symbol: string, timeframe: Timeframe, candle: Candle, reason: string): PipelineResult {
    this.snapshot = { ...this.snapshot, skippedRuns: this.snapshot.skippedRuns + 1, lastRunAt: new Date().toISOString() };
    return { symbol, timeframe, candle, skipped: reason, state: this.state };
  }

  private inKillZone() {
    const hour = new Date().getUTCHours();
    return this.config.killZonesUtc.some((zone) => hour >= zone.startHour && hour < zone.endHour);
  }

  private transition(state: AutonomousState) {
    this.state = state;
    this.snapshot = { ...this.snapshot, state };
  }
}
