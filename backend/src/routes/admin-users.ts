import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { getSupabaseClient, getSupabaseClientWithToken } from '../db';
import { config } from '../config';

const querySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20), search: z.string().trim().max(120).default('') }).strict();
const roleSchema = z.object({ role: z.enum(['admin', 'user']) }).strict();
const userIdSchema = z.string().uuid();

export async function adminUserRoutes(app: FastifyInstance) {
  app.get('/api/v1/admin/users', { preHandler: app.requireAdmin, config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } } }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid user directory query.' });
    try {
      const service = getSupabaseClient();
      const { data: profileRows, error: profileError } = await service.from('profiles').select('id,role,display_name,avatar_url,created_at');
      if (profileError) throw profileError;
      const authUsers: Array<{ id: string; email?: string }> = [];
      for (let page = 1; page <= 100; page += 1) {
        const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        authUsers.push(...data.users.map((user) => ({ id: user.id, email: user.email })));
        if (data.users.length < 1000) break;
      }
      const emailById = new Map(authUsers.map((user) => [user.id, user.email ?? '']));
      const normalized = parsed.data.search.toLocaleLowerCase();
      const all = (profileRows ?? []).map((profile) => ({
        id: profile.id, role: profile.role, displayName: profile.display_name, avatarUrl: profile.avatar_url, createdAt: profile.created_at,
        email: emailById.get(profile.id) ?? '',
      })).filter((user) => !normalized || `${user.email} ${user.displayName ?? ''} ${user.id} ${user.role}`.toLocaleLowerCase().includes(normalized))
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
      const start = (parsed.data.page - 1) * parsed.data.limit;
      return { users: all.slice(start, start + parsed.data.limit), page: parsed.data.page, limit: parsed.data.limit, total: all.length, pages: Math.ceil(all.length / parsed.data.limit) };
    } catch (error) {
      request.log.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'Admin user list failed');
      return reply.code(503).send({ error: 'User directory is temporarily unavailable.' });
    }
  });

  app.patch<{ Params: { id: string } }>('/api/v1/admin/users/:id/role', { preHandler: app.requireAdmin, config: { rateLimit: { max: 10, timeWindow: config.rateLimitWindowMs } } }, async (request, reply) => {
    const id = userIdSchema.safeParse(request.params.id);
    const body = roleSchema.safeParse(request.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: 'Invalid user role change.' });
    if (!request.accessToken) return reply.code(401).send({ error: 'Authentication required.' });
    const { error } = await getSupabaseClientWithToken(request.accessToken).rpc('admin_change_user_role', { p_target_user_id: id.data, p_new_role: body.data.role });
    if (error) {
      request.log.warn({ code: error.code }, 'Admin role change rejected');
      const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 409;
      return reply.code(status).send({ error: error.message.includes('last administrator') ? 'The last administrator cannot be demoted.' : error.message.includes('own admin role') ? 'Admins cannot remove their own admin role.' : 'User role change was rejected.' });
    }
    return { updated: true };
  });

  app.get('/api/v1/admin/audit-events', { preHandler: app.requireAdmin, config: { rateLimit: { max: config.marketRateLimitMax, timeWindow: config.rateLimitWindowMs } } }, async (request, reply) => {
    try {
      const { data, error } = await getSupabaseClient().from('admin_audit_events').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return { events: data ?? [] };
    } catch (error) {
      request.log.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'Admin audit history failed');
      return reply.code(503).send({ error: 'Admin audit history is temporarily unavailable.' });
    }
  });
}
