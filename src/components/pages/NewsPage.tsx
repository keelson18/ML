import { useEffect, useState } from 'react';
import { ArrowUpRight, Newspaper, RefreshCw } from 'lucide-react';
import type { CMSContent } from '../../lib/types';
import { fetchPublishedContent } from '../../lib/cms';
import CMSViewer from '../CMS/CMSViewer';

export default function NewsPage() {
  const [articles, setArticles] = useState<CMSContent[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const content = await fetchPublishedContent();
      setArticles(content.filter((item) => item.contentType === 'article' || item.contentType === 'announcement'));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (selectedSlug) return <div className="page-frame"><CMSViewer slug={selectedSlug} onBack={() => setSelectedSlug(null)} /></div>;

  return (
    <div className="page-frame space-y-6">
      <div className="page-heading"><div className="page-heading-copy"><div className="page-eyebrow"><Newspaper className="w-3.5 h-3.5" /> Published updates</div><h1>News & Research</h1><p>Published articles and announcements from your connected Knowledge Base.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="p-2 rounded-lg hover:bg-surface text-muted disabled:opacity-50" aria-label="Refresh published updates"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button></div>

      <section className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3"><h2 className="text-xs font-medium text-muted">Market News Feed</h2><span className="text-[10px] text-muted">Knowledge Base</span></div>
        {loading ? <div className="text-xs text-muted text-center py-10">Loading published updates…</div> : error ? <div role="alert" className="text-xs text-danger text-center py-10">Could not load published updates. Please try again.</div> : articles.length ? <div className="space-y-2">{articles.map((article) => <button type="button" key={article.id} onClick={() => setSelectedSlug(article.slug)} className="w-full text-left bg-bg/50 border border-border/60 rounded-lg p-3 hover:border-primary/30 transition-colors"><div className="flex items-start justify-between gap-3"><div><span className="text-[10px] text-primary uppercase">{article.contentType}</span><h3 className="text-sm font-medium mt-1">{article.title}</h3>{article.excerpt && <p className="text-xs text-muted mt-1 line-clamp-2">{article.excerpt}</p>}<time className="block text-[10px] text-muted mt-2">{article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'Recently published'}</time></div><ArrowUpRight className="w-4 h-4 text-muted shrink-0" /></div></button>)}</div> : <div className="text-xs text-muted text-center py-10">No published articles or announcements yet.</div>}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-surface border border-border rounded-xl p-4"><h2 className="text-xs font-medium text-muted mb-2">Sentiment Analysis</h2><p className="text-xs text-muted">Sentiment scores are unavailable because no news or social-sentiment provider is configured. This page does not infer sentiment from article titles.</p></section>
        <section className="bg-surface border border-border rounded-xl p-4"><h2 className="text-xs font-medium text-muted mb-2">Economic Calendar</h2><p className="text-xs text-muted">Calendar events will appear here when an economic-calendar data source is configured.</p></section>
      </div>
    </div>
  );
}
