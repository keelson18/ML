import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { getSupabaseClient, getSupabaseClientWithToken } from '../db';
import { TIMEFRAMES, type Timeframe } from '../../../src/lib/types';
import { getMarket } from '../../../src/lib/markets';
import { fetchMarketData } from '../services/marketDataService';
import { selectClosedCandles } from '../trader/candle-math';
import { runResearchReplay } from '../trader/research-run';
import { traderConfig } from '../trader/config';
import { SETUP_TYPES } from '../trader/constants';
import { config } from '../config';
import { candleSeconds } from '../trader/candle-math';
import { createHash } from 'node:crypto';

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
    setupType: z.enum(SETUP_TYPES).default(SETUP_TYPES[0]),
    testStartTime: z.number().int().positive().refine((value) => value * 1000 > Date.now() + 30_000,
      'The untouched test interval must be registered before its start time.'),
    transactionCostRate: z.number().finite().nonnegative().max(1),
    slippageRate: z.number().finite().nonnegative().max(1),
  }).strict(),
}).strict();

const runResearchSchema = z.object({
  symbol: z.string().trim().min(3).max(30),
  timeframe: z.enum(TIMEFRAMES.map((timeframe) => timeframe.value) as [Timeframe, ...Timeframe[]]),
  historyLimit: z.number().int().min(200).max(1000).default(1000),
}).strict();
const promoteResearchSchema = z.object({ runId: z.string().uuid() }).strict();

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

  app.post<{ Params: { id: string } }>('/api/v1/research/experiments/:id/run', { preHandler: app.requireAuth }, async (request, reply) => {
    if (!request.authenticatedUserId || !request.accessToken) return reply.code(401).send({ error: 'Authentication required.' });
    const experimentId = z.string().uuid().safeParse(request.params.id);
    const parsed = runResearchSchema.safeParse(request.body);
    if (!experimentId.success || !parsed.success) return reply.code(400).send({ error: 'Invalid research run request.' });
    const market = getMarket(parsed.data.symbol);
    if (!market?.isActive || market.priceCurrency !== 'USD') return reply.code(400).send({ error: 'Research supports only active USD markets.' });
    try {
      const ownerClient = getSupabaseClientWithToken(request.accessToken);
      const { data: experiment, error: experimentError } = await ownerClient.from('research_experiments')
        .select('id,user_id,name,hypothesis,status,created_at,parameters')
        .eq('id', experimentId.data).eq('user_id', request.authenticatedUserId).maybeSingle();
      if (experimentError || !experiment) return reply.code(404).send({ error: 'Research experiment was not found.' });
      if (!['draft', 'completed'].includes(experiment.status)) return reply.code(409).send({ error: 'Only a draft experiment or an identical persisted run can be evaluated.' });
      const parameters = experiment.parameters as { testStartTime?: number; transactionCostRate?: number; slippageRate?: number };
      if (!Number.isInteger(parameters.testStartTime)
        || !Number.isFinite(parameters.transactionCostRate) || parameters.transactionCostRate! < 0 || parameters.transactionCostRate! >= 1
        || !Number.isFinite(parameters.slippageRate) || parameters.slippageRate! < 0 || parameters.slippageRate! >= 1
        || parameters.testStartTime! * 1000 <= Date.parse(experiment.created_at)) {
        return reply.code(400).send({ error: 'Experiment must contain a future registered holdout start and fixed cost assumptions.' });
      }
      const triggerTimeframe = parsed.data.timeframe;
      const minimumForwardBars = Math.ceil(traderConfig.MIN_FORWARD_DAYS * 86_400 / candleSeconds(triggerTimeframe, parameters.testStartTime!));
      if (minimumForwardBars + 2 > parsed.data.historyLimit) {
        return reply.code(422).send({ error: `This timeframe needs at least ${minimumForwardBars + 2} history bars to preserve the configured ${traderConfig.MIN_FORWARD_DAYS}-day holdout and training context.` });
      }
      const timeframes = [...new Set<Timeframe>([triggerTimeframe, '4h', '1d'])];
      const fetched = await Promise.all(timeframes.map((timeframe) => fetchMarketData(parsed.data.symbol, timeframe, parsed.data.historyLimit)));
      if (fetched.some((series) => series.stale)) return reply.code(503).send({ error: 'Research requires a fresh provider response; stale cache data cannot be used.' });
      const now = Date.now();
      const snapshots = fetched.map((series) => ({
        timeframe: series.timeframe,
        provider: series.dataset.provider,
        dataVersion: series.dataset.dataVersion,
        fetchedAt: series.fetchedAt,
        candles: selectClosedCandles(series.candles, series.timeframe, now, traderConfig.CLOSE_GRACE_MS),
      }));
      if (snapshots.some((series) => {
        const latest = series.candles.at(-1);
        if (!latest) return true;
        const closeTime = (latest.time + candleSeconds(series.timeframe, latest.time)) * 1000;
        const maximumAge = candleSeconds(series.timeframe, latest.time) * 1000 * config.marketDataMaxStaleTtlMultiplier;
        return now - closeTime > maximumAge;
      })) return reply.code(503).send({ error: 'Research requires recent closed provider candles for every requested timeframe.' });
      const triggerCandles = snapshots.find((series) => series.timeframe === triggerTimeframe)?.candles ?? [];
      if (triggerCandles[0] && triggerCandles[0].time * 1000 > parameters.testStartTime! * 1000) {
        return reply.code(422).send({ error: 'The registered holdout start is outside the provider history window; register a new future holdout before collecting evidence.' });
      }
      const testStartIndex = triggerCandles.findIndex((candle) => candle.time >= parameters.testStartTime!);
      if (testStartIndex < 0) {
        return reply.code(202).send({ state: 'collecting', testStartTime: parameters.testStartTime, collectedDays: 0, collectedTrades: 0,
          requiredDays: traderConfig.MIN_FORWARD_DAYS, requiredTrades: traderConfig.MIN_FORWARD_TRADES });
      }
      if (testStartIndex < 2) return reply.code(422).send({ error: 'Provider history does not contain enough pre-registration training candles.' });
      const revision = process.env.APP_REVISION ?? 'unknown';
      const artifact = runResearchReplay({
        symbol: parsed.data.symbol,
        triggerTimeframe,
        series: snapshots,
        trainingEndIndex: testStartIndex - 1,
        testStartIndex,
        experimentCreatedAt: experiment.created_at,
        feeRate: parameters.transactionCostRate!,
        slippageRate: parameters.slippageRate!,
        codeRevision: revision,
      });
      if (artifact.metrics.testDays < traderConfig.MIN_FORWARD_DAYS || artifact.metrics.tradeCount < traderConfig.MIN_FORWARD_TRADES) {
        return reply.code(202).send({ state: 'collecting', collectedDays: artifact.metrics.testDays,
          requiredDays: traderConfig.MIN_FORWARD_DAYS, tradeThresholdMet: artifact.metrics.tradeCount >= traderConfig.MIN_FORWARD_TRADES,
          message: 'The fixed holdout is collecting forward candles. No run or holdout claim is persisted until the evidence window and trade minimum are reached.' });
      }
      const runVersion = createHash('sha256').update(JSON.stringify({ experimentId: experiment.id, datasetId: artifact.datasetId, configHash: artifact.configHash, codeRevision: artifact.codeRevision })).digest('hex');
      const service = getSupabaseClient();
      const { data: runId, error: persistError } = await service.rpc('record_research_run', {
        p_experiment_id: experiment.id,
        p_user_id: request.authenticatedUserId,
        p_run_version: runVersion,
        p_seed: traderConfig.RESEARCH_RANDOM_SEED,
        p_configuration: { symbol: parsed.data.symbol, triggerTimeframe, historyLimit: parsed.data.historyLimit, parameters, codeRevision: artifact.codeRevision, pipelineVersion: artifact.pipelineVersion, datasetVersions: artifact.datasetVersions },
        p_metrics: { ...artifact.metrics, validation: artifact.validation, datasetId: artifact.datasetId, configHash: artifact.configHash },
        p_artifacts: artifact,
        p_conclusion: artifact.validation.passed ? 'Server-side chronological replay passed configured evidence checks.' : `Not validated: ${artifact.validation.reasons.join(' ')}`,
      });
      if (persistError || typeof runId !== 'string') throw new Error('Research run persistence failed.');
      return reply.code(201).send({ runId, runVersion, datasetId: artifact.datasetId, metrics: artifact.metrics, validation: artifact.validation });
    } catch (error) {
      request.log.warn({ userId: request.authenticatedUserId, reason: error instanceof Error ? error.message : 'unknown' }, 'Research replay failed');
      return reply.code(503).send({ error: 'Research replay could not be completed or persisted.' });
    }
  });

  app.post<{ Params: { id: string } }>('/api/v1/admin/research/experiments/:id/promote', { preHandler: app.requireAdmin }, async (request, reply) => {
    const experimentId = z.string().uuid().safeParse(request.params.id);
    const parsed = promoteResearchSchema.safeParse(request.body);
    if (!experimentId.success || !parsed.success) return reply.code(400).send({ error: 'Invalid research promotion request.' });
    if (!request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required.' });
    try {
      const { error } = await getSupabaseClient().rpc('approve_research_strategy', {
        p_experiment_id: experimentId.data,
        p_run_id: parsed.data.runId,
        p_reviewer_id: request.authenticatedUserId,
      });
      if (error) {
        request.log.warn({ code: error.code, userId: request.authenticatedUserId }, 'Research strategy promotion rejected');
        return reply.code(error.code === '42501' ? 403 : error.code === '23514' ? 409 : 503)
          .send({ error: error.code === '23514' ? 'Stored research evidence has not passed the server promotion gates.' : 'Research promotion was rejected.' });
      }
      return { promoted: true };
    } catch {
      return reply.code(503).send({ error: 'Research promotion is temporarily unavailable.' });
    }
  });
}
