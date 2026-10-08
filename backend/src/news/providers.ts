import { MARKET_UNIVERSE } from '../../../src/lib/markets';
import { getSupabaseClient } from '../db';

export type ProviderAvailability = 'unverified' | 'available' | 'unavailable';

export interface NewsItemInput {
  externalId: string;
  title: string;
  summary?: string;
  symbols?: string[];
  publishedAt?: string;
}

export interface CalendarEventInput {
  externalId: string;
  title: string;
  impact: 'low' | 'medium' | 'high';
  assetClasses: string[];
  symbols?: string[];
  startsAt: string;
  endsAt: string;
}

export interface NewsProvider {
  name: string;
  probe(): Promise<ProviderAvailability>;
  fetch(): Promise<NewsItemInput[]>;
}

export interface CalendarProvider {
  name: string;
  probe(): Promise<ProviderAvailability>;
  fetch(): Promise<CalendarEventInput[]>;
}

const newsProvider: NewsProvider = {
  name: 'No provider configured',
  probe: async () => 'unverified',
  fetch: async () => [],
};
const calendarProvider: CalendarProvider = {
  name: 'No provider configured',
  probe: async () => 'unverified',
  fetch: async () => [],
};

export function sanitizePlainText(value: string, maxLength = 2_000): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function filterNewsAtIngestedAt<T extends { ingested_at: string }>(items: T[], asOf: string): T[] {
  const cutoff = Date.parse(asOf);
  return items.filter((item) => Date.parse(item.ingested_at) <= cutoff);
}

export function tagMarketSymbols(symbols: string[] = []): string[] {
  const known = new Set(MARKET_UNIVERSE.filter((market) => market.isActive).map((market) => market.symbol));
  return [...new Set(symbols.filter((symbol) => known.has(symbol)))];
}

export async function getNewsProviderStatus() {
  const [newsAvailability, calendarAvailability] = await Promise.all([newsProvider.probe(), calendarProvider.probe()]);
  return {
    news: [{ provider: newsProvider.name, availability: newsAvailability, checkedAt: new Date().toISOString() }],
    calendar: [{ provider: calendarProvider.name, availability: calendarAvailability, checkedAt: new Date().toISOString() }],
  };
}

export async function ingestNewsItems(provider: string, items: NewsItemInput[]): Promise<void> {
  if (!items.length) return;
  const ingestedAt = new Date().toISOString();
  const rows = items.map((item) => ({
    provider: sanitizePlainText(provider, 80), external_id: sanitizePlainText(item.externalId, 200),
    title: sanitizePlainText(item.title, 300), summary: sanitizePlainText(item.summary ?? ''),
    symbols: tagMarketSymbols(item.symbols), published_at: item.publishedAt ?? null, ingested_at: ingestedAt,
  })).filter((item) => item.external_id && item.title);
  if (!rows.length) return;
  const { error } = await getSupabaseClient().from('news_items').upsert(rows, { onConflict: 'provider,external_id', ignoreDuplicates: true });
  if (error) throw new Error('News ingestion failed.');
}

export async function ingestCalendarEvents(provider: string, events: CalendarEventInput[]): Promise<void> {
  if (!events.length) return;
  const ingestedAt = new Date().toISOString();
  const rows = events.map((event) => ({
    provider: sanitizePlainText(provider, 80), external_id: sanitizePlainText(event.externalId, 200),
    title: sanitizePlainText(event.title, 300), impact: event.impact, asset_classes: event.assetClasses,
    symbols: tagMarketSymbols(event.symbols), starts_at: event.startsAt, ends_at: event.endsAt, ingested_at: ingestedAt,
  })).filter((event) => event.external_id && event.title && Date.parse(event.ends_at) > Date.parse(event.starts_at));
  if (!rows.length) return;
  const { error } = await getSupabaseClient().from('calendar_events').upsert(rows, { onConflict: 'provider,external_id', ignoreDuplicates: true });
  if (error) throw new Error('Calendar ingestion failed.');
}
