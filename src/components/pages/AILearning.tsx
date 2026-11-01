    {pageCount > 1 && <div className="flex items-center justify-between text-xs text-muted">
      <span>Page {page + 1} of {pageCount} · {PAGE_SIZE} records per page</span>
      <div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0} className="rounded border border-border px-3 py-2 disabled:opacity-40">Previous</button><button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page + 1 >= pageCount} className="rounded border border-border px-3 py-2 disabled:opacity-40">Next</button></div>
    </div>}
    {!error && data && !loading && <p className="text-[12px] text-muted">Data refresh: {isoDate(data.refreshedAt)}. Results are limited to the latest 100 records per source.</p>}
  </div>;
}

function JournalCard({ event }: { event: { id: string; title: string; detail: string; type: string; status: string; symbol: string; timeframe: string; createdAt: string; source: string; correlationId: string; related: JsonRecord; evidence: JsonRecord; origin: 'system' | 'manual' } }) {
  return <article className="rounded-lg border border-border/60 bg-bg/50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs">{event.title}</strong><time className="text-[12px] text-muted">{isoDate(event.createdAt)}</time></div>
    <p className="mt-1 text-xs text-muted">{event.origin === 'system' ? 'System event' : 'Manual note'} · {event.type} · {event.status}{event.symbol ? ` · ${event.symbol}` : ''}{event.timeframe ? ` · ${event.timeframe}` : ''} · {event.source}</p>
    <p className="mt-2 whitespace-pre-wrap text-xs">{event.detail}</p>
    {event.correlationId && <p className="mt-2 break-all text-[12px] text-muted">Correlation {event.correlationId}</p>}
    {(Object.keys(event.related).length > 0 || Object.keys(event.evidence).length > 0) && <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-primary">Evidence and related records</summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-bg p-2 text-xs text-muted">{recordText({ related: event.related, evidence: event.evidence })}</pre>
    </details>}
  </article>;
}
