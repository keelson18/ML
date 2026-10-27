import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, Brain, Database, FlaskConical, RefreshCw, ShieldCheck } from 'lucide-react';
import { authenticatedBackendRequest } from '../../lib/backend-api';

type JsonRecord = Record<string, unknown>;
interface ModelVersion { id: string; version: string; algorithm: string; status: string; metrics: JsonRecord; created_at: string }
interface StrategyVersion { id: string; strategy_id: string; version: string; status: string; logic_definition: JsonRecord; risk_definition: JsonRecord; parameters: JsonRecord; created_at: string }
interface LearningEvent { id: string; source_type: string; source_id: string | null; observation: JsonRecord; hypothesis: string; status: string; created_at: string }
interface ResearchExperiment { id: string; name: string; hypothesis: string; dataset_id: string; status: string; parameters: JsonRecord; created_at: string }
interface KnowledgeItem { id: string; node_type: string; title: string; content: string; tags: string[]; confidence: number; status: string; version: string; created_at: string; updated_at: string }
interface ResearchRun { id: string; experiment_id: string; run_version: string; seed: number | null; configuration: JsonRecord; status: string; started_at: string; completed_at: string | null }
interface ResearchResult { id: string; run_id: string; metrics: JsonRecord; artifacts: JsonRecord; conclusion: string | null; created_at: string }
interface JournalEvent { id: string; event_key: string; event_type: string; title: string; detail: string; symbol: string | null; timeframe: string | null; source_service: string; correlation_id: string | null; related_records: JsonRecord; evidence: JsonRecord; created_at: string }
interface ResearchCollection { experiment_id: string; symbol: string; provider: string; continuous: boolean; test_start_time: number; initialized_at: string }
interface LearningOverview {
  versions: ModelVersion[];
  strategyVersions: StrategyVersion[];
  events: LearningEvent[];
  experiments: ResearchExperiment[];
  knowledge: KnowledgeItem[];
  runs: ResearchRun[];
  results: ResearchResult[];
  journal: JournalEvent[];
  collections: ResearchCollection[];
  refreshedAt: string;
}

type Section = 'Overview' | 'Learning Now' | 'Knowledge Base' | 'Research Lab' | 'Learning Journal' | 'Performance Review' | 'Models & Strategy Versions' | 'Research Backlog';
const SECTIONS: Section[] = ['Overview', 'Learning Now', 'Knowledge Base', 'Research Lab', 'Learning Journal', 'Performance Review', 'Models & Strategy Versions', 'Research Backlog'];
const PAGE_SIZE = 10;

function recordText(value: unknown): string {
  return value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
}

function isoDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid timestamp' : date.toLocaleString();
}

export default function AILearning() {
  const [data, setData] = useState<LearningOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [section, setSection] = useState<Section>('Overview');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [symbolFilter, setSymbolFilter] = useState('all');
  const [timeframeFilter, setTimeframeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [throughDate, setThroughDate] = useState('');
  const [page, setPage] = useState(0);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const result = await authenticatedBackendRequest<LearningOverview>('/api/v1/admin/ai/overview');
      if (requestId.current === currentRequest) setData(result);
    } catch (cause) {
      if (requestId.current === currentRequest) setError(cause instanceof Error ? cause.message : 'AI Learning records could not be loaded.');
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]);

  useEffect(() => { setPage(0); }, [section, search, statusFilter, symbolFilter, timeframeFilter, fromDate, throughDate]);

  const modelVersions = data?.versions ?? [];
  const strategyVersions = data?.strategyVersions ?? [];
  const experiments = data?.experiments ?? [];
  const knowledge = data?.knowledge ?? [];
  const runs = data?.runs ?? [];
  const results = data?.results ?? [];
  const collections = data?.collections ?? [];
  const searchTerm = search.trim().toLowerCase();

  const journalRows = useMemo(() => [
    ...(data?.journal ?? []).map((event) => ({
      id: event.id, title: event.title, detail: event.detail, type: event.event_type, status: 'system event',
      symbol: event.symbol ?? '', timeframe: event.timeframe ?? '', createdAt: event.created_at,
      source: event.source_service, correlationId: event.correlation_id ?? '', related: event.related_records,
      evidence: event.evidence, origin: 'system' as const,
    })),
    ...(data?.events ?? []).map((event) => ({
      id: `note:${event.id}`, title: event.hypothesis, detail: recordText(event.observation), type: event.source_type,
      status: event.status, symbol: recordText(event.observation.symbol), timeframe: recordText(event.observation.timeframe),
      createdAt: event.created_at, source: 'manual learning note', correlationId: '',
      related: { sourceId: event.source_id }, evidence: event.observation, origin: 'manual' as const,
    })),
  ].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)), [data?.events, data?.journal]);

  const visibleJournal = journalRows.filter((event) =>
    (!searchTerm || `${event.title} ${event.detail} ${event.type} ${event.status} ${event.symbol} ${event.timeframe} ${event.source} ${event.correlationId}`.toLowerCase().includes(searchTerm))
    && (statusFilter === 'all' || event.status === statusFilter || event.type === statusFilter)
    && (symbolFilter === 'all' || event.symbol === symbolFilter)
    && (timeframeFilter === 'all' || event.timeframe === timeframeFilter)
    && (!fromDate || Date.parse(event.createdAt) >= Date.parse(`${fromDate}T00:00:00`))
    && (!throughDate || Date.parse(event.createdAt) < Date.parse(`${throughDate}T23:59:59.999`)));
  const filteredKnowledge = knowledge.filter((item) => !searchTerm || `${item.title} ${item.content} ${item.node_type} ${item.status} ${item.tags.join(' ')}`.toLowerCase().includes(searchTerm));
  const filteredExperiments = experiments.filter((item) => !searchTerm || `${item.name} ${item.hypothesis} ${item.status} ${item.dataset_id}`.toLowerCase().includes(searchTerm));
  const filteredVersions = modelVersions.filter((item) => !searchTerm || `${item.version} ${item.algorithm} ${item.status}`.toLowerCase().includes(searchTerm));
  const filteredStrategies = strategyVersions.filter((item) => !searchTerm || `${item.version} ${item.status} ${recordText(item.logic_definition)} ${recordText(item.parameters)}`.toLowerCase().includes(searchTerm));
  const pageItems = <T,>(items: T[]) => items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = (count: number) => Math.max(1, Math.ceil(count / PAGE_SIZE));
  const activeCollections = collections.filter((collection) => collection.continuous);
  const latestActivity = journalRows[0]?.createdAt;
  const runningExperiments = experiments.filter((experiment) => experiment.status === 'running').length;
  const awaitingValidation = experiments.filter((experiment) => experiment.status === 'completed').length;
  const rejectedCount = experiments.filter((experiment) => experiment.status === 'rejected').length
    + (data?.events ?? []).filter((event) => event.status === 'rejected').length;
  const validatedFindings = knowledge.filter((item) => item.status === 'validated' || item.status === 'approved').length;
  const pageCount = section === 'Learning Journal' ? totalPages(visibleJournal.length)
    : section === 'Knowledge Base' ? totalPages(filteredKnowledge.length)
      : section === 'Research Lab' ? totalPages(filteredExperiments.length)
        : section === 'Models & Strategy Versions' ? totalPages(filteredVersions.length + filteredStrategies.length) : 1;

  return <div className="page-frame space-y-6">
    <div className="page-heading">
      <div className="page-heading-copy">
        <div className="page-eyebrow"><Brain className="w-3.5 h-3.5" /> Research and evidence · Admin</div>
        <h1>AI Learning</h1>
        <p>Inspect persistent research, evidence, and paper-analysis context. Hypotheses remain distinct from validated knowledge; research never overrides decision or risk gates.</p>
        <p className="mt-1 text-xs text-muted">Last refresh: {isoDate(data?.refreshedAt)} · Last recorded event: {isoDate(latestActivity)}</p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading} className="p-2 rounded-lg hover:bg-surface text-muted disabled:opacity-50" title="Refresh AI Learning data" aria-label="Refresh AI Learning data"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
    </div>
    {error && <div role="alert" className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3">{error} Existing records remain unchanged; retry after verifying backend and database access.</div>}
    {loading && !data && <p role="status" className="text-sm text-muted">Loading saved AI Learning records…</p>}
    {!loading && !data && !error && <p className="text-sm text-muted">No AI Learning data response was returned.</p>}

    <div className="flex gap-2 overflow-x-auto border-b border-border pb-2" role="tablist" aria-label="AI Learning sections">
      {SECTIONS.map((item) => <button key={item} type="button" role="tab" aria-selected={section === item} onClick={() => setSection(item)}
        className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium ${section === item ? 'bg-primary text-black' : 'bg-surface text-muted hover:text-text'}`}>{item}</button>)}
    </div>

    <label className="block max-w-xl text-xs font-medium text-muted">Search saved records
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find experiments, evidence, models, or journal entries"
        className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/60" />
    </label>

    {section === 'Overview' && <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Activity} title="Active collections" value={String(activeCollections.length)} detail="Persistent provider collection states" />
        <Stat icon={FlaskConical} title="Experiments running" value={String(runningExperiments)} detail="Saved status on research experiments" />
        <Stat icon={ShieldCheck} title="Awaiting validation" value={String(awaitingValidation)} detail="Completed experiments; approval remains separate" />
        <Stat icon={Database} title="Validated knowledge" value={String(validatedFindings)} detail="Knowledge records marked validated or approved" />
        <Stat icon={Brain} title="Rejected hypotheses" value={String(rejectedCount)} detail="Explicit rejected statuses in saved records" />
        <Stat icon={Activity} title="Journal entries" value={String(journalRows.length)} detail="System events and separately labelled manual notes" />
      </div>
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Learning lifecycle</h2>
        <p className="mt-2 text-xs text-muted">Observation → hypothesis → experiment → validation → approval. Current records are shown below; no progress percentage is inferred from missing stages.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {journalRows.slice(0, 6).map((event) => <JournalCard key={event.id} event={event} />)}
          {!journalRows.length && <Empty>No system journal activity or manual learning notes have been recorded.</Empty>}
        </div>
      </section>
      <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">No AI Learning request, daily, or monthly quota is configured here. Provider budgets and bounded backend request protections remain separate operational safeguards.</p>
    </div>}

    {section === 'Learning Now' && <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Active research collections</h2>
      <p className="mt-1 text-xs text-muted">These rows come from persisted collection state. The currently registered workflow advances when its research run endpoint is invoked; no always-on learning scheduler is configured.</p>
      <div className="mt-3 space-y-3">{activeCollections.map((collection) => {
        const experiment = experiments.find((item) => item.id === collection.experiment_id);
        const relatedRuns = runs.filter((run) => run.experiment_id === collection.experiment_id);
        return <article key={collection.experiment_id} className="rounded-lg border border-border/60 bg-bg/50 p-3">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-medium">{experiment?.name ?? `Investigation ${collection.experiment_id}`}</h3><span className="text-xs uppercase text-primary">{experiment?.status ?? 'collection active'}</span></div>
          <p className="mt-1 text-xs">{experiment?.hypothesis ?? 'No research question is available.'}</p>
          <p className="mt-2 text-xs text-muted">{collection.symbol} · 15m holdout · Provider: {collection.provider} · Started {isoDate(collection.initialized_at)} · Holdout starts {new Date(collection.test_start_time * 1000).toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted">Next action: continue bounded provider collection and evaluate only after configured forward evidence thresholds are reached. {relatedRuns.length ? `${relatedRuns.length} persisted run(s) linked.` : 'No completed run is linked yet.'}</p>
          <p className="mt-1 text-xs text-warning">Data limitations: stored per-candle progress is not currently exposed by this overview; no percentage is shown.</p>
        </article>;
      })}{!activeCollections.length && <Empty>No active collection state is recorded. Saved drafts do not imply that research is running.</Empty>}</div>
    </section>}

    {section === 'Knowledge Base' && <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Knowledge records</h2>
      <p className="mt-1 text-xs text-muted">Only records with an explicit validated/approved status count as validated. Their status alone does not establish out-of-sample quality; inspect linked evidence and limitations before relying on them.</p>
      <div className="mt-3 space-y-3">{pageItems(filteredKnowledge).map((item) => <article key={item.id} className="rounded-lg border border-border/60 bg-bg/50 p-3">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-medium">{item.title}</h3><span className="text-xs uppercase text-primary">{item.status} · {item.node_type}</span></div>
        <p className="mt-2 whitespace-pre-wrap text-xs text-muted">{item.content}</p>
        <p className="mt-2 text-xs text-muted">v{item.version} · Confidence field {Number.isFinite(item.confidence) ? item.confidence : 'not recorded'} · Tags: {item.tags.join(', ') || 'none'} · Updated {isoDate(item.updated_at)}</p>
      </article>)}{!filteredKnowledge.length && <Empty>{knowledge.length ? 'No knowledge records match this search.' : 'No knowledge records are available.'}</Empty>}</div>
    </section>}

    {section === 'Research Lab' && <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Experiments and immutable runs</h2>
      <p className="mt-1 text-xs text-muted">Runs retain dataset lineage, replay version, test window, and configured costs where persisted. Drafts are not experiments in progress; evidence review and promotion remain separate.</p>
      <div className="mt-3 space-y-3">{pageItems(filteredExperiments).map((experiment) => {
        const experimentRuns = runs.filter((run) => run.experiment_id === experiment.id);
        return <article key={experiment.id} className="rounded-lg border border-border/60 bg-bg/50 p-3">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-medium">{experiment.name}</h3><span className="text-xs uppercase text-primary">{experiment.status}</span></div>
          <p className="mt-1 text-xs">{experiment.hypothesis}</p>
          <p className="mt-2 text-xs text-muted">Dataset reference: {experiment.dataset_id} · Created {isoDate(experiment.created_at)} · Parameters {recordText(experiment.parameters)}</p>
          {experimentRuns.map((run) => {
            const result = results.find((item) => item.run_id === run.id);
            const validation = (result?.artifacts.validation ?? {}) as JsonRecord;
            return <div key={run.id} className="mt-3 rounded-lg border border-border/50 p-3">
              <p className="text-xs font-medium">Run {run.run_version} · {run.status} · Started {isoDate(run.started_at)}</p>
              <p className="mt-1 break-all text-[11px] text-muted">Run ID {run.id} · Seed {run.seed ?? 'not recorded'} · Configuration {recordText(run.configuration)}</p>
              {result && <p className="mt-1 text-xs text-muted">{result.conclusion ?? 'No conclusion recorded.'} Validation: {recordText(validation)} Metrics: {recordText(result.metrics)}</p>}
            </div>;
          })}
          {!experimentRuns.length && <p className="mt-2 text-xs text-muted">No immutable research run is recorded.</p>}
        </article>;
      })}{!filteredExperiments.length && <Empty>{experiments.length ? 'No experiments match this search.' : 'No saved experiments are available.'}</Empty>}</div>
    </section>}

    {section === 'Learning Journal' && <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Append-only activity and learning notes</h2>
      <p className="mt-1 text-xs text-muted">System-generated events are distinguished from manually entered learning hypotheses. System records include source service, correlation IDs, links, and available provenance.</p>
      <div className="mt-3 grid gap-2 md:grid-cols-5">
        <label className="text-xs text-muted">Status or event type<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-bg px-2 py-2"><option value="all">All</option>{[...new Set(journalRows.flatMap((item) => [item.status, item.type]))].sort().map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="text-xs text-muted">Instrument<select value={symbolFilter} onChange={(event) => setSymbolFilter(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-bg px-2 py-2"><option value="all">All instruments</option>{[...new Set(journalRows.map((item) => item.symbol).filter(Boolean))].sort().map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="text-xs text-muted">Timeframe<select value={timeframeFilter} onChange={(event) => setTimeframeFilter(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-bg px-2 py-2"><option value="all">All timeframes</option>{[...new Set(journalRows.map((item) => item.timeframe).filter(Boolean))].sort().map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="text-xs text-muted">From<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-bg px-2 py-2" /></label>
        <label className="text-xs text-muted">Through<input type="date" value={throughDate} onChange={(event) => setThroughDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-bg px-2 py-2" /></label>
      </div>
      <div className="mt-3 space-y-2">{pageItems(visibleJournal).map((event) => <JournalCard key={event.id} event={event} />)}
        {!visibleJournal.length && <Empty>{journalRows.length ? 'No journal entries match the selected filters.' : 'No journal entries have been recorded.'}</Empty>}
      </div>
    </section>}

    {section === 'Performance Review' && <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Forward research results</h2>
      <p className="mt-1 text-xs text-muted">Metrics below are copied from immutable research results. They are not a profitability claim; sample size, test duration, transaction costs, and validation flags must be evaluated together.</p>
      <div className="mt-3 space-y-3">{results.map((result) => {
        const run = runs.find((item) => item.id === result.run_id);
        const experiment = experiments.find((item) => item.id === run?.experiment_id);
        const validation = (result.artifacts.validation ?? {}) as JsonRecord;
        return <article key={result.id} className="rounded-lg border border-border/60 bg-bg/50 p-3">
          <h3 className="text-sm font-medium">{experiment?.name ?? `Run ${result.run_id}`}</h3>
          <p className="mt-1 text-xs text-muted">Validation {recordText(validation)} · Trades/sample {recordText(result.metrics.tradeCount)} · Test days {recordText(result.metrics.testDays)} · Expectancy R {recordText(result.metrics.expectancyR)} · Max drawdown R {recordText(result.metrics.maxDrawdownR)}</p>
          <p className="mt-1 text-xs text-muted">{result.conclusion ?? 'No conclusion recorded.'} · Costs/configuration: {recordText(run?.configuration)}</p>
        </article>;
      })}{!results.length && <Empty>No immutable research results are available; no effectiveness metric can be calculated.</Empty>}</div>
    </section>}

    {section === 'Models & Strategy Versions' && <div className="space-y-4">
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Model versions</h2></div>
        <div className="mt-3 space-y-2">{pageItems(filteredVersions).map((version) => <article key={version.id} className="rounded-lg border border-border/60 bg-bg/50 p-3">
          <p className="text-xs font-semibold">{version.version} · {version.algorithm} · {version.status}</p><p className="mt-1 text-xs text-muted">Created {isoDate(version.created_at)} · Metrics {recordText(version.metrics)}</p>
        </article>)}{!filteredVersions.length && <Empty>No model versions match this search.</Empty>}</div>
      </section>
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Strategy versions</h2>
        <div className="mt-3 space-y-2">{pageItems(filteredStrategies).map((version) => <article key={version.id} className="rounded-lg border border-border/60 bg-bg/50 p-3">
          <p className="text-xs font-semibold">v{version.version} · {version.status}</p><p className="mt-1 text-xs text-muted">Strategy {version.strategy_id} · Created {isoDate(version.created_at)} · Logic {recordText(version.logic_definition)} · Risk {recordText(version.risk_definition)} · Parameters {recordText(version.parameters)}</p>
        </article>)}{!filteredStrategies.length && <Empty>No strategy versions match this search.</Empty>}</div>
      </section>
      <p className="text-xs text-warning">This is a read-only registry view. No active engine changes, promotions, or rollbacks are initiated from AI Learning.</p>
    </div>}

    {section === 'Research Backlog' && <section className="rounded-xl border border-warning/30 bg-warning/10 p-4">
      <h2 className="text-sm font-semibold">Research backlog is not implemented</h2>
      <p className="mt-2 text-xs text-muted">There is no durable backlog schema or evidence-to-question prioritization workflow in the current repository. AI Learning does not simulate backlog items or claim automatic gap discovery.</p>
    </section>}

    {pageCount > 1 && <div className="flex items-center justify-between text-xs text-muted">
      <span>Page {page + 1} of {pageCount} · {PAGE_SIZE} records per page</span>
      <div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0} className="rounded border border-border px-3 py-2 disabled:opacity-40">Previous</button><button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page + 1 >= pageCount} className="rounded border border-border px-3 py-2 disabled:opacity-40">Next</button></div>
    </div>}
    {!error && data && !loading && <p className="text-[11px] text-muted">Data refresh: {isoDate(data.refreshedAt)}. Results are limited to the latest 100 records per source.</p>}
  </div>;
}

function JournalCard({ event }: { event: { id: string; title: string; detail: string; type: string; status: string; symbol: string; timeframe: string; createdAt: string; source: string; correlationId: string; related: JsonRecord; evidence: JsonRecord; origin: 'system' | 'manual' } }) {
  return <article className="rounded-lg border border-border/60 bg-bg/50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs">{event.title}</strong><time className="text-[11px] text-muted">{isoDate(event.createdAt)}</time></div>
    <p className="mt-1 text-xs text-muted">{event.origin === 'system' ? 'System event' : 'Manual note'} · {event.type} · {event.status}{event.symbol ? ` · ${event.symbol}` : ''}{event.timeframe ? ` · ${event.timeframe}` : ''} · {event.source}</p>
    <p className="mt-2 whitespace-pre-wrap text-xs">{event.detail}</p>
    {event.correlationId && <p className="mt-2 break-all text-[11px] text-muted">Correlation {event.correlationId}</p>}
    {(Object.keys(event.related).length > 0 || Object.keys(event.evidence).length > 0) && <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-primary">Evidence and related records</summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-bg p-2 text-[10px] text-muted">{recordText({ related: event.related, evidence: event.evidence })}</pre>
    </details>}
  </article>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted">{children}</p>;
}

function Stat({ icon: Icon, title, value, detail }: { icon: typeof Brain; title: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-border bg-surface p-4"><div className="mb-3 flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><h2 className="text-xs font-medium text-muted">{title}</h2></div><div className="text-2xl font-semibold">{value}</div><p className="mt-1 text-xs text-muted">{detail}</p></div>;
}
