import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { getSupabaseClient } from '../db';
import { filterNewsAtIngestedAt, getNewsProviderStatus, sanitizePlainText, type ProviderAvailability } from '../news/providers';

const feedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  symbol: z.string().trim().max(20).optional(),
  asOf: z.string().datetime().optional(),
}).strict();

export async function newsRoutes(app: FastifyInstance) {
  app.get('/api/v1/news/status', { preHandler: app.requireAuth }, async () => getNewsProviderStatus());

  app.get('/api/v1/news/items', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    const parsed = feedQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid news query.' });
    const asOf = parsed.data.asOf ?? new Date().toISOString();
    try {
      let query = getSupabaseClient().from('news_items').select('id,provider,title,summary,symbols,published_at,ingested_at')
        .lte('ingested_at', asOf).order('ingested_at', { ascending: false }).limit(parsed.data.limit);
      if (parsed.data.symbol) query = query.contains('symbols', [parsed.data.symbol]);
      const { data, error } = await query;
      if (error) throw error;
      return {
        items: filterNewsAtIngestedAt(data ?? [], asOf).map((item) => ({ ...item, title: sanitizePlainText(item.title, 300), summary: sanitizePlainText(item.summary ?? '') })),
        availability: 'unverified' as ProviderAvailability,
        asOf,
      };
    } catch {
      return reply.code(503).send({ error: 'News feed is unavailable.' });
    }
  });

  app.get('/api/v1/calendar/events', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } },
  }, async (request, reply) => {
    const parsed = feedQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid calendar query.' });
    const asOf = parsed.data.asOf ?? new Date().toISOString();
    try {
      const [{ data: providerEvents, error: providerError }, { data: manualEvents, error: manualError }] = await Promise.all([
        getSupabaseClient().from('calendar_events').select('id,title,impact,asset_classes,symbols,starts_at,ends_at,ingested_at').lte('ingested_at', asOf).gte('ends_at', asOf).order('starts_at').limit(parsed.data.limit),
        getSupabaseClient().from('event_blackouts').select('id,title,impact,asset_classes,starts_at,ends_at,created_at').eq('active', true).gte('ends_at', asOf).order('starts_at').limit(parsed.data.limit),
      ]);
      if (providerError || manualError) throw providerError ?? manualError;
      const events = [
        ...filterNewsAtIngestedAt(providerEvents ?? [], asOf).map((event) => ({ ...event, source: 'provider', title: sanitizePlainText(event.title, 300) })),
        ...(manualEvents ?? []).map((event) => ({ ...event, source: 'manual', title: sanitizePlainText(event.title, 300) })),
      ].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)).slice(0, parsed.data.limit);
      return { events, availability: 'unverified' as ProviderAvailability, asOf };
    } catch {
      return reply.code(503).send({ error: 'Calendar feed is unavailable; entries are blocked.' });
    }
  });
}
