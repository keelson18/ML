import { getSupabaseClient } from '../db';

export type AiLearningJournalEventType =
  | 'trade_analysis_completed'
  | 'research_experiment_created'
  | 'research_experiment_collecting'
  | 'research_experiment_completed'
  | 'research_experiment_failed'
  | 'research_strategy_promoted'
  | 'manual_learning_note';

export interface AiLearningJournalEvent {
  eventKey: string;
  userId: string | null;
  eventType: AiLearningJournalEventType;
  title: string;
  detail: string;
  symbol?: string;
  timeframe?: string;
  sourceService: string;
  correlationId?: string;
  relatedRecords?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
}

function containsSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) =>
    /(token|secret|password|credential|api.?key|authorization|cookie)/i.test(key)
    || containsSensitiveKey(child));
}

function sanitizeText(value: string): string {
  return value
    .replace(/\b(?:bearer\s+)?[A-Za-z0-9._-]{32,}\b/gi, '[token redacted]')
    .replace(/\b(?:api[_-]?key|token|password|secret|authorization)\s*[:=]\s*\S+/gi, '[credential redacted]')
    .replace(/https?:\/\/\S+/gi, '[url redacted]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email redacted]');
}

export async function appendAiLearningJournalEvent(event: AiLearningJournalEvent): Promise<string> {
  const relatedRecords = event.relatedRecords ?? {};
  const evidence = event.evidence ?? {};
  const payload = {
    event_key: event.eventKey,
    user_id: event.userId,
    event_type: event.eventType,
    title: sanitizeText(event.title),
    detail: sanitizeText(event.detail),
    symbol: event.symbol,
    timeframe: event.timeframe,
    source_service: event.sourceService,
    correlation_id: event.correlationId,
    related_records: relatedRecords,
    evidence,
  };
  if (JSON.stringify(payload).length > 15_000 || containsSensitiveKey(payload)) {
    throw new Error('AI Learning journal event is too large or contains a sensitive field.');
  }
  const { data, error } = await getSupabaseClient().rpc('append_ai_learning_journal_event', { p_event: payload });
  if (error || typeof data !== 'string') throw new Error('AI Learning journal persistence failed.');
  return data;
}
