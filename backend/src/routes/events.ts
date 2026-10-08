import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { getSupabaseClient, getSupabaseClientWithToken } from '../db';

const blackoutSchema = z.object({
  title: z.string().trim().min(1).max(160),
  impact: z.enum(['low', 'medium', 'high']),
  assetClasses: z.array(z.enum(['crypto', 'forex', 'commodity', 'index', 'stock'])).min(1).max(5),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
}).strict().refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt));

export async function eventRoutes(app: FastifyInstance) {
  app.get('/api/v1/events/active', { preHandler: app.requireAuth, config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } } }, async (_request, reply) => {
    try {
      const now = new Date().toISOString();
      const { data, error } = await getSupabaseClient().from('event_blackouts')
        .select('id,title,impact,asset_classes,starts_at,ends_at')
        .eq('active', true).lte('starts_at', now).gt('ends_at', now).order('starts_at');
      if (error) throw error;
      return { events: data ?? [], checkedAt: now };
    } catch {
      return reply.code(503).send({ error: 'Event calendar is unavailable; entries are blocked.' });
    }
  });

  app.get('/api/v1/admin/event-blackouts', { preHandler: app.requireAdmin, config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } } }, async (_request, reply) => {
    try {
      const { data, error } = await getSupabaseClient().from('event_blackouts')
        .select('id,title,impact,asset_classes,starts_at,ends_at,active,created_at,cancelled_at')
        .order('starts_at', { ascending: false }).limit(100);
      if (error) throw error;
      return { events: data ?? [] };
    } catch {
      return reply.code(503).send({ error: 'Event blackout settings are unavailable.' });
    }
  });

  app.post('/api/v1/admin/event-blackouts', { preHandler: app.requireAdmin, config: { rateLimit: { max: 10, timeWindow: config.rateLimitWindowMs } } }, async (request, reply) => {
    const parsed = blackoutSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid event blackout.' });
    if (!request.accessToken) return reply.code(401).send({ error: 'Authentication required.' });
    const { data, error } = await getSupabaseClientWithToken(request.accessToken).rpc('admin_create_event_blackout', {
      p_title: parsed.data.title,
      p_impact: parsed.data.impact,
      p_asset_classes: parsed.data.assetClasses,
      p_starts_at: parsed.data.startsAt,
      p_ends_at: parsed.data.endsAt,
    });
    if (error) {
      request.log.warn({ code: error.code }, 'Event blackout creation rejected');
      return reply.code(error.code === '42501' ? 403 : 400).send({ error: 'Event blackout could not be created.' });
    }
    return reply.code(201).send({ id: data });
  });

  app.post<{ Params: { id: string } }>('/api/v1/admin/event-blackouts/:id/cancel', { preHandler: app.requireAdmin, config: { rateLimit: { max: 10, timeWindow: config.rateLimitWindowMs } } }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) return reply.code(400).send({ error: 'Invalid event blackout.' });
    if (!request.accessToken) return reply.code(401).send({ error: 'Authentication required.' });
    const { error } = await getSupabaseClientWithToken(request.accessToken).rpc('admin_cancel_event_blackout', { p_id: id.data });
    if (error) {
      request.log.warn({ code: error.code }, 'Event blackout cancellation rejected');
      return reply.code(error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400).send({ error: 'Event blackout could not be cancelled.' });
    }
    return { cancelled: true };
  });
}
