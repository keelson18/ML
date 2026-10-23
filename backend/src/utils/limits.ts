export class WindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxTrackedKeys = 10_000,
  ) {}

  consume(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((time) => time > cutoff);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }

    if (!this.hits.has(key) && this.hits.size >= this.maxTrackedKeys) {
      for (const [trackedKey, timestamps] of this.hits) {
        if (!timestamps.some((time) => time > cutoff)) this.hits.delete(trackedKey);
      }
      // Fail closed if active keys still fill the tracker; dropping one would
      // let that key bypass its limit before its window expires.
      if (this.hits.size >= this.maxTrackedKeys) return false;
    }

    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

export class BoundedMap<V> {
  private readonly entries = new Map<string, V>();

  constructor(private readonly maxEntries: number) {}

  get(key: string): V | undefined {
    return this.entries.get(key);
  }

  set(key: string, value: V): void {
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, value);
  }
}
