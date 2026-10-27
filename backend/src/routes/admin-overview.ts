import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { getSupabaseClient, getSupabaseClientWithToken } from '../db';
import { paperAutopilotScheduler, AUTOPILOT_TIMEFRAMES } from '../autonomy/paper-autopilot';
import { getLiveFeedDiagnostics } from '../live/register-stream';
import { getCachedCandleFreshness, getMassiveBudgetSnapshot, getTwelveDataBudgetSnapshot } from '../services/marketDataService';
import { adminOverviewSchema, autopilotEnrollmentStatus, paperWorkerHealth, paperWorkerState, unverifiedTile, type AdminOverview, type HealthStatus } from '../services/adminOverview';
import { traderConfig } from '../trader/config';
import { candleSeconds } from '../trader/candle-math';

const reverifyBodySchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();
const safeReason = (value: unknown): string => typeof value === 'string'
  ? value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email redacted]').replace(/\b(?:bearer\s+)?[A-Za-z0-9_-]{24,}\b/gi, '[token redacted]').replace(/https?:\/\/\S+/g, '[url redacted]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip redacted]').slice(0, 160)
  : 'Unavailable';

let overviewCache: { expiresAt: number; value: AdminOverview } | undefined;
let overviewRequest: Promise<AdminOverview> | undefined;

function tile(status: HealthStatus, reason: string, checkedAt: string) {
  return { status, reason, checkedAt };
}

function statusFromLedger(status: unknown): HealthStatus {
  return status === 'verified' ? 'ok' : status === 'broken' ? 'down' : 'unverified';
}

function nonNegativeCount(value: unknown): number | null {
  const count = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export async function buildAdminOverview(): Promise<AdminOverview> {
  let client: ReturnType<typeof getSupabaseClient> | undefined;
  try { client = getSupabaseClient(); } catch { client = undefined; }
  const generatedAt = new Date().toISOString();
  const checkedAt = generatedAt;
  const fallback = (reason: string) => unverifiedTile(reason, checkedAt);
  const schemaPromise = (async () => {
    try {
      const { data, error } = await client!.rpc('verify_paper_schema');
      if (error || !data || typeof data !== 'object') return { ...fallback('Schema check is unavailable.'), missing: [] };
      const result = data as { ok?: boolean; missing?: string[] };
      if (typeof result.ok !== 'boolean' || !Array.isArray(result.missing)) return { ...fallback('Schema check returned an unverified response.'), missing: [] };
      const missing = result.missing.filter((item) => typeof item === 'string');
      return { ...tile(result.ok ? 'ok' : 'down', result.ok ? 'Required paper schema is present.' : 'Required schema items are missing.', checkedAt), missing };
    } catch { return { ...fallback('Schema check is unavailable.'), missing: [] }; }
  })();
  const ledgerPromise = (async () => {
    try {
      const { error: checkpointError } = await client!.from('paper_ledger_verification_checkpoints').select('account_id').limit(0);
      if (checkpointError) throw new Error();
      const { data, error } = await client!.rpc('paper_ledger_health');
      if (error || !data || typeof data !== 'object') throw new Error();
      const value = data as { status?: string; checkedAccounts?: number; brokenAccounts?: number; checkedRows?: number };
      const checkedAccounts = nonNegativeCount(value.checkedAccounts);
      const brokenAccounts = nonNegativeCount(value.brokenAccounts);
      const checkedRows = nonNegativeCount(value.checkedRows);
      if (checkedAccounts === null || brokenAccounts === null || checkedRows === null) throw new Error();
      const status = checkedAccounts === 0 ? 'unverified' : statusFromLedger(value.status);
      return {
        hashChain: { ...tile(status, status === 'ok' ? 'New ledger rows verified against per-account checkpoints.' : status === 'down' ? 'A ledger hash-chain break was detected.' : checkedAccounts === 0 ? 'No paper accounts are available for verification.' : 'Ledger hash-chain verification is unavailable.', checkedAt), checkedAccounts, brokenAccounts, checkedRows },
        accounting: null as AdminOverview['ledger']['accounting'] | null,
      };
    } catch {
      return { hashChain: { ...fallback('Ledger hash-chain verification is unavailable.'), checkedAccounts: 0, brokenAccounts: 0, checkedRows: 0 }, accounting: null };
    }
  })();
  const accountPromise = (async () => {
    try {
      const { data, error } = await client!.rpc('paper_accounting_health', {
        p_starting_equity: traderConfig.TRADER_STARTING_EQUITY,
        p_tolerance: traderConfig.ACCOUNTING_RECONCILIATION_TOLERANCE,
      });
      if (error || !data || typeof data !== 'object') throw new Error();
      const result = data as { status?: string; checkedAccounts?: number; brokenAccounts?: number };
      const checkedAccounts = nonNegativeCount(result.checkedAccounts);
      const brokenAccounts = nonNegativeCount(result.brokenAccounts);
      if (checkedAccounts === null || brokenAccounts === null) throw new Error();
      const status: HealthStatus = result.status === 'broken' ? 'down' : result.status === 'verified' && checkedAccounts > 0 ? 'ok' : 'unverified';
      return { status, checkedAccounts, brokenAccounts, reason: status === 'ok' ? 'Cash/equity accounting identity reconciled.' : status === 'down' ? 'Cash/equity accounting identity failed for one or more accounts.' : 'Cash/equity accounting reconciliation is unavailable or has no accounts.' };
    } catch { return { status: 'unverified' as const, checkedAccounts: 0, brokenAccounts: 0, reason: 'Cash/equity accounting reconciliation is unavailable.' }; }
  })();
  const autopilotPromise = (async () => {
    try {
      const [{ data: rows, error: rowsError }, { data: settings, error: settingsError }] = await Promise.all([
        client!.from('paper_autopilot').select('enabled,symbols,paused_reason'),
        client!.from('autopilot_settings').select('max_symbols_global').eq('singleton', true).maybeSingle(),
      ]);
      if (rowsError || settingsError || !rows || !settings) throw new Error();
      const enabled = rows.filter((row) => row.enabled);
      const paused = enabled.filter((row) => Boolean(row.paused_reason));
      const configuredSymbols = [...new Set(enabled.flatMap((row) => row.symbols ?? []))];
      const cap = Number(settings.max_symbols_global);
      return { status: autopilotEnrollmentStatus(enabled.length, paused.length), enrolledAccounts: enabled.length, pausedAccounts: paused.length, pausedReasons: paused.map((row) => safeReason(row.paused_reason)), symbolsInUse: configuredSymbols.length, symbolCap: Number.isFinite(cap) ? cap : 0, configuredSymbols };
    } catch { return { status: 'unverified' as const, enrolledAccounts: 0, pausedAccounts: 0, pausedReasons: [], symbolsInUse: 0, symbolCap: 0, configuredSymbols: [] }; }
  })();
  const denialPromise = (async () => {
    try {
      const { count, error } = await client!.from('admin_audit_events').select('id', { count: 'exact', head: true }).in('action', ['admin.mfa_denied', 'admin.access_denied']).gte('created_at', new Date(Date.now() - 86_400_000).toISOString());
      const safeCount = nonNegativeCount(count);
      if (error || safeCount === null) throw new Error();
      return { status: 'ok' as const, count: safeCount, reason: 'Recorded admin access and MFA denials in the last 24 hours.', checkedAt };
    } catch { return { status: 'unverified' as const, count: 0, reason: 'Admin denial count is unavailable.', checkedAt }; }
  })();

  const [schema, ledger, accounting, autopilot, denials] = await Promise.all([schemaPromise, ledgerPromise, accountPromise, autopilotPromise, denialPromise]);
  const schedulerDiagnostics = paperAutopilotScheduler.diagnostics();
  const schedulerEnabled = process.env.NODE_ENV !== 'test';
  const schedulerState = paperWorkerState({ enabled: schedulerEnabled, schemaOk: schema.status === 'ok', running: schedulerDiagnostics.running,
    lastCycleAt: schedulerDiagnostics.lastCycleAt, lastError: schedulerDiagnostics.lastError, nowMs: Date.now(),
    maxCycleAgeMs: (candleSeconds(traderConfig.MGMT_TIMEFRAME as import('../../../src/lib/types').Timeframe) * 3_000) + traderConfig.CLOSE_GRACE_MS + traderConfig.SCHEDULER_JITTER_MS });
  const schedulerHealth = paperWorkerHealth(schedulerState);
  const massive = getMassiveBudgetSnapshot();
  const twelveData = getTwelveDataBudgetSnapshot();
  const provider = (name: 'Massive' | 'Twelve Data', budget: typeof massive, configured: boolean) => ({
    provider: name,
    ...tile(!configured ? 'unverified' : budget.backoffUntil ? 'degraded' : 'ok', !configured ? 'Provider key is not configured.' : budget.backoffUntil ? 'Provider is in an active backoff window.' : 'In-process request budget snapshot is available.', checkedAt),
    quota: budget.requestsPerWindow, windowMs: budget.windowMs, usedInWindow: budget.usedInWindow, queued: budget.queued, backoffUntil: budget.backoffUntil, last429At: budget.last429At,
  });
  const { configuredSymbols, ...autopilotSummary } = autopilot;
  const freshness = getCachedCandleFreshness(configuredSymbols, AUTOPILOT_TIMEFRAMES, config.adminCandleStaleMultiplier);
  const liveFeeds = getLiveFeedDiagnostics();
  const feeds: AdminOverview['feeds'] = liveFeeds?.map((item) => {
    const status: HealthStatus = item.status === 'connected' ? 'ok' : item.status === 'reconnecting' ? 'degraded' : 'down';
    return { feed: item.feed === 'coinbase' ? 'Coinbase' : 'Twelve Data', ...tile(status, `Feed is ${item.status}.`, checkedAt), subscribedSymbols: item.subscribedSymbols, connectedClients: item.connectedClients, droppedUpdates: item.droppedUpdates, reconnects: item.reconnects, gaps: item.gaps, lastTickAgeMs: item.lastTickAt === null ? null : Math.max(0, Date.now() - item.lastTickAt) };
  }) ?? [];
  if (!feeds.some((item) => item.feed === 'Coinbase')) feeds.push({ feed: 'Coinbase', ...fallback(config.liveFeed.enabled ? 'Coinbase feed diagnostics are unavailable.' : 'Live feed is disabled.'), subscribedSymbols: 0, connectedClients: 0, droppedUpdates: 0, reconnects: 0, gaps: 0, lastTickAgeMs: null });
  if (!feeds.some((item) => item.feed === 'Twelve Data')) feeds.push({ feed: 'Twelve Data', ...fallback('Twelve Data live-feed diagnostics are not registered.'), subscribedSymbols: 0, connectedClients: 0, droppedUpdates: 0, reconnects: 0, gaps: 0, lastTickAgeMs: null });
  const ledgerWithAccounting = { hashChain: ledger.hashChain, accounting: { ...tile(accounting.status, accounting.reason, checkedAt), checkedAccounts: accounting.checkedAccounts, brokenAccounts: accounting.brokenAccounts } };
  const overview = {
    environment: config.appEnvironment,
    generatedAt,
    schema,
    ledger: ledgerWithAccounting,
    scheduler: {
      ...tile(schedulerHealth.status, schedulerHealth.reason, checkedAt),
      state: schedulerState,
      enabled: schedulerEnabled, entriesEnabled: config.autonomousTradingEnabled, running: schedulerDiagnostics.running, cycleInProgress: schedulerDiagnostics.cycleInProgress, lastCycleAt: schedulerDiagnostics.lastCycleAt,
      activeLeaseCount: schedulerDiagnostics.activeLeaseCount, leaseContentionCount: schedulerDiagnostics.leaseContentionCount,
      leaseClaimFailureCount: schedulerDiagnostics.leaseClaimFailureCount, leaseRenewalFailureCount: schedulerDiagnostics.leaseRenewalFailureCount,
      lastBoundaries: schedulerDiagnostics.lastBoundaries, nextScheduledAt: schedulerDiagnostics.nextScheduledAt,
      lastError: schedulerDiagnostics.lastError ? 'Scheduler cycle failed; inspect server logs.' : null,
    },
    providers: [provider('Massive', massive, Boolean(config.massiveApiKey)), provider('Twelve Data', twelveData, Boolean(config.twelveDataApiKey))],
    feeds,
    freshness,
    autopilot: { ...tile(autopilot.status, autopilot.status === 'ok' ? 'Enabled accounts are available and none are paused.' : autopilot.status === 'degraded' ? 'No enabled accounts are enrolled or at least one enrolled account is paused.' : 'Autopilot summary is unavailable.', checkedAt), ...autopilotSummary, reason: autopilot.status === 'ok' ? 'Enabled accounts are available and none are paused.' : autopilot.status === 'degraded' ? 'No enabled accounts are enrolled or at least one enrolled account is paused.' : 'Autopilot summary is unavailable.' },
    auditDenials24h: denials,
    refreshIntervalMs: config.adminOverviewRefreshMs,
  };
  return adminOverviewSchema.parse(overview);
}

export async function getAdminOverview(): Promise<AdminOverview> {
  if (overviewCache && Date.now() < overviewCache.expiresAt) return overviewCache.value;
  if (overviewRequest) return overviewRequest;
  overviewRequest = buildAdminOverview();
  try {
    const value = await overviewRequest;
    overviewCache = { value, expiresAt: Date.now() + config.adminOverviewCacheTtlMs };
    return value;
  } finally { overviewRequest = undefined; }
}

export function resetAdminOverviewCacheForTests(): void {
  overviewCache = undefined;
  overviewRequest = undefined;
}

export async function adminOverviewRoutes(app: FastifyInstance) {
  app.get('/api/v1/admin/overview', { preHandler: app.requireAdmin }, async (request, reply) => {
    try { return await getAdminOverview(); }
    catch {
      request.log.warn('Admin overview source unavailable or invalid.');
      return reply.code(503).send({ error: 'Admin health overview is unavailable.' });
    }
  });

  app.post('/api/v1/admin/overview/ledger/reverify', {
    preHandler: [app.requireAuth, async (request, reply) => {
      if (!request.accessToken || !request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required.' });
      const userClient = getSupabaseClientWithToken(request.accessToken);
      const [{ data: profile, error: profileError }, { data: claims, error: claimsError }] = await Promise.all([
        userClient.from('profiles').select('role').eq('id', request.authenticatedUserId).maybeSingle(),
        userClient.auth.getClaims(request.accessToken),
      ]);
      if (profileError) return reply.code(503).send({ error: 'Admin access could not be verified.' });
      if (profile?.role !== 'admin') return reply.code(403).send({ error: 'Admin access required.' });
      if (claimsError || !claims) return reply.code(503).send({ error: 'Admin assurance level could not be verified.' });
      if (claims.claims.aal !== 'aal2') {
        const { error: auditError } = await userClient.rpc('admin_record_health_audit', { p_action: 'admin.mfa_denied', p_reason: 'Full ledger verification requires AAL2.', p_checked_accounts: null });
        if (auditError) return reply.code(503).send({ error: 'Admin action denial could not be recorded.' });
        return reply.code(403).send({ error: 'Two-factor authentication required for this action.' });
      }
    }, app.requireAdmin],
    config: { rateLimit: { max: 1, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const body = reverifyBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'A reason is required for full ledger verification.' });
    if (!request.accessToken) return reply.code(401).send({ error: 'Authentication required.' });
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.rpc('admin_reverify_paper_ledger', {
        p_actor_id: request.authenticatedUserId, p_reason: safeReason(body.data.reason),
      });
      if (error) throw error;
      resetAdminOverviewCacheForTests();
      return { result: data };
    } catch {
      await getSupabaseClientWithToken(request.accessToken).rpc('admin_record_health_audit', { p_action: 'paper_ledger.full_reverify_failed', p_reason: 'Full ledger verification failed.', p_checked_accounts: null });
      return reply.code(503).send({ error: 'Full ledger verification could not be completed.' });
    }
  });
}
