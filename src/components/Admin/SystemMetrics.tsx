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
  const [history, setHistory] = useState<SystemMetric[]>([]);
  const [selectedMetric, setSelectedMetric] = useState(METRIC_CARDS[0].name);
  const [range, setRange] = useState<'24h' | '7d' | 'all'>('7d');
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
      setHistory(data);
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

  const selectedCard = METRIC_CARDS.find((card) => card.name === selectedMetric) ?? METRIC_CARDS[0];
  const now = Date.now();
  const cutoff = range === '24h' ? now - 24 * 60 * 60 * 1000 : range === '7d' ? now - 7 * 24 * 60 * 60 * 1000 : Number.NEGATIVE_INFINITY;
  const selectedHistory = history.filter((metric) => metric.metric_name === selectedMetric && Date.parse(metric.recorded_at) >= cutoff && Number.isFinite(metric.metric_value)).sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  const chartWidth = 720;
  const chartHeight = 180;
  const values = selectedHistory.map((metric) => metric.metric_value);
  const valueMin = Math.min(...values);
  const valueMax = Math.max(...values);
  const chartPoints = selectedHistory.map((metric, index) => {
    const x = selectedHistory.length < 2 ? chartWidth / 2 : (index / (selectedHistory.length - 1)) * chartWidth;
    const spread = valueMax - valueMin || Math.abs(valueMax) * 0.1 || 1;
    const y = chartHeight - 12 - ((metric.metric_value - valueMin) / spread) * (chartHeight - 24);
    return `${x},${y}`;
  }).join(' ');

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
            <button type="button" key={card.name} aria-pressed={selectedMetric === card.name} onClick={() => setSelectedMetric(card.name)} className={`rounded-xl border bg-bg/50 p-4 text-left transition-colors hover:border-primary/40 ${selectedMetric === card.name ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border/70'}`}>
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
            </button>
          );
        })}
      </div>
      <section className="rounded-xl border border-border/70 bg-bg/50 p-4" aria-label={`${selectedCard.label} history`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-sm font-semibold">{selectedCard.label} history</h3><p className="mt-1 text-[10px] text-muted">Recorded values only. The chart uses up to 100 most recent database rows.</p></div>
          <div className="flex gap-1" role="group" aria-label="Metric history period">{(['24h', '7d', 'all'] as const).map((item) => <button key={item} type="button" aria-pressed={range === item} onClick={() => setRange(item)} className={`rounded px-2 py-1 text-[10px] ${range === item ? 'bg-primary/15 text-primary' : 'bg-surface text-muted hover:text-text'}`}>{item === 'all' ? 'All loaded' : item}</button>)}</div>
        </div>
        {selectedHistory.length > 1 ? <div className="mt-4 overflow-x-auto"><svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`${selectedCard.label} has ${selectedHistory.length} recorded values, ranging from ${valueMin} to ${valueMax}`} className="h-44 min-w-[480px] w-full"><line x1="0" y1={chartHeight - 12} x2={chartWidth} y2={chartHeight - 12} stroke="currentColor" className="text-border" /><polyline points={chartPoints} fill="none" stroke="currentColor" className="text-primary" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{selectedHistory.map((metric, index) => { const [x, y] = chartPoints.split(' ')[index].split(',').map(Number); return <circle key={`${metric.recorded_at}-${index}`} cx={x} cy={y} r="4" fill="currentColor" className="text-primary"><title>{new Date(metric.recorded_at).toLocaleString()}: {metric.metric_value.toLocaleString()} {metric.metric_unit}</title></circle>; })}</svg><div className="flex justify-between text-[10px] text-muted"><span>{new Date(selectedHistory[0].recorded_at).toLocaleString()}</span><span>{new Date(selectedHistory.at(-1)!.recorded_at).toLocaleString()}</span></div></div> : <p className="mt-5 rounded-lg bg-surface p-4 text-center text-xs text-muted">{selectedHistory.length ? 'Only one value is available in this period; more history is needed to draw a trend.' : 'No recorded values are available for this metric in this period.'}</p>}
      </section>
    </div>
  );
}
