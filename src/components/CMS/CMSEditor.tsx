import { useState } from 'react';
import { Save, X } from 'lucide-react';
import type { CMSContent, CMSContentType } from '../../lib/types';
import { upsertContent } from '../../lib/cms';

interface Props {
  content?: CMSContent | null;
  onSaved: () => void;
  onCancel: () => void;
}

const CONTENT_TYPES: { value: CMSContentType; label: string }[] = [
  { value: 'article', label: 'Article' },
  { value: 'guide', label: 'Guide' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'docs', label: 'Documentation' },
  { value: 'faq', label: 'FAQ' },
];

export default function CMSEditor({ content, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(content?.title ?? '');
  const [slug, setSlug] = useState(content?.slug ?? '');
  const [body, setBody] = useState(content?.body ?? '');
  const [excerpt, setExcerpt] = useState(content?.excerpt ?? '');
  const [contentType, setContentType] = useState<CMSContentType>(content?.contentType ?? 'article');
  const [tags, setTags] = useState<string>(content?.tags?.join(', ') ?? '');
  const [published, setPublished] = useState(content?.published ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim() || !slug.trim() || !body.trim()) {
      setError('Title, slug, and body are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await upsertContent({
      slug: slug.trim(),
      title: title.trim(),
      body: body.trim(),
      excerpt: excerpt.trim() || undefined,
      contentType,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      published,
    });
    setSaving(false);
    if (result) {
      onSaved();
    } else {
      setError('Failed to save content.');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {content ? 'Edit Content' : 'New Content'}
        </h3>
        <button onClick={onCancel} className="p-1.5 rounded hover:bg-bg transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-muted mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:outline-none focus:border-primary"
            placeholder="Article title"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Slug</label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:outline-none focus:border-primary"
            placeholder="article-slug"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted mb-1">Excerpt</label>
        <input
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:outline-none focus:border-primary"
          placeholder="Brief description (optional)"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-muted mb-1">Type</label>
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value as CMSContentType)}
            className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:outline-none focus:border-primary"
          >
            {CONTENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Tags (comma-separated)</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:outline-none focus:border-primary"
            placeholder="trading, analysis, guide"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted mb-1">Body</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm font-mono focus:outline-none focus:border-primary resize-y"
          placeholder="Content body (markdown supported)"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
          className="rounded border-border bg-surface text-primary focus:ring-primary"
        />
        <span className="text-sm text-muted">Published</span>
      </label>

      {error && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-lg bg-surface border border-border text-text text-sm hover:bg-bg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-2 rounded-lg bg-primary text-black text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

