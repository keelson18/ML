import { useEffect, useState } from 'react';
import { latestTiming, observeLongTasks } from '../lib/perf';

interface Props {
  candleCount: number;
}

interface Snapshot {
  fps: number;
  longTasks: number;
  chartCandlesMs: number | null;
  chartOverlaysMs: number | null;
  fetchMs: number | null;
}

const REFRESH_MS = 500;

function formatMs(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} ms`;
}

export default function PerfOverlay({ candleCount }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ fps: 0, longTasks: 0, chartCandlesMs: null, chartOverlaysMs: null, fetchMs: null });

  useEffect(() => {
    let longTasks = 0;
    let frames = 0;
    let frame = 0;
    let active = true;
    const stopObserving = observeLongTasks(() => { longTasks += 1; });
    const countFrame = () => {
      if (!active) return;
      frames += 1;
      frame = window.requestAnimationFrame(countFrame);
    };
    frame = window.requestAnimationFrame(countFrame);
    const timer = window.setInterval(() => {
      setSnapshot({
        fps: Math.round((frames * 1000) / REFRESH_MS),
        longTasks,
        chartCandlesMs: latestTiming('chart.candles'),
        chartOverlaysMs: latestTiming('chart.overlays'),
        fetchMs: latestTiming('candles.fetch'),
      });
      frames = 0;
    }, REFRESH_MS);
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
      stopObserving();
    };
  }, []);

  return (
    <aside aria-label="Performance metrics" className="fixed bottom-3 left-3 z-50 rounded-md border border-border bg-surface/95 px-3 py-2 font-mono text-[11px] text-muted shadow-lg">
      <p>Bars: {candleCount}</p>
      <p>FPS: {snapshot.fps}</p>
      <p>Long tasks: {snapshot.longTasks}</p>
      <p>Last fetch: {formatMs(snapshot.fetchMs)}</p>
      <p>Chart candles: {formatMs(snapshot.chartCandlesMs)}</p>
      <p>Chart overlays: {formatMs(snapshot.chartOverlaysMs)}</p>
    </aside>
  );
}
