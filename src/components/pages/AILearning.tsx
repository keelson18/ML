import { useEffect, useState } from 'react';
import { Brain, Database, FlaskConical, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ModelVersion {
  id: string;
  version: string;
  algorithm: string;
  status: string;
  metrics: Record<string, unknown>;
  created_at: string;
}

interface LearningEvent {
  id: string;
  source_type: string;
  hypothesis: string;
  status: string;
  created_at: string;
}

interface ResearchExperiment {
  id: string;
  name: string;
  hypothesis: string;
  dataset_id: string;
  status: string;
  created_at: string;
}

export default function AILearning() {
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [experiments, setExperiments] = useState<ResearchExperiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    const results = await Promise.all([
      supabase.from('model_versions').select('id,version,algorithm,status,metrics,created_at').order('created_at', { ascending: false }).limit(20),
      supabase.from('learning_events').select('id,source_type,hypothesis,status,created_at').order('created_at', { ascending: false }).limit(20),
      supabase.from('research_experiments').select('id,name,hypothesis,dataset_id,status,created_at').order('created_at', { ascending: false }).limit(20),
    ]);
    const failed = results.some((result) => result.error);
    if (!failed) {
      setVersions((results[0].data ?? []) as ModelVersion[]);
      setEvents((results[1].data ?? []) as LearningEvent[]);
      setExperiments((results[2].data ?? []) as ResearchExperiment[]);
    }
    setError(failed);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const latest = versions[0];
  const accuracies = versions.map((version) => Number(version.metrics.accuracy)).filter(Number.isFinite);
  const averageAccuracy = accuracies.length ? accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length : null;

  return (
    <div className="page-frame space-y-6">
      <div className="page-heading"><div className="page-heading-copy"><div className="page-eyebrow"><Brain className="w-3.5 h-3.5" /> Model operations</div><h1>AI Learning Center</h1><p>Review account-scoped learning events, research experiments, and registered model versions.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="p-2 rounded-lg hover:bg-surface text-muted disabled:opacity-50" title="Refresh learning data" aria-label="Refresh learning data"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
      {error && <div role="alert" className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3">Could not load all learning data. Verify the connected database policies and try again.</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat icon={Brain} title="Model Versions" value={loading ? '…' : String(versions.length)} detail={latest ? `Latest ${latest.version} · ${latest.status}` : 'No versions registered'} />
        <Stat icon={Database} title="Learning Events" value={loading ? '…' : String(events.length)} detail="Visible to this account" />
        <Stat icon={FlaskConical} title="Research Experiments" value={loading ? '…' : String(experiments.length)} detail="Saved research records" />
      </div>

      <section className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3"><ShieldCheck className="w-4 h-4 text-primary" /><h2 className="text-xs font-medium text-muted">Model Governance</h2></div>
        {loading ? <p className="text-xs text-muted">Loading model versions…</p> : versions.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-muted border-b border-border"><th className="text-left py-2">Version</th><th className="text-left py-2">Algorithm</th><th className="text-left py-2">Status</th><th className="text-right py-2">Accuracy</th><th className="text-right py-2">Created</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id} className="border-b border-border/50"><td className="py-2 font-medium">{version.version}</td><td className="py-2 text-muted">{version.algorithm}</td><td className="py-2 capitalize">{version.status}</td><td className="py-2 text-right">{typeof version.metrics.accuracy === 'number' ? `${(version.metrics.accuracy * 100).toFixed(1)}%` : '--'}</td><td className="py-2 text-right text-muted">{new Date(version.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div> : <p className="text-xs text-muted">No model versions are available to this account.</p>}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-surface border border-border rounded-xl p-4"><h2 className="text-xs font-medium text-muted mb-3">Recent Learning Events</h2>{loading ? <p className="text-xs text-muted">Loading…</p> : events.length ? <div className="space-y-2">{events.slice(0, 8).map((event) => <article key={event.id} className="rounded-lg bg-bg/50 border border-border/60 p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase text-primary">{event.source_type} · {event.status}</span><time className="text-[10px] text-muted">{new Date(event.created_at).toLocaleDateString()}</time></div><p className="text-xs mt-1">{event.hypothesis}</p></article>)}</div> : <p className="text-xs text-muted">No learning events have been recorded for this account.</p>}</section>
        <section className="bg-surface border border-border rounded-xl p-4"><h2 className="text-xs font-medium text-muted mb-3">Research Experiments</h2>{loading ? <p className="text-xs text-muted">Loading…</p> : experiments.length ? <div className="space-y-2">{experiments.slice(0, 8).map((experiment) => <article key={experiment.id} className="rounded-lg bg-bg/50 border border-border/60 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-xs">{experiment.name}</strong><span className="text-[10px] uppercase text-muted">{experiment.status}</span></div><p className="text-xs text-muted mt-1">{experiment.hypothesis}</p><div className="text-[10px] text-muted mt-2">Dataset {experiment.dataset_id} · {new Date(experiment.created_at).toLocaleDateString()}</div></article>)}</div> : <p className="text-xs text-muted">No research experiments have been saved for this account.</p>}</section>
      </div>

      <section className="bg-surface border border-border rounded-xl p-4"><h2 className="text-xs font-medium text-muted mb-2">Prediction Accuracy</h2><div className="text-2xl font-semibold">{averageAccuracy == null ? '--' : `${(averageAccuracy * 100).toFixed(1)}%`}</div><p className="text-[10px] text-muted mt-1">Average accuracy from registered model-version metrics; unavailable when versions do not include accuracy values.</p></section>
    </div>
  );
}

function Stat({ icon: Icon, title, value, detail }: { icon: typeof Brain; title: string; value: string; detail: string }) {
  return <div className="bg-surface border border-border rounded-xl p-4"><div className="flex items-center gap-2 mb-3"><Icon className="w-4 h-4 text-primary" /><h2 className="text-xs font-medium text-muted">{title}</h2></div><div className="text-2xl font-semibold">{value}</div><p className="text-[10px] text-muted mt-1">{detail}</p></div>;
}
