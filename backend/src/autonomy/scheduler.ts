import type { Timeframe } from '../../../src/lib/types';
import { AutonomousPipeline } from './pipeline';

export class AutonomousScheduler {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly pipeline: AutonomousPipeline,
    private readonly symbols: string[],
    private readonly timeframe: Timeframe = '15m',
    private readonly intervalMs = 60_000,
  ) {}

  start() {
    if (this.timer) return;
    this.pipeline.start();
    void this.runCycle();
    this.timer = setInterval(() => void this.runCycle(), this.intervalMs);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    this.pipeline.stop();
  }

  private async runCycle() {
    for (const symbol of this.symbols) {
      try {
        await this.pipeline.runOnce(symbol, this.timeframe);
      } catch (error) {
        console.error(`[autonomy] ${symbol} cycle failed`, error);
      }
    }
  }
}