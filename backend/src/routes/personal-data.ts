import type { FastifyInstance } from 'fastify';
import { getSupabaseClientWithToken } from '../db';
import { collectPersonalData } from '../services/personalDataExport';

export async function personalDataRoutes(app: FastifyInstance) {
  app.get('/api/v1/me/export', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: 1, timeWindow: 86_400_000 } },
  }, async (request, reply) => {
    if (!request.authenticatedUserId || !request.accessToken) return reply.code(401).send({ error: 'Authentication required.' });
    try {
      const client = getSupabaseClientWithToken(request.accessToken);
      const exportData = await collectPersonalData(client, request.authenticatedUserId);
      const { error } = await client.rpc('record_own_account_event', { p_action: 'personal_data_export' });
      if (error) throw new Error('Export audit record could not be written.');
      return reply
        .header('Content-Type', 'application/json; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="personal-data-export.json"')
        .send(exportData);
    } catch {
      request.log.warn({ userId: request.authenticatedUserId }, 'Personal data export failed');
      return reply.code(503).send({ error: 'Personal data export is temporarily unavailable.' });
    }
  });
}
