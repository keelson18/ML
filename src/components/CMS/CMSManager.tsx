import { useEffect, useState } from 'react';
import { BookOpen, Plus, Edit2, Trash2, Eye, EyeOff, RefreshCw } from 'lucide-react';
import type { CMSContent } from '../../lib/types';
import { fetchAllContent, deleteContent, togglePublish } from '../../lib/cms';
import CMSViewer from './CMSViewer';
import CMSEditor from './CMSEditor';

type ViewState = 'list' | 'view' | 'edit';

export default function CMSManager() {
  const [contents, setContents] = useState<CMSContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewState>('list');
  const [selected, setSelected] = useState<CMSContent | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await fetchAllContent();
    setContents(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this content?')) return;
    await deleteContent(id);
    await load();
  };

  const handleToggle = async (id: string, published: boolean) => {
    await togglePublish(id, published);
    await load();
  };

  if (view === 'view' && selected) {
    return (
      <CMSViewer
        slug={selected.slug}
        onBack={() => { setView('list'); setSelected(null); }}
        // Allow admin to view drafts by passing allowUnpublished
        allowUnpublished={true}
      />
    );
  }

  if (view === 'edit') {
    return (
      <CMSEditor
        content={selected}
        onSaved={() => { setView('list'); setSelected(null); load(); }}
        onCancel={() => { setView('list'); setSelected(null); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Content Management ({contents.length})</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-1.5 rounded hover:bg-bg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-muted" />
          </button>
          <button
            onClick={() => { setSelected(null); setView('edit'); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium bg-primary text-black hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3 h-3" /> New
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-sm text-muted text-center py-8">Loading content…</div>
      )}

      {!loading && contents.length === 0 && (
        <div className="text-sm text-muted text-center py-8">
          No content yet. Create your first article or guide.
        </div>
      )}

      <div className="space-y-1.5">
        {contents.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-bg/50 border border-border/50">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-sm font-medium truncate">{c.title}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted capitalize">
                  {c.contentType}
                </span>
                {c.published ? (
                  <span className="text-[10px] text-success">Published</span>
                ) : (
                  <span className="text-[10px] text-muted">Draft</span>
                )}
              </div>
              <div className="text-xs text-muted mt-0.5">
                /{c.slug} · Updated {new Date(c.updatedAt).toLocaleDateString()}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => { setSelected(c); setView('view'); }}
                className="p-1.5 rounded hover:bg-bg transition-colors"
                title="View"
              >
                <Eye className="w-3 h-3 text-muted" />
              </button>
              <button
                onClick={() => { setSelected(c); setView('edit'); }}
                className="p-1.5 rounded hover:bg-bg transition-colors"
                title="Edit"
              >
                <Edit2 className="w-3 h-3 text-muted" />
              </button>
              <button
                onClick={() => handleToggle(c.id, c.published)}
                className="p-1.5 rounded hover:bg-bg transition-colors"
                title={c.published ? 'Unpublish' : 'Publish'}
              >
                {c.published ? <EyeOff className="w-3 h-3 text-warning" /> : <Eye className="w-3 h-3 text-success" />}
              </button>
              <button
                onClick={() => handleDelete(c.id)}
                className="p-1.5 rounded hover:bg-bg transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3 h-3 text-danger" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

