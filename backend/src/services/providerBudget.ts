export interface ProviderBudgetOptions {
  requestsPerWindow: number;
  windowMs: number;
  maxWaitMs: number;
  maxQueue: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ProviderBudgetSnapshot {
  requestsPerWindow: number;
  windowMs: number;
  usedInWindow: number;
  queued: number;
  backoffUntil: string | null;
}

export class ProviderBudgetExhaustedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Provider request budget exhausted.');
  }
}

export class ProviderBudget {
  private readonly sentAt: number[] = [];
  private backoffUntil = 0;
  private queued = 0;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: ProviderBudgetOptions) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async acquire(): Promise<void> {
    const started = this.now();
    for (;;) {
      const now = this.now();
      this.prune(now);
      const windowWaitMs = this.sentAt.length < this.options.requestsPerWindow
        ? 0
        : this.sentAt[0] + this.options.windowMs - now;
      const waitMs = Math.max(0, this.backoffUntil - now, windowWaitMs);
      if (waitMs === 0) {
        this.sentAt.push(now);
        return;
      }
      const totalWaitMs = now - started + waitMs;
      if (totalWaitMs > this.options.maxWaitMs || this.queued >= this.options.maxQueue) {
        throw new ProviderBudgetExhaustedError(Math.ceil(waitMs / 1000));
      }
      this.queued += 1;
      try {
        await this.sleep(waitMs);
      } finally {
        this.queued -= 1;
      }
    }
  }

  backoff(ms: number): void {
    this.backoffUntil = Math.max(this.backoffUntil, this.now() + ms);
  }

  snapshot(): ProviderBudgetSnapshot {
    const now = this.now();
    this.prune(now);
    return {
      requestsPerWindow: this.options.requestsPerWindow,
      windowMs: this.options.windowMs,
      usedInWindow: this.sentAt.length,
      queued: this.queued,
      backoffUntil: this.backoffUntil > now ? new Date(this.backoffUntil).toISOString() : null,
    };
  }

  private prune(now: number): void {
    while (this.sentAt.length > 0 && now - this.sentAt[0] >= this.options.windowMs) this.sentAt.shift();
  }
}
