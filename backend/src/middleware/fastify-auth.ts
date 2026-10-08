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
      await app.requireAuth(request, reply);
      if (reply.sent) return;
    }
    if (!request.authenticatedUserId || !request.accessToken) return;
    try {
      const supabase = getSupabaseClientWithToken(request.accessToken);
      const { data, error } = await supabase.from('profiles').select('role').eq('id', request.authenticatedUserId).maybeSingle();
      if (error || data?.role !== 'admin') {
        reply.code(403).send({ error: 'Admin access required' });
        return;
      }
      const [{ data: userData, error: userError }, { data: claimsData, error: claimsError }] = await Promise.all([
        supabase.auth.getUser(request.accessToken),
        supabase.auth.getClaims(request.accessToken),
      ]);
      if (userError || claimsError || !userData.user || !claimsData) {
        reply.code(503).send({ error: 'Admin assurance level could not be verified' });
        return;
      }
      const hasVerifiedFactor = userData.user.factors?.some((factor) => factor.status === 'verified') ?? false;
      const currentLevel = claimsData.claims.aal;
      if ((process.env.REQUIRE_ADMIN_MFA === 'true' || hasVerifiedFactor) && currentLevel !== 'aal2') {
        reply.code(403).send({ error: 'Two-factor authentication required' });
      }
    } catch {
      reply.code(503).send({ error: 'Authorization service unavailable' });
    }
  });
}
