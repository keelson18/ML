import Fastify from 'fastify';
import cors from '@fastify/cors';
import { AutonomousPipeline } from './autonomy/pipeline';
import { AutonomousScheduler } from './autonomy/scheduler';
import { decisionRoutes } from './routes/decisions';
import { marketRoutes } from './routes/market';
import { paperRoutes } from './routes/paper';
import { positionRoutes } from './routes/positions';
import { registerAuthGuards } from './middleware/fastify-auth';

function allowedOrigins(): string[] {
  const configured = process.env.CORS_ORIGIN;
  if (!configured && process.env.NODE_ENV === 'production') throw new Error('CORS_ORIGIN must be set in production.');
  return (configured ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);
}

const autonomyEnabled = () => process.env.AUTONOMOUS_TRADING === 'true';

export function buildServer() {
  const app = Fastify({ logger: true });
  registerAuthGuards(app);
  const pipeline = new AutonomousPipeline({ enableExecution: autonomyEnabled() });
  void app.register(cors, { origin: allowedOrigins() });
  void app.register(decisionRoutes, pipeline);
  void app.register(marketRoutes);
  void app.register(paperRoutes);
  void app.register(positionRoutes);
  app.get('/health', async () => ({ status: 'ok', service: 'quantum-api', autonomy: pipeline.getSnapshot() }));
  return { app, pipeline };
}

export async function startServer() {
  const { app, pipeline } = buildServer();
  const scheduler = new AutonomousScheduler(pipeline, ['BTCUSDT', 'ETHUSDT'], '15m');
  const port = Number(process.env.AUTONOMY_PORT ?? process.env.PORT ?? 8787);
  try {
    await app.listen({ port, host: '0.0.0.0' });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EADDRINUSE') {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        const health = await response.json() as { service?: string };
        if (response.ok && health.service === 'quantum-api') {
          console.log(`[server] Quantum API is already running on port ${port}.`);
          return { app, pipeline, scheduler };
        }
      } catch {
        // The port is occupied by another service; preserve the original error below.
      }
    }
    throw error;
  }
  if (autonomyEnabled()) scheduler.start();
  const shutdown = async () => { scheduler.stop(); await app.close(); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return { app, pipeline, scheduler };
}

if (process.env.NODE_ENV !== 'test') {
  void startServer();
}
