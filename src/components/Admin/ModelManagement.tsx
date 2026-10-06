import { useEffect, useState } from 'react';
import { Brain, RefreshCw } from 'lucide-react';
import { mlApi } from '../../api';

interface ModelRecord {
  model_version: string;
  last_seen: string;
}

export default function ModelManagement() {
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const { versions } = await mlApi.getVersions();
      const uniqueVersions = new Map<string, ModelRecord>();
      for (const m of versions) {
        if (!uniqueVersions.has(m.model_version)) {
          uniqueVersions.set(m.model_version, {
            model_version: m.model_version,
            last_seen: m.created_at,
          });
        }
      }
      setModels(Array.from(uniqueVersions.values()));
      setLoadError(false);
    } catch {
      setModels([]);
      setLoadError(true);
    }
    setLoading(false);
  };

  useEffect(() => { fetchModels(); }, []);

  if (loading) {
    return <div className="text-sm text-muted text-center py-8">Loading models…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-base font-semibold">Observed model versions</h2><p className="text-xs text-muted mt-1">Versions recorded by recent predictions; deployment status is not tracked here.</p></div>
        <button onClick={fetchModels} disabled={loading} aria-label="Refresh model versions" className="p-2 rounded-lg border border-border hover:border-primary/40 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 text-muted ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {loadError && <div role="alert" className="text-sm text-warning text-center py-8">Could not load models. Retry to check the registry again.</div>}
      {!loadError && models.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center"><Brain className="w-5 h-5 text-muted mx-auto mb-2" /><p className="text-sm font-medium">No model versions observed</p><p className="text-xs text-muted mt-1">Versions will appear after prediction records are written.</p></div>
      )}
      <div className="space-y-1.5">
        {models.map((m) => (
          <div key={m.model_version} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-bg/50 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><Brain className="w-4 h-4 text-primary" /></div>
              <div className="min-w-0"><div className="text-sm font-medium">ML prediction model</div><div className="text-xs text-muted">Version {m.model_version}</div></div>
            </div>
            <span className="text-xs text-muted shrink-0">Last seen {new Date(m.last_seen).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
