import { useEffect, useRef, useState } from 'react';
import { Bot, ChevronDown, Loader2, Minimize2, Send, X } from 'lucide-react';
import { coachApi, type CoachMessage } from '../api';
import type { BackendDecision } from '../lib/backend-api';
import type { Timeframe } from '../lib/types';

const MAX_COACH_TURNS = 20;

interface Props {
  symbol: string;
  timeframe: Timeframe;
  decision: BackendDecision | null;
}

export default function KineticCoach({ symbol, timeframe, decision }: Props) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<CoachMessage[]>([{ role: 'assistant', content: "Hi, I'm Kinetic Coach. Ask me about a signal, risk management, or trading concepts." }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<'unknown' | 'online' | 'unavailable'>('unknown');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => { if (open && !minimized) inputRef.current?.focus(); }, [open, minimized]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next); setInput(''); setLoading(true); setError(null);
    try {
      const response = await coachApi.ask(next.slice(-MAX_COACH_TURNS), { symbol, timeframe });
      setServiceStatus('online');
      setMessages((current) => [...current, { role: 'assistant', content: response.reply }]);
    } catch (cause) {
      setServiceStatus('unavailable');
      setError(cause instanceof Error ? cause.message : 'The coaching service is unavailable.');
    } finally { setLoading(false); }
  };

  if (!open) return <button type="button" onClick={() => setOpen(true)} aria-label="Open Kinetic Coach" className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-primary/40 bg-surface px-4 py-3 text-sm font-medium text-text shadow-xl hover:border-primary"><Bot className="h-5 w-5 text-primary" /><span className="hidden sm:inline">Kinetic Coach</span><span className={`h-2 w-2 rounded-full ${serviceStatus === 'online' ? 'bg-success' : serviceStatus === 'unavailable' ? 'bg-danger' : 'bg-warning'}`} title={`Coach ${serviceStatus}`} /></button>;

  return <section aria-label="Kinetic Coach assistant" className={`fixed bottom-5 right-5 z-40 flex w-[min(94vw,380px)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl ${minimized ? 'h-auto' : 'h-[min(70vh,560px)]'}`}>
    <header className="flex items-center gap-2 border-b border-border px-4 py-3">
      <Bot className="h-5 w-5 text-primary" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Kinetic Coach</h2><p className="text-[11px] text-muted">{serviceStatus === 'unavailable' ? 'Service unavailable · retry below' : decision ? `${decision.decision} · ${symbol} · ${timeframe}` : 'Educational mode · decision unavailable'}</p></div>
      <button type="button" onClick={() => setMinimized((value) => !value)} aria-label={minimized ? 'Restore coach' : 'Minimize coach'} className="rounded p-1 text-muted hover:bg-bg">{minimized ? <ChevronDown className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}</button>
      <button type="button" onClick={() => setOpen(false)} aria-label="Close Kinetic Coach" className="rounded p-1 text-muted hover:bg-bg"><X className="h-4 w-4" /></button>
    </header>
    {!minimized && <><div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.map((message, index) => <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${message.role === 'user' ? 'bg-primary text-black' : 'border border-border bg-bg/60'}`}>{message.content}</div></div>)}
      {loading && <div className="flex items-center gap-2 text-xs text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Checking the authenticated decision context…</div>}
      {error && <div role="alert" className="rounded border border-danger/30 bg-danger/10 p-2 text-xs text-danger">{error}<button type="button" onClick={() => setError(null)} className="ml-2 underline">Retry</button></div>}
    </div><div className="border-t border-border p-3"><div className="flex gap-2"><input ref={inputRef} aria-label="Message to Kinetic Coach" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send(); }} placeholder="Ask a trading question…" className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary/50" /><button type="button" onClick={() => void send()} disabled={loading || !input.trim()} aria-label="Send message" className="rounded-lg bg-primary px-3 text-black disabled:opacity-40"><Send className="h-4 w-4" /></button></div><p className="mt-2 text-[10px] text-muted">Paper trading education only. The coach cannot override risk gates.</p></div></>}
  </section>;
}
