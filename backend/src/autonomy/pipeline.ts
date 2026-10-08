import type { Candle, Timeframe } from '../../../src/lib/types';
import { analyze } from '../services/decisionService';
import { advanceStoredTradePlans, generateDailyAccountReview, getAccount, manageOpenPositions, markCandleProcessed, storeTradePlan, wasCandleProcessed } from '../services/paperTradingService';
import { fetchMarketData } from '../services/marketDataService';
import type { AutonomousConfig, AutonomousState, PipelineResult, PipelineRole, PipelineSnapshot } from './types';
import { getDefaultSymbols } from '../constants/markets';
import { getMarket } from '../../../src/lib/markets';
import { evaluateMarketSession } from '../trader/sessions';
import { selectClosedCandles, candleDurationMs } from './candle-clock';
import { traderConfig } from '../trader/config';
import { createTradePlan } from '../trader/planner';

const DEFAULT_CONFIG: AutonomousConfig = {
  symbols: getDefaultSymbols(),
  timeframe: '15m',
  accountId: 'autonomy:default',
  enableExecution: true,
  maxConsecutiveFailures: 3,
};

export class AutonomousPipeline {
  private readonly config: AutonomousConfig;
  private state: AutonomousState = 'OFFLINE';
  private failures = 0;
  private readonly processedCandles = new Map<string, number>();
  private schedulerControl?: { start: () => void; stop: () => void };
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

  bindScheduler(control: { start: () => void; stop: () => void }) {
    this.schedulerControl = control;
  }

  start() {
    this.transition('MONITORING');
    this.snapshot = { ...this.snapshot, stateReason: undefined };
    this.schedulerControl?.start();
  }

  pause() {
    this.transition('PAUSED');
    this.schedulerControl?.stop();
  }

  stop() {
    this.transition('OFFLINE');
    this.schedulerControl?.stop();
  }

  pauseByRisk(reason: string) {
    this.state = 'PAUSED_BY_RISK';
    this.snapshot = { ...this.snapshot, state: this.state, stateReason: reason, lastError: reason };
    this.schedulerControl?.stop();
  }

  async runOnce(
    symbol: string,
    timeframe: Timeframe = this.config.timeframe,
    candles?: Candle[],
    role: PipelineRole = 'executor',
    candlesAreClosed = false,
  ): Promise<PipelineResult> {
    const fetchedSeries = candles ? undefined : await fetchMarketData(symbol, timeframe, 501);
    const rawCandles = candles ?? fetchedSeries!.candles;
    const series = candlesAreClosed ? rawCandles : selectClosedCandles(rawCandles, timeframe, Date.now(), traderConfig.CLOSE_GRACE_MS);
    const closedCandle = series.at(-1);
    if (!closedCandle) throw new Error(`No closed candle available for ${symbol}.`);
    if (this.state === 'PAUSED' || this.state === 'PAUSED_BY_RISK' || this.state === 'OFFLINE') {
      return { role, symbol, timeframe, candle: closedCandle, skipped: `Pipeline is ${this.state}.`, state: this.state };
    }
    if (fetchedSeries?.stale && role !== 'manager') {
      const reason = 'Stale market data; automatic trading is paused until fresh data is available.';
      this.pauseByRisk(reason);
      return { ...this.skip(symbol, timeframe, closedCandle, reason), role, closedTrades: [], marketDataStale: true };
    }
    const candleKey = `${symbol}:${role}:${timeframe}`;
    if (this.processedCandles.get(candleKey) === closedCandle.time) return { role, symbol, timeframe, candle: closedCandle, skipped: 'Closed candle already processed.', closedTrades: [], state: this.state };
    if (await wasCandleProcessed(this.config.accountId, symbol, timeframe, closedCandle.time, role)) {
      this.processedCandles.set(candleKey, closedCandle.time);
      return { role, symbol, timeframe, candle: closedCandle, skipped: 'Closed candle already processed.', closedTrades: [], state: this.state };
    }
    const closedTrades = role === 'manager'
      ? await manageOpenPositions(this.config.accountId, symbol, closedCandle, series, false, timeframe)
      : [];
    const market = getMarket(symbol);
    const session = market ? evaluateMarketSession(market) : undefined;
    if (session && !session.allowed && role !== 'manager') {
      await markCandleProcessed(this.config.accountId, symbol, timeframe, closedCandle.time, role);
      this.processedCandles.set(candleKey, closedCandle.time);
      return { ...this.skip(symbol, timeframe, closedCandle, session.reason), role, closedTrades };
    }

    const candleAgeMs = Date.now() - (closedCandle.time * 1000 + candleDurationMs(timeframe, closedCandle.time * 1000));
    if (role === 'executor' && candleAgeMs > candleDurationMs(timeframe, closedCandle.time * 1000) * traderConfig.MAX_ENTRY_AGE_BARS) {
      await markCandleProcessed(this.config.accountId, symbol, timeframe, closedCandle.time, role);
      this.processedCandles.set(candleKey, closedCandle.time);
      return { ...this.skip(symbol, timeframe, closedCandle, 'Closed candle is too old for a new entry.'), role, closedTrades };
    }

    if (role === 'manager') {
      await markCandleProcessed(this.config.accountId, symbol, timeframe, closedCandle.time, role);
      this.processedCandles.set(candleKey, closedCandle.time);
      return { role, symbol, timeframe, candle: closedCandle, closedTrades, state: this.state };
    }

    if (role === 'planner') {
      const triggerTimeframe = traderConfig.TRIGGER_TIMEFRAMES[0] as Timeframe;
      const [daily, fourHour, trigger] = await Promise.all([
        fetchMarketData(symbol, '1d', 100), fetchMarketData(symbol, '4h', 100), fetchMarketData(symbol, triggerTimeframe, 100),
      ]);
      if (traderConfig.STALE_DATA_BLOCKS_ENTRIES && (daily.stale || fourHour.stale || trigger.stale)) {
        return { ...this.skip(symbol, timeframe, closedCandle, 'Stale market data; planner produced no plan.'), role, closedTrades, marketDataStale: true };
      }
      const closedDaily = selectClosedCandles(daily.candles, '1d', Date.now(), traderConfig.CLOSE_GRACE_MS);
      const closedFourHour = selectClosedCandles(fourHour.candles, '4h', Date.now(), traderConfig.CLOSE_GRACE_MS);
      const closedTrigger = selectClosedCandles(trigger.candles, triggerTimeframe, Date.now(), traderConfig.CLOSE_GRACE_MS);
      const plannerResult = createTradePlan({
        accountId: this.config.accountId, symbol,
        htfCandles: { '1d': closedDaily, '4h': closedFourHour }, triggerCandles: closedTrigger,
        triggerTimeframe,
        datasetId: `${daily.dataset.id}:${fourHour.dataset.id}:${trigger.dataset.id}`,
      });
      if (plannerResult.plan) await storeTradePlan(this.config.accountId, plannerResult.plan);
      if (timeframe === '1d' && symbol === this.config.symbols[0]) {
        await generateDailyAccountReview(this.config.accountId, new Date(closedCandle.time * 1000).toISOString().slice(0, 10));
      }
      await markCandleProcessed(this.config.accountId, symbol, timeframe, closedCandle.time, role);
      this.processedCandles.set(candleKey, closedCandle.time);
      return { role, symbol, timeframe, candle: closedCandle, plan: plannerResult.plan, planReason: plannerResult.reason, closedTrades, state: this.state };
    }

    if (role === 'executor') {
      const result = await advanceStoredTradePlans({
        accountId: this.config.accountId, symbol, timeframe, candle: closedCandle, candles: series,
        shadowMode: !this.config.enableExecution || traderConfig.SHADOW_MODE_ENABLED,
      });
      await markCandleProcessed(this.config.accountId, symbol, timeframe, closedCandle.time, role);
      this.processedCandles.set(candleKey, closedCandle.time);
      if (result.filled > 0) this.snapshot = { ...this.snapshot, executedOrders: this.snapshot.executedOrders + result.filled };
      return {
        role, symbol, timeframe, candle: closedCandle, closedTrades, state: this.state,
        skipped: result.shadowSignals.length ? 'Trigger observed in shadow mode; no paper position was opened.' : undefined,
      };
    }

    this.transition('DECIDING');
    try {
      const result = await analyze({ symbol, timeframe, candles: series }, this.config.accountId);
      const decision = result.decision.result;
      this.snapshot = { ...this.snapshot, state: 'MONITORING', lastRunAt: new Date().toISOString(), lastClosedCandle: { symbol, time: closedCandle.time }, processedDecisions: this.snapshot.processedDecisions + 1, consecutiveFailures: 0 };
      this.failures = 0;

      const directionalSignal = decision.decision === 'BUY' || decision.decision === 'SELL';
      await markCandleProcessed(this.config.accountId, symbol, timeframe, closedCandle.time, role);
      this.processedCandles.set(candleKey, closedCandle.time);
      return {
        symbol,
        role,
        timeframe,
        candle: closedCandle,
        decision,
        skipped: directionalSignal
          ? 'Directional analysis is not an order; no stored plan and confirmed pending-order workflow was supplied.'
          : undefined,
        closedTrades,
        state: this.state,
      };
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

  private transition(state: AutonomousState) {
    this.state = state;
    this.snapshot = { ...this.snapshot, state };
  }
}
