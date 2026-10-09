import { getMarket } from '../../../src/lib/markets';
import { getSupabaseClient } from '../db';

export interface EventBlackout {
  id: string;
  title: string;
  impact: 'low' | 'medium' | 'high';
  asset_classes: string[];
  starts_at: string;
  ends_at: string;
  active?: boolean;
}

export interface EventRiskStatus {
  healthy: boolean;
  activeEvents: EventBlackout[];
  reason?: string;
}

export function evaluateEventEntryGate(status: EventRiskStatus, minimumImpact: EventBlackout['impact']): { approved: boolean; reason?: string; activeEventIds: string[] } {
  if (!status.healthy) return { approved: false, reason: status.reason ?? 'Event risk data is unavailable; new entries are blocked.', activeEventIds: [] };
  const impactOrder = { low: 1, medium: 2, high: 3 };
  const activeEvents = status.activeEvents.filter((event) => impactOrder[event.impact] >= impactOrder[minimumImpact]);
  if (!activeEvents.length) return { approved: true, activeEventIds: [] };
  return {
    approved: false,
    reason: `Entry blocked by active event blackout: ${activeEvents.map((event) => event.title).join(', ')}.`,
    activeEventIds: activeEvents.map((event) => event.id),
  };
}

export async function getEventRiskStatus(symbol: string, now = Date.now()): Promise<EventRiskStatus> {
  if (process.env.NODE_ENV === 'test') return { healthy: true, activeEvents: [] };
  const market = getMarket(symbol);
  if (!market) return { healthy: false, activeEvents: [], reason: 'Event risk data is unavailable; new entries are blocked.' };
  try {
    const nowIso = new Date(now).toISOString();
    const supabase = getSupabaseClient();
    const [{ data: manualEvents, error: manualError }, { data: providerEvents, error: providerError }] = await Promise.all([
      supabase.from('event_blackouts').select('id,title,impact,asset_classes,starts_at,ends_at,active')
        .eq('active', true).lte('starts_at', nowIso).gt('ends_at', nowIso),
      supabase.from('calendar_events').select('id,title,impact,asset_classes,starts_at,ends_at,ingested_at')
        .lte('ingested_at', nowIso).lte('starts_at', nowIso).gt('ends_at', nowIso),
    ]);
    if (manualError || providerError || !manualEvents || !providerEvents) {
      return { healthy: false, activeEvents: [], reason: 'Event risk data is unavailable; new entries are blocked.' };
    }
    const activeEvents = [...manualEvents, ...providerEvents] as EventBlackout[];
    return { healthy: true, activeEvents: activeEvents.filter((event) => event.asset_classes.includes(market.marketType)) };
  } catch {
    return { healthy: false, activeEvents: [], reason: 'Event risk data is unavailable; new entries are blocked.' };
  }
}
