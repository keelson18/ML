import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getSupabaseClientWithToken } from '../db.js';

type Guard = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module 'fastify' {
  interface FastifyRequest {
    authenticatedUserId: string | null;
    accessToken: string | null;
  }
  interface FastifyInstance {
    requireAuth: Guard;
    requireAdmin: Guard;
  }
}

export function registerAuthGuards(app: FastifyInstance) {
  app.decorateRequest('authenticatedUserId', null);
  app.decorateRequest('accessToken', null);
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    const accessToken = authorization.slice('Bearer '.length);
    try {
      const supabase = getSupabaseClientWithToken(accessToken);
      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (error || !user) {
        reply.code(401).send({ error: 'Invalid or expired session' });
        return;
      }
      request.authenticatedUserId = user.id;
      request.accessToken = accessToken;
    } catch {
      reply.code(503).send({ error: 'Authentication service unavailable' });
    }
  });
  app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authenticatedUserId || !request.accessToken) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }
    try {
      const supabase = getSupabaseClientWithToken(request.accessToken);
      const { data, error } = await supabase.from('profiles').select('role').eq('id', request.authenticatedUserId).maybeSingle();
      if (error || data?.role !== 'admin') reply.code(403).send({ error: 'Admin access required' });
    } catch {
      reply.code(503).send({ error: 'Authorization service unavailable' });
    }
  });
}
