import { useEffect, useState } from 'react';
import { Brain, RefreshCw, Play, StopCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ModelRecord {
  id: string;
  model_name: string;
  model_version: string;
  status: string;
  accuracy: number | null;
  last_trained: string | null;
}

export default function ModelManagement() {
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchModels = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ml_predictions')
      .select('model_version, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) {
      const uniqueVersions = new Map<string, ModelRecord>();
      for (const m of data) {
        if (!uniqueVersions.has(m.model_version)) {
          uniqueVersions.set(m.model_version, {
            id: m.model_version,
            model_name: 'ML Predictor',
            model_version: m.model_version,
            status: 'active',
            accuracy: null,
            last_trained: m.created_at,
          });
        }
      }
      setModels(Array.from(uniqueVersions.values()));
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
        <h3 className="text-sm font-semibold">ML Model Registry</h3>
        <button onClick={fetchModels} className="p-1.5 rounded hover:bg-bg transition-colors">
          <RefreshCw className="w-3.5 h-3.5 text-muted" />
        </button>
      </div>
      {models.length === 0 && (
        <div className="text-sm text-muted text-center py-8">No models registered yet.</div>
      )}
      <div className="space-y-1.5">
        {models.map((m) => (
          <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-bg/50 border border-border/50">
            <div className="flex items-center gap-3 min-w-0">
              <Brain className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium">{m.model_name}</div>
                <div className="text-xs text-muted">v{m.model_version}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                m.status === 'active' ? 'bg-success/15 text-success' : 'bg-muted/15 text-muted'
              }`}>
                {m.status}
              </span>
              {m.last_trained && (
                <span className="text-xs text-muted hidden md:inline">
                  {new Date(m.last_trained).toLocaleDateString()}
                </span>
              )}
              <div className="flex gap-1">
                <button className="p-1.5 rounded hover:bg-bg transition-colors text-success" title="Start training">
                  <Play className="w-3 h-3" />
                </button>
                <button className="p-1.5 rounded hover:bg-bg transition-colors text-danger" title="Stop">
                  <StopCircle className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

