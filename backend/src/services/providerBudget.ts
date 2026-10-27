export interface ProviderBudgetOptions {
  requestsPerWindow: number;
  windowMs: number;
  maxWaitMs: number;
  maxQueue: number;
  reservedForPriority?: number;
  dailyRequests?: number;
  reservedForPriorityDaily?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ProviderBudgetSnapshot {
  requestsPerWindow: number;
  windowMs: number;
  reservedForPriority: number;
  usedInWindow: number;
  queued: number;
  backoffUntil: string | null;
  last429At: string | null;
  usedToday: number | null;
  dailyRequests: number | null;
  reservedForPriorityDaily: number;
  standardRemaining: number;
  standardDailyRemaining: number | null;
}

export class ProviderBudgetExhaustedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Provider request budget exhausted.');
  }
}

interface SentRequest {
  at: number;
  priority: boolean;
}

export class ProviderBudget {
  private readonly sent: SentRequest[] = [];
  private backoffUntil = 0;
  private last429At: number | null = null;
  private queued = 0;
  private readonly reservedForPriority: number;
  private readonly dailySent: SentRequest[] = [];
  private readonly reservedForPriorityDaily: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: ProviderBudgetOptions) {
    this.reservedForPriority = options.reservedForPriority ?? 0;
    this.reservedForPriorityDaily = options.reservedForPriorityDaily ?? 0;
    if (this.reservedForPriority < 0 || this.reservedForPriority >= options.requestsPerWindow) {
      throw new Error('Reserved priority requests must be at least 0 and below the requests per window.');
    }
    if ((options.dailyRequests !== undefined && (options.dailyRequests < 1 || this.reservedForPriorityDaily >= options.dailyRequests))
      || (options.dailyRequests === undefined && this.reservedForPriorityDaily > 0)) {
      throw new Error('Daily priority reserve must be below its configured daily request limit.');
    }
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async acquire(priority = false): Promise<void> {
    const started = this.now();
    for (;;) {
      const now = this.now();
      this.prune(now);
      const waitMs = Math.max(0, this.backoffUntil - now, this.windowWaitMs(priority, now));
      if (waitMs === 0) {
        const request = { at: now, priority };
        this.sent.push(request);
        if (this.options.dailyRequests !== undefined) this.dailySent.push(request);
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
    this.last429At = this.now();
    this.backoffUntil = Math.max(this.backoffUntil, this.last429At + ms);
  }

  snapshot(): ProviderBudgetSnapshot {
    const now = this.now();
    this.prune(now);
    return {
      requestsPerWindow: this.options.requestsPerWindow,
      windowMs: this.options.windowMs,
      reservedForPriority: this.reservedForPriority,
      usedInWindow: this.sent.length,
      queued: this.queued,
      backoffUntil: this.backoffUntil > now ? new Date(this.backoffUntil).toISOString() : null,
      last429At: this.last429At === null ? null : new Date(this.last429At).toISOString(),
      usedToday: this.options.dailyRequests === undefined ? null : this.dailySent.length,
      dailyRequests: this.options.dailyRequests ?? null,
      reservedForPriorityDaily: this.reservedForPriorityDaily,
      standardRemaining: Math.max(0, this.options.requestsPerWindow - this.sent.length - this.reservedForPriority),
      standardDailyRemaining: this.options.dailyRequests === undefined ? null : Math.max(0, this.options.dailyRequests - this.dailySent.length - this.reservedForPriorityDaily),
    };
  }

  // Standard requests are capped below the full quota so priority requests always find a free slot.
  private windowWaitMs(priority: boolean, now: number): number {
    const { requestsPerWindow, windowMs } = this.options;
    let waitMs = 0;
    if (this.sent.length >= requestsPerWindow) waitMs = Math.max(waitMs, this.sent[0].at + windowMs - now);
    if (!priority) {
      const standard = this.sent.filter((entry) => !entry.priority);
      if (standard.length >= requestsPerWindow - this.reservedForPriority) {
        waitMs = Math.max(waitMs, standard[0].at + windowMs - now);
      }
    }
    if (this.options.dailyRequests !== undefined) {
      const reservedLimit = priority ? this.options.dailyRequests : this.options.dailyRequests - this.reservedForPriorityDaily;
      const counted = priority ? this.dailySent : this.dailySent.filter((entry) => !entry.priority);
      if (counted.length >= reservedLimit) waitMs = Math.max(waitMs, counted[0].at + 86_400_000 - now);
    }
    return waitMs;
  }

  private prune(now: number): void {
    while (this.sent.length > 0 && now - this.sent[0].at >= this.options.windowMs) this.sent.shift();
    while (this.dailySent.length > 0 && now - this.dailySent[0].at >= 86_400_000) this.dailySent.shift();
  }
}
