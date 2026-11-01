          {serverDecision?.researchContext && <div className="mt-3 border-t border-border/60 pt-3" aria-label="AI Learning research context">
            <p className="text-[12px] font-semibold text-primary">AI Learning · supplementary, non-authoritative</p>
            <p className="mt-1 text-[12px] text-muted">{serverDecision.researchContext.status.replaceAll('_', ' ')} · {serverDecision.researchContext.note}</p>
            {serverDecision.researchContext.items.map((item) => <article key={item.id} className="mt-2 rounded-lg border border-border/50 bg-bg/50 p-2">
              <p className="text-[12px] font-medium">{item.title} · v{item.version}</p>
              <p className="mt-1 text-[12px] text-muted">{item.content}</p>
            </article>)}
          </div>}
          {serverDecision?.journalStatus === 'failed' && <p role="status" className="mt-2 text-[12px] text-warning">Analysis completed, but its AI Learning journal event could not be saved.</p>}
