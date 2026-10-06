import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, TrendingUp, Users, Cpu, Activity, Zap, RefreshCw } from 'lucide-react';
import { metricsApi, type SystemMetric } from '../../api';

const METRIC_CARDS = [
  { name: 'total_users', label: 'Total Users', icon: Users, unit: '', color: 'text-primary' },
  { name: 'active_trades', label: 'Active Trades', icon: Activity, unit: '', color: 'text-success' },
  { name: 'signals_generated', label: 'Signals Today', icon: Zap, unit: '', color: 'text-warning' },
  { name: 'ml_predictions', label: 'ML Predictions', icon: Cpu, unit: '', color: 'text-primary' },
  { name: 'avg_win_rate', label: 'Avg Win Rate', icon: TrendingUp, unit: '%', color: 'text-success' },
  { name: 'total_profit', label: 'Total P&L', icon: BarChart3, unit: '$', color: 'text-warning' },
];

export default function SystemMetrics() {
  const [metrics, setMetrics] = useState<Record<string, SystemMetric>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setLoadError(false);
    try {
      const { metrics: data } = await metricsApi.getMetrics();
      if (currentRequest !== requestId.current) return;
      const map: Record<string, SystemMetric> = {};
      for (const metric of data) {
        if (!map[metric.metric_name]) map[metric.metric_name] = metric;
      }
      setMetrics(map);
    } catch {
      if (currentRequest === requestId.current) setLoadError(true);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { requestId.current += 1; };
  }, [refresh]);

  if (loading) {
    return <div className="text-sm text-muted text-center py-8">Loading metrics…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">System overview</h2>
          <p className="text-xs text-muted mt-1">Latest reported platform metrics. Missing values are not estimated.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text hover:border-primary/40 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 text-muted ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/25 bg-danger/5 p-3 text-xs text-danger"><span>Metrics could not be loaded. Your session may need refreshing; sign in again if the problem continues.</span><button type="button" onClick={() => void refresh()} className="font-semibold underline underline-offset-2">Retry</button></div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {METRIC_CARDS.map((card) => {
          const metric = metrics[card.name];
          const value = metric?.metric_value;
          const Icon = card.icon;
          return (
            <div key={card.name} className="rounded-xl border border-border/70 bg-bg/50 p-4 transition-colors hover:border-primary/25">
              <div className="flex items-center gap-2 mb-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-surface ${card.color}`}><Icon className="w-4 h-4" /></div>
                <span className="text-xs font-medium text-muted">{card.label}</span>
              </div>
              <div className="text-2xl font-semibold tracking-tight tabular-nums">
                {value === undefined ? '—' : `${card.unit === '$' ? card.unit : ''}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${card.unit === '%' ? card.unit : ''}`}
              </div>
              <div className="mt-2 text-[10px] text-muted">
                {metric ? `Updated ${new Date(metric.recorded_at).toLocaleString()}` : loadError ? 'Value unavailable' : 'No value reported yet'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
