import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Users, Cpu, Activity, Zap } from 'lucide-react';
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { metrics: data } = await metricsApi.getMetrics();
        if (cancelled || !data) return;
        const map: Record<string, SystemMetric> = {};
        for (const m of data) {
          if (!map[m.metric_name]) map[m.metric_name] = m;
        }
        setMetrics(map);
      } catch {
        if (!cancelled) setLoadError(true);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="text-sm text-muted text-center py-8">Loading metrics…</div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">System Metrics Overview</h3>
      {loadError && <div role="alert" className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3">Could not load system metrics. Verify the database permissions and try again.</div>}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {METRIC_CARDS.map((card) => {
          const metric = metrics[card.name];
          const value = metric?.metric_value;
          const Icon = card.icon;
          return (
            <div key={card.name} className="bg-bg/50 border border-border/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${card.color}`} />
                <span className="text-xs text-muted">{card.label}</span>
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {value === undefined ? 'Unavailable' : `${card.unit === '$' ? card.unit : ''}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${card.unit === '%' ? card.unit : ''}`}
              </div>
              {metric && (
                <div className="text-[10px] text-muted mt-1">
                  Updated: {new Date(metric.recorded_at).toLocaleTimeString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
