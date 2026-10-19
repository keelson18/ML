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
import { adminOverviewRoutes } from './routes/admin-overview';
import { eventRoutes } from './routes/events';
import { newsRoutes } from './routes/news';
import { personalDataRoutes } from './routes/personal-data';
import { learningResearchRoutes } from './routes/learning-research';
import { coachContextRoutes } from './routes/coach-context';
import { mlRoutes } from './routes/ml';
import { registerLiveStream } from './live/register-stream';
import { readJsonSafe } from '../../shared/http';
import { createHash } from 'node:crypto';
import { isSupabaseServerKey } from './utils/supabase-server-key';
import { traderConfig } from './trader/config';

// Allowed CORS origins from env, defaults to local dev
function allowedOrigins(): string[] {
  const configured = process.env.CORS_ORIGIN;
  if (!configured && process.env.NODE_ENV === 'production') throw new Error('CORS_ORIGIN must be set in production.');
  return (configured ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);
}

type PaperHealth = { status: 'verified' | 'broken' | 'unavailable'; checkedAccounts: number; brokenAccounts: number; hashChainVerified: boolean; accounting: { checked: number; failures: number; accounts: Array<{ accountRef: string; ok: boolean; difference: number }> } };
let paperLedgerHealthCache: { checkedAt: number; value: PaperHealth } | undefined;
let paperLedgerHealthCheck: Promise<PaperHealth> | undefined;

export type SchemaHealth = {
  ok: boolean;
  missing: string[];
  failure?: 'configuration' | 'access' | 'schema' | 'connection';
};

export async function readSchemaHealth(): Promise<SchemaHealth> {
  const missingConfig = [
    ...(!config.supabaseUrl ? ['SUPABASE_URL'] : []),
    ...(!config.supabaseServiceRoleKey ? ['SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY'] : []),
    ...(config.supabaseServiceRoleKey && !isSupabaseServerKey(config.supabaseServiceRoleKey)
      ? ['Supabase server key must be an sb_secret_ key or a service_role JWT']
      : []),
  ];
  if (missingConfig.length > 0) return { ok: false, missing: missingConfig, failure: 'configuration' };
  try {
    const { data, error } = await getSupabaseClient().rpc('verify_paper_schema');
    if (error) {
      const failure = error.code === '42501' ? 'access'
        : error.code === 'PGRST202' || error.code === '42883' ? 'schema'
          : 'connection';
      return {
        ok: false,
        missing: [error.code === '42501'
          ? 'database role cannot execute verify_paper_schema (check server key and RPC grants)'
          : error.code === 'PGRST202' || error.code === '42883'
            ? 'verify_paper_schema'
            : 'database access to verify_paper_schema'],
        failure,
      };
    }
    if (!data || typeof data !== 'object') return { ok: false, missing: ['verify_paper_schema response'], failure: 'schema' };
    const result = data as { ok?: boolean; missing?: string[] };
    return { ok: Boolean(result.ok), missing: result.missing ?? [], ...(result.ok ? {} : { failure: 'schema' as const }) };
  } catch { return { ok: false, missing: ['database connection or verify_paper_schema'], failure: 'connection' }; }
}

function schemaFailureMessage(schema: SchemaHealth): string {
  if (schema.failure === 'schema') return `Database migrations not applied: ${schema.missing.join(', ')}`;
  return `Database readiness blocked (${schema.failure ?? 'unknown'}): ${schema.missing.join(', ')}`;
}

async function readPaperLedgerHealth() {
  if (paperLedgerHealthCache && Date.now() - paperLedgerHealthCache.checkedAt < config.adminOverviewCacheTtlMs) return paperLedgerHealthCache.value;
  if (paperLedgerHealthCheck) return paperLedgerHealthCheck;
  paperLedgerHealthCheck = (async () => {
    let value: PaperHealth = {
      status: 'unavailable', checkedAccounts: 0, brokenAccounts: 0, hashChainVerified: false, accounting: { checked: 0, failures: 0, accounts: [] },
    };
    try {
      const client = getSupabaseClient();
      const { error: checkpointError } = await client.from('paper_ledger_verification_checkpoints').select('account_id').limit(0);
      if (checkpointError) throw new Error('Incremental ledger verification is not installed.');
      const [{ data: ledgerData, error: ledgerError }, { data: accountingData, error: accountingError }] = await Promise.all([
        client.rpc('paper_ledger_health'),
        client.rpc('paper_accounting_health', { p_starting_equity: traderConfig.TRADER_STARTING_EQUITY, p_tolerance: traderConfig.ACCOUNTING_RECONCILIATION_TOLERANCE }),
      ]);
      if (!ledgerError && ledgerData && typeof ledgerData === 'object' && !accountingError && accountingData && typeof accountingData === 'object') {
        const hash = ledgerData as { status?: string; checkedAccounts?: number; brokenAccounts?: number };
        const accounting = accountingData as { status?: string; checkedAccounts?: number; brokenAccounts?: number };
        const checkedAccounts = Number(hash.checkedAccounts ?? 0);
        const accountingChecked = Number(accounting.checkedAccounts ?? 0);
        const accountingFailures = Number(accounting.brokenAccounts ?? 0);
        const hashChainVerified = hash.status === 'verified' && checkedAccounts > 0;
        value = { status: hash.status === 'broken' || accounting.status === 'broken' ? 'broken' : hashChainVerified && accountingChecked > 0 ? 'verified' : 'unavailable',
          checkedAccounts, brokenAccounts: Number(hash.brokenAccounts ?? 0), hashChainVerified,
          accounting: { checked: accountingChecked, failures: accountingFailures, accounts: [] } };
      }
    } catch { value = { status: 'unavailable', checkedAccounts: 0, brokenAccounts: 0, hashChainVerified: false, accounting: { checked: 0, failures: 0, accounts: [] } }; }
    paperLedgerHealthCache = { checkedAt: Date.now(), value };
    return value;
  })();
  try { return await paperLedgerHealthCheck; }
  finally { paperLedgerHealthCheck = undefined; }
}

async function readAccountPaperLedgerHealth(accountId: string): Promise<PaperHealth> {
  const unavailable: PaperHealth = {
    status: 'unavailable', checkedAccounts: 0, brokenAccounts: 0, hashChainVerified: false,
    accounting: { checked: 0, failures: 0, accounts: [] },
  };
  try {
    const client = getSupabaseClient();
    const [{ data: ledgerData, error: ledgerError }, { data: account, error: accountError }] = await Promise.all([
      client.rpc('verify_decision_ledger', { p_account_id: accountId }),
      client.from('paper_sim_accounts').select('state').eq('account_id', accountId).maybeSingle(),
    ]);
    if (ledgerError || accountError || !account?.state) return unavailable;
    const ledger = Array.isArray(ledgerData) ? ledgerData[0] : ledgerData;
    if (!ledger || typeof ledger !== 'object') return unavailable;
    const state = account.state as import('./engines/paper-execution').PaperAccountState;
    const reconciliation = (await import('./trader/decision-ledger')).reconcilePaperAccount(state);
    const hashChainVerified = Boolean((ledger as { ok?: boolean }).ok);
    const ok = hashChainVerified && reconciliation.ok;
    return {
      status: ok ? 'verified' : 'broken',
      checkedAccounts: 1,
      brokenAccounts: ok ? 0 : 1,
      hashChainVerified,
      accounting: {
        checked: 1,
        failures: reconciliation.ok ? 0 : 1,
        accounts: [{ accountRef: createHash('sha256').update(accountId).digest('hex').slice(0, 12), ok: reconciliation.ok, difference: reconciliation.difference }],
      },
    };
  } catch {
    return unavailable;
  }
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
  app.addHook('preHandler', async (request, reply) => {
    if (process.env.NODE_ENV !== 'test' && (request.url.startsWith('/api/v1/trader') || request.url.startsWith('/api/v1/paper'))) {
      const schema = await readSchemaHealth();
      if (!schema.ok) return reply.code(503).send({ error: schemaFailureMessage(schema) });
    }
  });
  const pipeline = new AutonomousPipeline({ enableExecution: false });

  void app.register(cors, { origin: allowedOrigins() });
  void app.register(decisionRoutes, pipeline);
  void app.register(marketRoutes);
  void app.register(paperRoutes);
  void app.register(positionRoutes);
  void app.register(marketAvailabilityRoutes);
  void app.register(traderRoutes);
  void app.register(coachContextRoutes);
  void app.register(mlRoutes);
  void app.register(adminUserRoutes);
  void app.register(adminOverviewRoutes);
  void app.register(eventRoutes);
  void app.register(newsRoutes);
  void app.register(personalDataRoutes);
  void app.register(learningResearchRoutes);
  if (config.liveFeed.enabled) registerLiveStream(app, allowedOrigins());
  const healthResponse = async () => ({
    status: 'ok', service: 'quantum-api', autonomy: pipeline.getSnapshot(), schema: await readSchemaHealth(), paperLedger: await readPaperLedgerHealth(),
  });
  app.get('/health', async () => ({ status: 'ok', service: 'quantum-api' }));
  app.get('/api/v1/me/health', { preHandler: app.requireAuth }, async (request) => ({
    status: 'ok', service: 'quantum-api', autonomy: pipeline.getSnapshot(), schema: await readSchemaHealth(),
    paperLedger: await readAccountPaperLedgerHealth(request.authenticatedUserId!),
  }));
  app.get('/api/v1/system/health', { preHandler: app.requireAdmin }, healthResponse);
  return { app, pipeline };
}

export async function startServer() {
  const { app, pipeline } = buildServer();
  const scheduler = paperAutopilotScheduler;
  const schema = await readSchemaHealth();
  if (!schema.ok) app.log.error({ missing: schema.missing, failure: schema.failure }, 'Database readiness failed; trading routes and scheduler are fail-closed');
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
  if (process.env.NODE_ENV !== 'test' && schema.ok) {
    scheduler.start();
    if (!config.autonomousTradingEnabled) app.log.info('Paper worker is active for existing-position management; new entries are disabled.');
  }
  const shutdown = async () => { scheduler.stop(); await app.close(); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return { app, pipeline, scheduler };
}

if (process.env.NODE_ENV !== 'test') {
  void startServer();
}
