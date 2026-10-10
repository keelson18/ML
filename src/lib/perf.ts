const SAMPLE_LIMIT = 50;
const samples = new Map<string, number[]>();

export function recordTiming(name: string, durationMs: number): void {
  const values = samples.get(name) ?? [];
  values.push(durationMs);
  if (values.length > SAMPLE_LIMIT) values.shift();
  samples.set(name, values);
}

export function latestTiming(name: string): number | null {
  const values = samples.get(name);
  return values?.length ? values[values.length - 1] : null;
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export async function measureAsync<T>(name: string, task: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await task();
  } finally {
    recordTiming(name, performance.now() - start);
  }
}

export function isPerfOverlayEnabled(search: string, isAdmin: boolean, isDev: boolean): boolean {
  return new URLSearchParams(search).get('perf') === '1' && (isDev || isAdmin);
}

export function observeLongTasks(onTask: (durationMs: number) => void): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => undefined;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) onTask(entry.duration);
    });
    observer.observe({ type: 'longtask', buffered: false });
    return () => observer.disconnect();
  } catch {
    return () => undefined;
  }
}
