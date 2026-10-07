// UTC candle-close scheduler with grace, completeness checks, and bounded ordered catch-up.
import type { Timeframe } from '../../../src/lib/types';
import { traderConfig } from '../trader/config';
import type { PipelineRole } from './types';
import { AutonomousPipeline } from './pipeline';
import { fetchMarketData } from '../services/marketDataService';
import { selectClosedCandles, nextScheduledRunAt } from './candle-clock';

interface ScheduledJob { role: PipelineRole; timeframe: Timeframe }

export class AutonomousScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly jobs: ScheduledJob[];
  private active = false;
  private jobQueue: Promise<void> = Promise.resolve();
  private readonly failuresBySymbol = new Map<string, number>();

  constructor(
    private readonly pipeline: AutonomousPipeline,
    private readonly symbols: string[],
    private readonly closeGraceMs = traderConfig.CLOSE_GRACE_MS,
  ) {
    const jobs: ScheduledJob[] = [
      ...traderConfig.HTF_TIMEFRAMES.map((timeframe) => ({ role: 'planner' as const, timeframe: timeframe as Timeframe })),
      ...traderConfig.TRIGGER_TIMEFRAMES.map((timeframe) => ({ role: 'executor' as const, timeframe: timeframe as Timeframe })),
      { role: 'manager', timeframe: traderConfig.MGMT_TIMEFRAME as Timeframe },
    ];
    this.jobs = [...new Map(jobs.map((job) => [`${job.role}:${job.timeframe}`, job])).values()];
    this.pipeline.bindScheduler({ start: () => this.startJobs(), stop: () => this.stopJobs() });
  }

  start() {
    this.pipeline.start();
  }

  private startJobs() {
    if (this.timers.size > 0) return;
    this.active = true;
    for (const job of this.jobs) {
      this.enqueueJob(job);
      this.scheduleNext(job);
    }
  }

  stop() {
    this.pipeline.stop();
  }

  private stopJobs() {
    this.active = false;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private scheduleNext(job: ScheduledJob) {
    if (!this.active) return;
    const key = `${job.role}:${job.timeframe}`;
    const runAt = nextScheduledRunAt(Date.now(), job.timeframe, this.closeGraceMs);
    const jitter = traderConfig.SCHEDULER_JITTER_MS === 0
      ? 0
      : Math.floor(Math.random() * traderConfig.SCHEDULER_JITTER_MS);
    const delay = Math.max(0, runAt - Date.now()) + jitter;
    const timer = setTimeout(() => {
      this.timers.delete(key);
      this.enqueueJob(job).finally(() => { if (this.active) this.scheduleNext(job); });
    }, delay);
    this.timers.set(key, timer);
  }

  private enqueueJob(job: ScheduledJob): Promise<void> {
    this.jobQueue = this.jobQueue.then(() => this.runJob(job)).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : 'Unknown scheduler failure.';
      console.error(`[autonomy] ${job.role} ${job.timeframe} job failed: ${reason}`);
    });
    return this.jobQueue;
  }

  private async runJob(job: ScheduledJob) {
    for (const symbol of this.symbols) {
      try {
        const series = await fetchMarketData(symbol, job.timeframe, 1000);
        const failureKey = `${job.role}:${job.timeframe}:${symbol}`;
        this.failuresBySymbol.set(failureKey, 0);
        if (series.stale) {
          const reason = `Stale market data for ${symbol}; automatic trading paused.`;
          console.warn(`[autonomy] ${reason}`);
          this.pipeline.pauseByRisk(reason);
          break;
        }
        const closed = selectClosedCandles(series.candles, job.timeframe, Date.now(), this.closeGraceMs);
        if (closed.length === 0) continue;
        const catchUpLimit = job.role === 'manager'
          ? traderConfig.SCHEDULER_MAX_CATCH_UP_BARS
          : job.role === 'executor'
            ? traderConfig.MAX_ENTRY_AGE_BARS
            : 1;
        const selected = closed.slice(-catchUpLimit);
        for (let index = 0; index < selected.length; index += 1) {
          const candle = selected[index]!;
          const sourceIndex = closed.findIndex((item) => item.time === candle.time);
          const prefix = closed.slice(0, sourceIndex + 1);
          const result = await this.pipeline.runOnce(symbol, job.timeframe, prefix, job.role, true);
          if (job.role === 'planner') {
            console.info(`[autonomy] ${result.plan ? `Plan created ${result.plan.id}` : result.planReason ?? 'No plan.'} for ${symbol}.`);
          }
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown scheduler failure.';
        console.error(`[autonomy] ${job.role} ${symbol} cycle failed: ${reason}`);
        const failureKey = `${job.role}:${job.timeframe}:${symbol}`;
        const failures = (this.failuresBySymbol.get(failureKey) ?? 0) + 1;
        this.failuresBySymbol.set(failureKey, failures);
        if (failures >= traderConfig.MAX_CONSECUTIVE_PROVIDER_FAILURES) {
          this.pipeline.pauseByRisk(`Repeated market data or scheduler failures for ${symbol}; automatic trading paused.`);
          break;
        }
      }
      if (this.active && traderConfig.SCHEDULER_SYMBOL_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, traderConfig.SCHEDULER_SYMBOL_DELAY_MS));
      }
    }
  }
}
