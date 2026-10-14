import { z } from 'zod';

export const healthStatusSchema = z.enum(['ok', 'degraded', 'down', 'unverified']);
export const workerStateSchema = z.enum(['stopped', 'starting', 'running', 'paused', 'degraded', 'blocked', 'failed']);
const healthTileSchema = z.object({ status: healthStatusSchema, reason: z.string(), checkedAt: z.string() }).strict();

export type WorkerState = z.infer<typeof workerStateSchema>;

export function paperWorkerState(input: {
  enabled: boolean;
  schemaOk: boolean;
  running: boolean;
  lastCycleAt: string | null;
  lastError: string | null;
  nowMs: number;
  maxCycleAgeMs: number;
}): WorkerState {
  if (!input.enabled) return 'stopped';
  if (!input.schemaOk) return 'blocked';
  if (!input.running) return 'failed';
  if (!input.lastCycleAt) return 'starting';
  const lastCycleAt = Date.parse(input.lastCycleAt);
  if (!Number.isFinite(lastCycleAt) || input.nowMs - lastCycleAt > input.maxCycleAgeMs) return 'degraded';
  if (input.lastError) return 'degraded';
  return 'running';
}

export function autopilotEnrollmentStatus(enrolledAccounts: number, pausedAccounts: number): 'ok' | 'degraded' {
  return enrolledAccounts > 0 && pausedAccounts === 0 ? 'ok' : 'degraded';
}

export function paperWorkerHealth(state: WorkerState): { status: HealthStatus; reason: string } {
  switch (state) {
    case 'running': return { status: 'ok', reason: 'Paper worker completed a cycle without a reported scheduler failure.' };
    case 'stopped': return { status: 'degraded', reason: 'The paper worker process is stopped.' };
    case 'starting': return { status: 'degraded', reason: 'Paper worker started but has not completed its first cycle.' };
    case 'paused': return { status: 'degraded', reason: 'Paper worker is paused.' };
    case 'degraded': return { status: 'degraded', reason: 'Paper worker is active but its latest cycle failed, was safety-paused, or its heartbeat is stale.' };
    case 'blocked': return { status: 'down', reason: 'Paper worker is blocked because the required database schema is unavailable.' };
    case 'failed': return { status: 'down', reason: 'Paper worker is enabled but is not running.' };
  }
}

export const adminOverviewSchema = z.object({
  environment: z.enum(['test', 'production']),
  generatedAt: z.string(),
  schema: healthTileSchema.extend({ missing: z.array(z.string()) }).strict(),
  ledger: z.object({
    hashChain: healthTileSchema.extend({ checkedAccounts: z.number().int().nonnegative(), brokenAccounts: z.number().int().nonnegative(), checkedRows: z.number().int().nonnegative() }).strict(),
    accounting: healthTileSchema.extend({ checkedAccounts: z.number().int().nonnegative(), brokenAccounts: z.number().int().nonnegative() }).strict(),
  }).strict(),
  scheduler: healthTileSchema.extend({
    state: workerStateSchema,
    enabled: z.boolean(), entriesEnabled: z.boolean(), running: z.boolean(), cycleInProgress: z.boolean(), lastCycleAt: z.string().nullable(), lastBoundaries: z.record(z.string(), z.number()),
    nextScheduledAt: z.string().nullable(), lastError: z.string().nullable(),
  }).strict(),
  providers: z.array(z.object({
    provider: z.enum(['Massive', 'Twelve Data']), ...healthTileSchema.shape,
    quota: z.number().int().nonnegative(), windowMs: z.number().int().positive(), usedInWindow: z.number().int().nonnegative(), queued: z.number().int().nonnegative(),
    backoffUntil: z.string().nullable(), last429At: z.string().nullable(),
  }).strict()),
  feeds: z.array(z.object({
    feed: z.enum(['Coinbase', 'Twelve Data']), ...healthTileSchema.shape,
    subscribedSymbols: z.number().int().nonnegative(), connectedClients: z.number().int().nonnegative(), droppedUpdates: z.number().int().nonnegative(),
    reconnects: z.number().int().nonnegative(), gaps: z.number().int().nonnegative(), lastTickAgeMs: z.number().int().nonnegative().nullable(),
  }).strict()),
  freshness: z.array(z.object({
    symbol: z.string(), timeframe: z.string(), status: healthStatusSchema, reason: z.string(), checkedAt: z.string(),
    newestClosedCandleAt: z.string().nullable(), ageMs: z.number().int().nonnegative().nullable(),
  }).strict()),
  autopilot: healthTileSchema.extend({ enrolledAccounts: z.number().int().nonnegative(), pausedAccounts: z.number().int().nonnegative(), pausedReasons: z.array(z.string()), symbolsInUse: z.number().int().nonnegative(), symbolCap: z.number().int().nonnegative() }).strict(),
  auditDenials24h: z.object({ status: healthStatusSchema, count: z.number().int().nonnegative(), reason: z.string(), checkedAt: z.string() }).strict(),
  refreshIntervalMs: z.number().int().positive(),
}).strict();

export type AdminOverview = z.infer<typeof adminOverviewSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export function unverifiedTile(reason: string, checkedAt = new Date().toISOString()) {
  return { status: 'unverified' as const, reason, checkedAt };
}
