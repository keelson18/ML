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
  app.post('/api/v1/decisions/analyze', handler);
  app.post('/api/v1/analyze', handler);

  app.get('/api/v1/autonomy/status', async () => pipeline.getSnapshot());
  app.post('/api/v1/autonomy/start', async () => { pipeline.start(); return pipeline.getSnapshot(); });
  app.post('/api/v1/autonomy/pause', async () => { pipeline.pause(); return pipeline.getSnapshot(); });
  app.post('/api/v1/autonomy/run', async (request, reply) => {
    const body = request.body as { symbol?: string; timeframe?: AnalyzeInput['timeframe']; candles?: AnalyzeInput['candles'] };
    try {
      pipeline.start();
      return await pipeline.runOnce(body.symbol ?? 'BTCUSDT', body.timeframe, body.candles);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Pipeline failed.' });
    }
  });
}