import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Loader2 } from 'lucide-react';
import { askCoach, type CoachMessage } from '../lib/mlClient';

// Kinetic Coach — Gemini-powered trading coaching chat.
export default function KineticCoach() {
  const [messages, setMessages] = useState<CoachMessage[]>([
    { role: 'assistant', content: "Hi, I'm Kinetic Coach. Ask me about any signal you're seeing, risk management, or trading psychology." },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const reply = await askCoach(next);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Sorry, I had trouble reaching the coaching service. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <MessageSquare className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-medium">Kinetic Coach</h3>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-primary text-black'
                : 'bg-surface border border-border text-text'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface border border-border rounded-lg px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted" />
            </div>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Ask about a signal, risk, or strategy…"
            className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border text-text placeholder:text-muted/60 focus:outline-none focus:border-primary text-sm"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-3 py-2 rounded-lg bg-primary text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
