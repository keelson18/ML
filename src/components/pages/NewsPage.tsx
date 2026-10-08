import { useEffect, useState } from 'react';
import { ArrowUpRight, Newspaper, RefreshCw } from 'lucide-react';
import { fetchPublishedContent } from '../../lib/cms';
import { fetchCalendarEvents, fetchNewsItems, fetchNewsProviderStatus, type CalendarEvent, type NewsItem } from '../../lib/backend-api';
import type { CMSContent } from '../../lib/types';
import CMSViewer from '../CMS/CMSViewer';

type NewsTab = 'market' | 'research' | 'calendar';

export default function NewsPage() {
  const [tab, setTab] = useState<NewsTab>('market');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [impactFilter, setImpactFilter] = useState('all');
  const [articles, setArticles] = useState<CMSContent[]>([]);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [providerStatus, setProviderStatus] = useState<{ news: string; calendar: string }>({ news: 'unverified', calendar: 'unverified' });
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    const [content, news, calendar, status] = await Promise.allSettled([
      fetchPublishedContent(), fetchNewsItems(), fetchCalendarEvents(), fetchNewsProviderStatus(),
    ]);
    if (content.status === 'fulfilled') setArticles(content.value.filter((item) => item.contentType === 'article' || item.contentType === 'announcement'));
    if (news.status === 'fulfilled') setItems(news.value.items);
    if (calendar.status === 'fulfilled') setEvents(calendar.value.events);
    if (status.status === 'fulfilled') setProviderStatus({
      news: status.value.news[0]?.availability ?? 'unverified',
      calendar: status.value.calendar[0]?.availability ?? 'unverified',
    });
    setError(news.status === 'rejected' || calendar.status === 'rejected' || status.status === 'rejected');
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  if (selectedSlug) return <div className="page-frame"><CMSViewer slug={selectedSlug} onBack={() => setSelectedSlug(null)} /></div>;

  return <div className="page-frame space-y-6">
    <div className="page-heading"><div className="page-heading-copy"><div className="page-eyebrow"><Newspaper className="w-3.5 h-3.5" /> News & Research</div><h1>News & Research</h1><p>Market headlines, research notes, and event-risk windows. Provider availability is reported honestly.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="p-2 rounded-lg hover:bg-surface text-muted disabled:opacity-50" aria-label="Refresh news and calendar"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button></div>

    <div role="tablist" aria-label="News and research sections" className="flex gap-2 border-b border-border">
      {([{ key: 'market', label: 'Market news' }, { key: 'research', label: 'Research notes (CMS)' }, { key: 'calendar', label: 'Calendar' }] as const).map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)} className={`border-b-2 px-3 py-2 text-xs font-medium ${tab === item.key ? 'border-primary text-primary' : 'border-transparent text-muted'}`}>{item.label}</button>)}
    </div>

    {error && <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">Some feeds are unavailable. Showing any previously loaded content; provider feeds remain unverified until a source is configured and probed.</div>}
    {loading && <div role="status" className="text-xs text-muted">Refreshing feeds…</div>}

    {tab === 'market' && <div className="space-y-4">
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xs font-medium text-muted">Market News Feed</h2><div className="flex items-center gap-2"><input aria-label="Filter news by symbol" value={symbolFilter} onChange={(event) => setSymbolFilter(event.target.value.toUpperCase().slice(0, 20))} placeholder="Filter symbol" className="w-28 rounded border border-border bg-bg px-2 py-1 text-[10px]" /><span className="rounded-full border border-border px-2 py-1 text-[10px] capitalize text-muted">Feed health: {providerStatus.news}</span></div></div>
        {items.filter((item) => !symbolFilter || item.symbols.includes(symbolFilter)).length ? <div className="space-y-2">{items.filter((item) => !symbolFilter || item.symbols.includes(symbolFilter)).map((item) => <article key={item.id} className="rounded-lg border border-border/60 bg-bg/50 p-3"><h3 className="text-sm font-medium">{item.title}</h3>{item.summary && <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{item.summary}</p>}<div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted"><span>{item.provider}</span>{item.symbols.map((symbol) => <span key={symbol} className="rounded border border-border px-1.5 py-0.5">{symbol}</span>)}<time>{item.published_at ? new Date(item.published_at).toLocaleString() : 'Publication time unavailable'}</time></div></article>)}</div> : <p className="py-8 text-center text-xs text-muted">{loading ? 'Loading market news…' : providerStatus.news === 'unverified' ? 'No provider is configured or verified. Headlines are not used to create trade signals.' : 'No market news is available.'}</p>}
      </section>
      <section className="rounded-xl border border-border bg-surface p-4"><h2 className="mb-2 text-xs font-medium text-muted">Sentiment</h2><p className="text-xs text-muted">Sentiment unavailable. No validated source is connected; this application does not infer sentiment from headline text.</p></section>
    </div>}

    {tab === 'research' && <section className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-xs font-medium text-muted">Published research notes</h2><span className="text-[10px] text-muted">Knowledge Base CMS</span></div>
      {articles.length ? <div className="space-y-2">{articles.map((article) => <button type="button" key={article.id} onClick={() => setSelectedSlug(article.slug)} className="w-full rounded-lg border border-border/60 bg-bg/50 p-3 text-left hover:border-primary/30"><div className="flex items-start justify-between gap-3"><div><span className="text-[10px] uppercase text-primary">{article.contentType}</span><h3 className="mt-1 text-sm font-medium">{article.title}</h3>{article.excerpt && <p className="mt-1 line-clamp-2 text-xs text-muted">{article.excerpt}</p>}<time className="mt-2 block text-[10px] text-muted">{article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'Recently published'}</time></div><ArrowUpRight className="h-4 w-4 shrink-0 text-muted" /></div></button>)}</div> : <p className="py-8 text-center text-xs text-muted">{loading ? 'Loading published research…' : 'No published research notes yet.'}</p>}
    </section>}

    {tab === 'calendar' && <section className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xs font-medium text-muted">Calendar and manual event windows</h2><div className="flex items-center gap-2"><select aria-label="Filter calendar impact" value={impactFilter} onChange={(event) => setImpactFilter(event.target.value)} className="rounded border border-border bg-bg px-2 py-1 text-[10px]"><option value="all">All impact</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><span className="rounded-full border border-border px-2 py-1 text-[10px] capitalize text-muted">Feed health: {providerStatus.calendar}</span></div></div>
      {events.filter((event) => impactFilter === 'all' || event.impact === impactFilter).length ? <div className="space-y-2">{events.filter((event) => impactFilter === 'all' || event.impact === impactFilter).map((event) => <CalendarRow key={`${event.source}:${event.id}`} event={event} />)}</div> : <p className="py-8 text-center text-xs text-muted">{loading ? 'Loading calendar…' : 'No upcoming events match these filters. Calendar providers are unverified.'}</p>}
      <p className="mt-4 border-t border-border pt-3 text-xs text-muted">Headlines and calendar data are informational only. They are not inputs to BUY/SELL decisions.</p>
    </section>}
  </div>;
}

function CalendarRow({ event }: { event: CalendarEvent }) {
  const starts = Date.parse(event.starts_at);
  const ends = Date.parse(event.ends_at);
  const now = Date.now();
  const countdown = starts > now ? `Starts in ${Math.ceil((starts - now) / 60_000)} min` : `Ends in ${Math.max(0, Math.ceil((ends - now) / 60_000))} min`;
  return <article className="rounded-lg border border-border/60 bg-bg/50 p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className={`text-[10px] uppercase ${event.impact === 'high' ? 'text-danger' : event.impact === 'medium' ? 'text-warning' : 'text-muted'}`}>{event.impact} impact · {event.source}</span><h3 className="mt-1 text-sm font-medium">{event.title}</h3><p className="mt-1 text-xs text-muted">{event.asset_classes.join(', ')}</p><time className="mt-1 block text-[10px] text-muted">{new Date(event.starts_at).toLocaleString()} – {new Date(event.ends_at).toLocaleString()}</time></div><span className="rounded border border-border px-2 py-1 text-xs text-muted">{countdown}</span></div></article>;
}
