import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { analyze, type AnalyzeInput } from '../services/decisionService';
import { AutonomousPipeline } from '../autonomy/pipeline';

export async function decisionRoutes(app: FastifyInstance, pipeline: AutonomousPipeline) {
  const handler = async (request: FastifyRequest<{ Body: AnalyzeInput }>, reply: FastifyReply) => {
    try {
      return await analyze(request.body);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Analysis failed.' });
    }
  };
  app.post<{ Body: AnalyzeInput }>('/api/v1/decisions/analyze', { preHandler: app.requireAuth }, handler);
  app.post<{ Body: AnalyzeInput }>('/api/v1/analyze', { preHandler: app.requireAuth }, handler);

  app.get('/api/v1/autonomy/status', { preHandler: app.requireAuth }, async () => pipeline.getSnapshot());
  app.post('/api/v1/autonomy/start', { preHandler: app.requireAdmin }, async () => { pipeline.start(); return pipeline.getSnapshot(); });
  app.post('/api/v1/autonomy/pause', { preHandler: app.requireAdmin }, async () => { pipeline.pause(); return pipeline.getSnapshot(); });
  app.post('/api/v1/autonomy/run', { preHandler: app.requireAdmin }, async (request, reply) => {
    const body = request.body as { symbol?: string; timeframe?: AnalyzeInput['timeframe']; candles?: AnalyzeInput['candles'] };
    try {
      pipeline.start();
      return await pipeline.runOnce(body.symbol ?? 'BTCUSDT', body.timeframe, body.candles);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Pipeline failed.' });
    }
  });
}
