import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { getSupabaseClient, getSupabaseClientWithToken } from '../db';
import type { Timeframe } from '../../../src/lib/types';
import { getMarket } from '../../../src/lib/markets';
import { fetchMarketData } from '../services/marketDataService';
import { selectClosedCandles } from '../trader/candle-math';
import { runResearchReplay } from '../trader/research-run';
import { traderConfig } from '../trader/config';
import { SETUP_TYPES } from '../trader/constants';
import { config } from '../config';
import { candleSeconds } from '../trader/candle-math';
import { createHash } from 'node:crypto';
import { stitchResearchCollection, researchCollectionProgress, type StoredResearchCandle } from '../trader/research-collection';

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
    testStartTime: z.number().int().positive().refine((value) => value * 1000 > Date.now() + config.researchCollectionStartLeadMs,
      'The untouched test interval must leave enough time to initialize its provider data collection.'),
    transactionCostRate: z.number().finite().nonnegative().max(1),
    slippageRate: z.number().finite().nonnegative().max(1),
  }).strict(),
}).strict();

const runResearchSchema = z.object({
  symbol: z.string().trim().min(3).max(30),
  timeframe: z.literal('15m'),
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

async function loadResearchCollection(experimentId: string, timeframes: Timeframe[]): Promise<StoredResearchCandle[]> {
  const client = getSupabaseClient();
  const rows: StoredResearchCandle[] = [];
  for (const timeframe of timeframes) {
    let offset = 0;
    while (true) {
      const { data, error } = await client.from('research_collection_candles')
        .select('timeframe,candle_time,candle,provider,source_data_version,source_fetched_at')
        .eq('experiment_id', experimentId).eq('timeframe', timeframe)
        .order('candle_time', { ascending: true }).range(offset, offset + 999);
      if (error) throw new Error('Stored research collection could not be read.');
      const page = (data ?? []) as StoredResearchCandle[];
      rows.push(...page);
      if (page.length < 1000) break;
      offset += page.length;
    }
  }
  return rows;
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
    if (!market?.isActive || (market.priceCurrency ?? market.quoteAsset) !== 'USD') return reply.code(400).send({ error: 'Research supports only active USD markets.' });
    if (market.marketType !== 'crypto') return reply.code(422).send({ error: 'Forward research collection requires a verified market-session calendar; this workflow currently supports continuous 24/7 crypto data only.' });
    try {
      const ownerClient = getSupabaseClientWithToken(request.accessToken);
      const { data: experiment, error: experimentError } = await ownerClient.from('research_experiments')
        .select('id,user_id,name,hypothesis,status,created_at,parameters')
        .eq('id', experimentId.data).eq('user_id', request.authenticatedUserId).maybeSingle();
      if (experimentError || !experiment) return reply.code(404).send({ error: 'Research experiment was not found.' });
      if (!['draft', 'completed'].includes(experiment.status)) return reply.code(409).send({ error: 'Only a draft experiment or an identical persisted run can be evaluated.' });
      if (experiment.status === 'completed') {
        const { data: run, error: runError } = await ownerClient.from('research_runs').select('id,run_version')
          .eq('experiment_id', experiment.id).order('completed_at', { ascending: false }).limit(1).maybeSingle();
        if (runError || !run) return reply.code(409).send({ error: 'The completed experiment has no readable immutable run.' });
        const { data: result, error: resultError } = await ownerClient.from('research_results')
          .select('metrics,artifacts').eq('run_id', run.id).maybeSingle();
        if (resultError || !result) return reply.code(409).send({ error: 'The completed experiment result is unavailable.' });
        const artifact = result.artifacts as { datasetId?: string; validation?: unknown };
        return reply.code(200).send({ runId: run.id, runVersion: run.run_version, datasetId: artifact.datasetId,
          metrics: result.metrics, validation: artifact.validation, persisted: true });
      }
      const parameters = experiment.parameters as { testStartTime?: number; transactionCostRate?: number; slippageRate?: number };
      if (!Number.isInteger(parameters.testStartTime)
        || !Number.isFinite(parameters.transactionCostRate) || parameters.transactionCostRate! < 0 || parameters.transactionCostRate! >= 1
        || !Number.isFinite(parameters.slippageRate) || parameters.slippageRate! < 0 || parameters.slippageRate! >= 1
        || parameters.testStartTime! * 1000 <= Date.parse(experiment.created_at)) {
        return reply.code(400).send({ error: 'Experiment must contain a future registered holdout start and fixed cost assumptions.' });
      }
      const triggerTimeframe = parsed.data.timeframe;
      const timeframes = [...new Set<Timeframe>([triggerTimeframe, traderConfig.SETUP_TIMEFRAME, '4h', '1d'])];
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
      const service = getSupabaseClient();
      const { data: collectionResult, error: collectionError } = await service.rpc('append_research_collection_batch', {
        p_experiment_id: experiment.id,
        p_user_id: request.authenticatedUserId,
        p_symbol: parsed.data.symbol,
        p_continuous: true,
        p_series: snapshots.map(({ timeframe, provider, dataVersion, fetchedAt, candles }) => ({
          timeframe, provider, dataVersion, fetchedAt, candles,
        })),
      });
      if (collectionError || !collectionResult) {
        const invalidCollection = ['22023', '55000', '54000'].includes(collectionError?.code ?? '');
        request.log.warn({ code: collectionError?.code, userId: request.authenticatedUserId }, 'Research collection append rejected');
        return reply.code(invalidCollection ? 409 : 503).send({ error: invalidCollection
          ? 'Research collection hit a data gap, late bootstrap, provider candle revision, identity change, or storage bound. Start a new experiment; collected evidence was not changed.'
          : 'Research candle collection persistence is unavailable.' });
      }
      const minimumForwardBars = Math.ceil(traderConfig.MIN_FORWARD_DAYS * 86_400 / candleSeconds(triggerTimeframe, parameters.testStartTime!));
      const collection = collectionResult as { newCandles?: number; counts?: Record<string, { bars?: number; lastTime?: number | null }> };
      const triggerStats = collection.counts?.[triggerTimeframe];
      const firstHoldoutBar = Math.ceil(parameters.testStartTime! / candleSeconds(triggerTimeframe, parameters.testStartTime!))
        * candleSeconds(triggerTimeframe, parameters.testStartTime!);
      const latestStoredBar = triggerStats?.lastTime ?? null;
      const collectedBars = latestStoredBar !== null && latestStoredBar >= firstHoldoutBar
        ? Math.floor((latestStoredBar - firstHoldoutBar) / candleSeconds(triggerTimeframe, firstHoldoutBar)) + 1 : 0;
      const collectedDays = latestStoredBar !== null && latestStoredBar >= firstHoldoutBar
        ? (latestStoredBar + candleSeconds(triggerTimeframe, latestStoredBar) - firstHoldoutBar) / 86_400 : 0;
      if (collectedDays < traderConfig.MIN_FORWARD_DAYS || collectedBars < minimumForwardBars) {
        return reply.code(202).send({ state: 'collecting', testStartTime: parameters.testStartTime,
          initialized: true, newCandles: collection.newCandles ?? 0,
          collectedDays, collectedBars,
          requiredDays: traderConfig.MIN_FORWARD_DAYS, requiredBars: minimumForwardBars,
          requiredTrades: traderConfig.MIN_FORWARD_TRADES });
      }
      const storedRows = await loadResearchCollection(experiment.id, timeframes);
      const collectedSeries = stitchResearchCollection({ rows: storedRows, symbol: parsed.data.symbol, expectedTimeframes: timeframes });
      const triggerCandles = collectedSeries.find((series) => series.timeframe === triggerTimeframe)?.candles ?? [];
      const progress = researchCollectionProgress({ triggerCandles, triggerTimeframe, registeredStartTime: parameters.testStartTime! });
      if (progress.testStartIndex < 2) return reply.code(422).send({ error: 'Provider collection does not contain enough pre-registration training candles.' });
      const testStartIndex = progress.testStartIndex;
      const revision = process.env.APP_REVISION ?? 'unknown';
      const artifact = runResearchReplay({
        symbol: parsed.data.symbol,
        triggerTimeframe,
        series: collectedSeries,
        trainingEndIndex: testStartIndex - 1,
        testStartIndex,
        experimentCreatedAt: experiment.created_at,
        feeRate: parameters.transactionCostRate!,
        slippageRate: parameters.slippageRate!,
        codeRevision: revision,
      });
      if (artifact.metrics.testDays < traderConfig.MIN_FORWARD_DAYS || artifact.metrics.tradeCount < traderConfig.MIN_FORWARD_TRADES) {
        return reply.code(202).send({ state: 'collecting', initialized: true, collectedDays: artifact.metrics.testDays,
          collectedBars: progress.collectedBars,
          requiredDays: traderConfig.MIN_FORWARD_DAYS, tradeThresholdMet: artifact.metrics.tradeCount >= traderConfig.MIN_FORWARD_TRADES,
          message: 'The fixed holdout is collecting forward candles. No run or holdout claim is persisted until the evidence window and trade minimum are reached.' });
      }
      const runVersion = createHash('sha256').update(JSON.stringify({ experimentId: experiment.id, datasetId: artifact.datasetId, configHash: artifact.configHash, codeRevision: artifact.codeRevision })).digest('hex');
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
