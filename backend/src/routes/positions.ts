import type { FastifyInstance } from 'fastify';
import { AutonomousPipeline } from '../autonomy/pipeline';

export async function positionRoutes(app: FastifyInstance, pipeline: AutonomousPipeline) {
  app.get('/api/v1/paper/positions', async () => pipeline.getAccount());
}