import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { getSupabaseClientWithToken } from '../db';

const learningEventSchema = z.object({
  sourceType: z.enum(['paper_trade', 'research', 'risk_event', 'data_quality']),
  sourceId: z.string().uuid().nullable().optional(),
  observation: z.record(z.string(), z.unknown()).default({}),
  hypothesis: z.string().trim().min(1).max(2_000),
}).strict();

const researchExperimentSchema = z.object({
  name: z.string().trim().min(1).max(160),
  hypothesis: z.string().trim().min(1).max(2_000),
  datasetId: z.string().trim().min(1).max(500),
  parameters: z.object({
    trainingEndIndex: z.number().int().nonnegative(),
    testStartIndex: z.number().int().nonnegative(),
    transactionCostRate: z.number().finite().nonnegative().max(1),
    slippageRate: z.number().finite().nonnegative().max(1),
  }).strict(),
}).strict();

function observationContainsSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(observationContainsSensitiveKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) =>
    /(token|secret|password|credential|api.?key|authorization|cookie)/i.test(key)
    || observationContainsSensitiveKey(child));
}

export async function learningResearchRoutes(app: FastifyInstance) {
  app.post('/api/v1/learning/events', { preHandler: app.requireAuth }, async (request, reply) => {
    if (!request.authenticatedUserId || !request.accessToken) return reply.code(401).send({ error: 'Authentication required.' });
    const parsed = learningEventSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid learning event.' });
    if (JSON.stringify(parsed.data.observation).length > 16_000 || observationContainsSensitiveKey(parsed.data.observation)) {
      return reply.code(400).send({ error: 'Learning observations must be bounded and exclude credentials.' });
    }
    try {
      const { data, error } = await getSupabaseClientWithToken(request.accessToken)
        .from('learning_events')
        .insert({
          user_id: request.authenticatedUserId,
          source_type: parsed.data.sourceType,
          source_id: parsed.data.sourceId ?? null,
          observation: parsed.data.observation,
          hypothesis: parsed.data.hypothesis,
          // Client booleans and requested status are intentionally not accepted as validation proof.
          status: 'hypothesis',
        })
        .select('id')
        .single();
      if (error || !data) throw new Error('Learning event insert failed.');
      return reply.code(201).send({ id: data.id });
    } catch {
      request.log.warn({ userId: request.authenticatedUserId }, 'Learning event persistence failed');
      return reply.code(503).send({ error: 'Learning event persistence is temporarily unavailable.' });
    }
  });

  app.post('/api/v1/research/experiments', { preHandler: app.requireAuth }, async (request, reply) => {
    if (!request.authenticatedUserId || !request.accessToken) return reply.code(401).send({ error: 'Authentication required.' });
    const parsed = researchExperimentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid research experiment metadata.' });
    try {
      const { data, error } = await getSupabaseClientWithToken(request.accessToken)
        .from('research_experiments')
        .insert({
          user_id: request.authenticatedUserId,
          name: parsed.data.name,
          hypothesis: parsed.data.hypothesis,
          dataset_id: parsed.data.datasetId,
          parameters: parsed.data.parameters,
          // Experiments start as drafts; only a separate validated workflow may change status.
          status: 'draft',
        })
        .select('id')
        .single();
      if (error || !data) throw new Error('Research experiment insert failed.');
      return reply.code(201).send({ id: data.id });
    } catch {
      request.log.warn({ userId: request.authenticatedUserId }, 'Research experiment persistence failed');
      return reply.code(503).send({ error: 'Research experiment persistence is temporarily unavailable.' });
    }
  });
}
