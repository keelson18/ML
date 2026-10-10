export interface TimingMetric {
  name: string;
  durationMs: number;
}

export function formatServerTiming(metrics: TimingMetric[]): string {
  return metrics
    .map((metric) => `${metric.name};dur=${Math.max(0, metric.durationMs).toFixed(1)}`)
    .join(', ');
}
