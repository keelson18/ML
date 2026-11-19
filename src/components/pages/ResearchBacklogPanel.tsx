import { useState, type FormEvent } from 'react';
import { authenticatedBackendRequest } from '../../lib/backend-api';

export type BacklogPriority = 'critical' | 'high' | 'medium' | 'low';
export type BacklogStatus = 'open' | 'in_progress' | 'blocked' | 'done' | 'dismissed';

export interface ResearchBacklogItem {
  id: string;
  title: string;
  question: string;
  rationale: string;
  priority: BacklogPriority;
  status: BacklogStatus;
  status_note: string;
  evidence: Array<{ source_type: string; source_id: string; description: string }>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ResearchBacklogForm {
  title: string;
  question: string;
  rationale: string;
  priority: BacklogPriority;
  sourceType: 'paper_trade' | 'research' | 'risk_event' | 'data_quality';
  sourceId: string;
  evidenceDescription: string;
}

function isoDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid timestamp' : date.toLocaleString();
}

interface Props {
  items: ResearchBacklogItem[];
  totalItems: number;
  hasRecords: boolean;
  onRefresh: () => Promise<void>;
}

export default function ResearchBacklogPanel({ items, totalItems, hasRecords, onRefresh }: Props) {
  const [form, setForm] = useState<ResearchBacklogForm>({
    title: '', question: '', rationale: '', priority: 'medium', sourceType: 'research', sourceId: '', evidenceDescription: '',
  });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});

  const createBacklogItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await authenticatedBackendRequest<{ id: string }>('/api/v1/admin/ai/research-backlog', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          question: form.question,
          rationale: form.rationale,
          priority: form.priority,
          evidence: [{ source_type: form.sourceType, source_id: form.sourceId, description: form.evidenceDescription }],
        }),
      });
      setForm({ title: '', question: '', rationale: '', priority: 'medium', sourceType: 'research', sourceId: '', evidenceDescription: '' });
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Research question could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const updateBacklogStatus = async (item: ResearchBacklogItem, status: BacklogStatus) => {
    const statusNote = statusNotes[item.id]?.trim() ?? '';
    if (status === 'blocked' && !statusNote) {
      setError('Add a note explaining why the research question is blocked.');
      return;
    }
    setBusyId(item.id);
    setError('');
    try {
      await authenticatedBackendRequest<{ updated: boolean }>(`/api/v1/admin/ai/research-backlog/${item.id}/status`, {
        method: 'PATCH', body: JSON.stringify({ status, statusNote }),
      });
      setStatusNotes((current) => ({ ...current, [item.id]: '' }));
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Research question status could not be updated.');
    } finally {
      setBusyId('');
    }
  };

  return <div className="space-y-4">
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Add a research question</h2>
      <p className="mt-1 text-xs text-muted">Record a question against an existing evidence record. Priority is an administrator assessment; this queue does not discover gaps or change trading decisions.</p>
      <form onSubmit={(event) => void createBacklogItem(event)} className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-muted">Title<input required maxLength={160} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label>
        <label className="text-xs text-muted">Priority<select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as BacklogPriority }))} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text"><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
        <label className="text-xs text-muted md:col-span-2">Research question<textarea required maxLength={2000} rows={2} value={form.question} onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label>
        <label className="text-xs text-muted md:col-span-2">Why investigate this?<textarea maxLength={2000} rows={2} value={form.rationale} onChange={(event) => setForm((current) => ({ ...current, rationale: event.target.value }))} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label>
        <label className="text-xs text-muted">Evidence record type<select value={form.sourceType} onChange={(event) => setForm((current) => ({ ...current, sourceType: event.target.value as ResearchBacklogForm['sourceType'] }))} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text"><option value="research">Research</option><option value="paper_trade">Paper trade</option><option value="risk_event">Risk event</option><option value="data_quality">Data quality</option></select></label>
        <label className="text-xs text-muted">Evidence record ID<input required minLength={36} maxLength={36} pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" value={form.sourceId} onChange={(event) => setForm((current) => ({ ...current, sourceId: event.target.value }))} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label>
        <label className="text-xs text-muted md:col-span-2">What does this evidence show?<textarea required maxLength={500} rows={2} value={form.evidenceDescription} onChange={(event) => setForm((current) => ({ ...current, evidenceDescription: event.target.value }))} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label>
        {error && <p role="alert" className="text-xs text-danger md:col-span-2">{error}</p>}
        <div className="md:col-span-2"><button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">{saving ? 'Saving question…' : 'Add to research backlog'}</button></div>
      </form>
    </section>
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-semibold">Evidence-linked research questions</h2><p className="mt-1 text-xs text-muted">Showing the newest 200 records, sorted by administrator-set priority and then update time. Status changes are audited and retained.</p></div><span className="text-xs text-muted">{totalItems} {totalItems === 1 ? 'question' : 'questions'}</span></div>
      <div className="mt-3 space-y-3">{items.map((item) => <article key={item.id} className="rounded-lg border border-border/60 bg-bg/50 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="text-sm font-medium">{item.title}</h3><p className="mt-1 text-xs">{item.question}</p></div><div className="flex items-center gap-2"><span className="rounded border border-border px-2 py-1 text-xs capitalize text-muted">{item.priority}</span><label className="sr-only" htmlFor={`backlog-status-${item.id}`}>Status for {item.title}</label><select id={`backlog-status-${item.id}`} value={item.status} disabled={busyId === item.id} onChange={(event) => void updateBacklogStatus(item, event.target.value as BacklogStatus)} className="rounded border border-border bg-bg px-2 py-1.5 text-xs"><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option><option value="dismissed">Dismissed</option></select></div></div>
        {item.rationale && <p className="mt-2 whitespace-pre-wrap text-xs text-muted">{item.rationale}</p>}
        {item.status_note && <p className="mt-2 text-xs text-muted">Latest status note: {item.status_note}</p>}
        <label className="mt-2 block text-xs text-muted">Status note<input type="text" maxLength={500} value={statusNotes[item.id] ?? ''} onChange={(event) => setStatusNotes((current) => ({ ...current, [item.id]: event.target.value }))} aria-label={`Status note for ${item.title}`} placeholder="Required when marking blocked" className="mt-1 block w-full rounded border border-border bg-bg px-2 py-1.5 text-xs text-text" /></label>
        <div className="mt-3 space-y-2">{item.evidence.map((evidence, index) => <div key={`${evidence.source_type}:${evidence.source_id}:${index}`} className="rounded border border-border/50 p-2"><p className="text-xs">{evidence.description}</p><p className="mt-1 break-all text-xs text-muted">{evidence.source_type} · {evidence.source_id}</p></div>)}</div>
        <p className="mt-2 text-xs text-muted">Created {isoDate(item.created_at)} · Updated {isoDate(item.updated_at)} · Record {item.id}</p>
      </article>)}{!items.length && <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted">{hasRecords ? 'No evidence-linked research questions match this search.' : 'No research questions have been recorded.'}</p>}</div>
    </section>
  </div>;
}
