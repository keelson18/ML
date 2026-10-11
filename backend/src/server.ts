import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { config } from './config.js';
import { getSupabaseClient } from './db';
import { AutonomousPipeline } from './autonomy/pipeline';
import { paperAutopilotScheduler } from './autonomy/paper-autopilot';
import { decisionRoutes } from './routes/decisions';
import { marketRoutes } from './routes/market';
import { paperRoutes } from './routes/paper';
import { positionRoutes } from './routes/positions';
import { registerAuthGuards } from './middleware/fastify-auth';
import { marketAvailabilityRoutes } from './routes/market-availability';
import { traderRoutes } from './routes/trader';
import { adminUserRoutes } from './routes/admin-users';
import { eventRoutes } from './routes/events';
import { newsRoutes } from './routes/news';
import { personalDataRoutes } from './routes/personal-data';
import { coachContextRoutes } from './routes/coach-context';
import { registerLiveStream } from './live/register-stream';
import { probeAllMarkets } from './services/marketAvailability';
import { readJsonSafe } from '../../shared/http';

// Allowed CORS origins from env, defaults to local dev
function allowedOrigins(): string[] {
  const configured = process.env.CORS_ORIGIN;
  if (!configured && process.env.NODE_ENV === 'production') throw new Error('CORS_ORIGIN must be set in production.');
  return (configured ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);
}

let paperLedgerHealthCache: { checkedAt: number; value: { status: 'verified' | 'broken' | 'unavailable'; checkedAccounts: number; brokenAccounts: number; reconciliationFailures: number } } | undefined;
let paperLedgerHealthCheck: Promise<{ status: 'verified' | 'broken' | 'unavailable'; checkedAccounts: number; brokenAccounts: number; reconciliationFailures: number }> | undefined;

async function readPaperLedgerHealth() {
  if (paperLedgerHealthCache && Date.now() - paperLedgerHealthCache.checkedAt < 300_000) return paperLedgerHealthCache.value;
  if (paperLedgerHealthCheck) return paperLedgerHealthCheck;
  paperLedgerHealthCheck = (async () => {
    let value: { status: 'verified' | 'broken' | 'unavailable'; checkedAccounts: number; brokenAccounts: number; reconciliationFailures: number } = {
      status: 'unavailable', checkedAccounts: 0, brokenAccounts: 0, reconciliationFailures: 0,
    };
    try {
      const { data, error } = await getSupabaseClient().rpc('paper_ledger_health');
      if (!error && data && typeof data === 'object') value = data as typeof value;
    } catch { value = { status: 'unavailable', checkedAccounts: 0, brokenAccounts: 0, reconciliationFailures: 0 }; }
    paperLedgerHealthCache = { checkedAt: Date.now(), value };
    return value;
  })();
  try { return await paperLedgerHealthCheck; }
  finally { paperLedgerHealthCheck = undefined; }
}

export function buildServer() {
  const app = Fastify({ logger: true });
  void app.register(helmet, {
    hsts: process.env.NODE_ENV === 'production'
      ? { maxAge: 31_536_000, includeSubDomains: true }
      : false,
  });
  void app.register(rateLimit, {
    global: false,
    hook: 'preHandler',
    max: config.marketRateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    keyGenerator: (request) => request.authenticatedUserId ?? request.ip,
    onExceeded: (request) => request.log.warn({ userId: request.authenticatedUserId, route: request.routeOptions.url }, 'authenticated request rate limit exceeded'),
    errorResponseBuilder: () => ({ statusCode: 429, error: 'Too Many Requests', message: 'Too many requests. Please try again later.' }),
  });
  registerAuthGuards(app);
  const pipeline = new AutonomousPipeline({ enableExecution: false });

  void app.register(cors, { origin: allowedOrigins() });
  void app.register(decisionRoutes, pipeline);
  void app.register(marketRoutes);
  void app.register(paperRoutes);
  void app.register(positionRoutes);
  void app.register(marketAvailabilityRoutes);
  void app.register(traderRoutes);
  void app.register(coachContextRoutes);
  void app.register(adminUserRoutes);
  void app.register(eventRoutes);
  void app.register(newsRoutes);
  void app.register(personalDataRoutes);
  if (config.liveFeed.enabled) registerLiveStream(app, allowedOrigins());
  app.get('/health', async () => ({
    status: 'ok', service: 'quantum-api', autonomy: pipeline.getSnapshot(), paperLedger: await readPaperLedgerHealth(),
  }));
  return { app, pipeline };
}

export async function startServer() {
  const { app, pipeline } = buildServer();
  const scheduler = paperAutopilotScheduler;
  const port = Number(process.env.AUTONOMY_PORT ?? process.env.PORT ?? 8787);
  try {
    await app.listen({ port, host: '0.0.0.0' });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EADDRINUSE') {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        const { payload: health } = await readJsonSafe<{ service?: string }>(response);
        if (response.ok && health?.service === 'quantum-api') {
          console.log(`[server] Quantum API is already running on port ${port}.`);
          return { app, pipeline, scheduler };
        }
      } catch {
        // The port is occupied by another service; preserve the original error below.
      }
    }
    throw error;
  }
  scheduler.start();
  if (config.massiveApiKey) void probeAllMarkets().catch(() => app.log.warn('market availability probe failed'));
  const shutdown = async () => { scheduler.stop(); await app.close(); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return { app, pipeline, scheduler };
}

if (process.env.NODE_ENV !== 'test') {
  void startServer();
}
