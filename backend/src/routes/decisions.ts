import { analyze } from '../services/decisionService';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AutonomousPipeline } from '../autonomy/pipeline';
import { fetchMarketData, MarketDataProviderError } from '../services/marketDataService';
import { getMarketAvailability } from '../services/marketAvailability';
import { getMarket } from '../../../src/lib/markets';
import { TIMEFRAMES, type Timeframe } from '../../../src/lib/types';
import { config } from '../config.js';
import { BoundedMap, WindowLimiter } from '../utils/limits';
import { selectClosedCandles } from '../trader/candle-math';
import { hasFreshClosedCandleData } from '../trader/market-data-quality';
import { traderConfig } from '../trader/config';
import { getSupabaseClientWithToken } from '../db';
import { appendAiLearningJournalEvent } from '../services/aiLearningJournal';

const VALID_TIMEFRAMES = new Set<string>(TIMEFRAMES.map((t) => t.value));
const SYMBOL_PATTERN = /^[A-Z0-9._-]{1,20}$/;
const ANALYSIS_CANDLES = 1000;
const MIN_ANALYSIS_CANDLES = 60;
const MAX_CACHED_DECISIONS = 200;
const MAX_RESEARCH_FINDINGS = 8;

interface ResearchContext {
  status: 'used' | 'not_applicable' | 'unavailable';
  authoritative: false;
  note: string;
  items: Array<{ id: string; version: string; title: string; content: string; tags: string[]; confidence: number }>;
}

async function getApprovedResearchContext(accessToken: string, symbol: string, timeframe: Timeframe): Promise<ResearchContext> {
  try {
    const { data, error } = await getSupabaseClientWithToken(accessToken).from('knowledge_nodes')
      .select('id,node_type,title,content,tags,confidence,version')
      .eq('status', 'approved').order('updated_at', { ascending: false }).limit(100);
    if (error) throw new Error('Approved knowledge query failed.');
    const market = getMarket(symbol);
    const applies = new Set([symbol.toLowerCase(), timeframe.toLowerCase(), market?.marketType.toLowerCase() ?? '', 'global', 'all_markets']);
    const items = (data ?? []).filter((row) => {
      const tags = Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [];
      return tags.some((tag) => applies.has(tag.trim().toLowerCase()));
    }).slice(0, MAX_RESEARCH_FINDINGS).map((row) => ({
      id: String(row.id),
      version: String(row.version),
      title: String(row.title).slice(0, 200),
      content: String(row.content).slice(0, 2000),
      tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 30) : [],
      confidence: Number.isFinite(Number(row.confidence)) ? Math.min(1, Math.max(0, Number(row.confidence))) : 0,
    }));
    return {
      status: items.length ? 'used' : 'not_applicable',
      authoritative: false,
      note: items.length
        ? 'Approved knowledge is shown as supplementary context; it does not change the decision, confidence, or risk gates.'
        : 'No approved knowledge tagged for this instrument, timeframe, or market category was found.',
      items,
    };
  } catch {
    return {
      status: 'unavailable',
      authoritative: false,
      note: 'Approved knowledge could not be loaded. Current market analysis continues without it.',
      items: [],
    };
  }
}

interface DecisionRequest {
  symbol?: unknown;
  timeframe?: unknown;
  candles?: unknown;
}

function validateDecisionRequest(body: DecisionRequest | undefined): { symbol: string; timeframe: Timeframe } | string {
  if (!body || typeof body !== 'object') return 'Request body is required.';
  if (body.candles !== undefined) return 'Candles are not accepted; send symbol and timeframe only.';
  if (typeof body.symbol !== 'string' || !SYMBOL_PATTERN.test(body.symbol)) return 'Invalid symbol.';
  if (typeof body.timeframe !== 'string' || !VALID_TIMEFRAMES.has(body.timeframe)) return 'Invalid timeframe.';
  const market = getMarket(body.symbol);
  if (!market) return 'Unknown market symbol.';
  if (market.marketType !== 'crypto' && market.marketType !== 'commodity') return 'This market type is outside the supported crypto and commodities scope.';
  const availability = getMarketAvailability().find((market) => market.symbol === body.symbol);
  if (!availability) return 'Market is not configured for verification.';
  if (availability.status === 'unavailable') return 'Market is unavailable from the configured provider.';
  return { symbol: body.symbol, timeframe: body.timeframe as Timeframe };
}

export async function decisionRoutes(app: FastifyInstance, pipeline: AutonomousPipeline) {
  const analysisRequestLimiter = new WindowLimiter(config.analyzeRateLimitMax, config.rateLimitWindowMs);
  const decisionCache = new BoundedMap<unknown>(MAX_CACHED_DECISIONS);

  const handler = async (request: FastifyRequest<{ Body: DecisionRequest }>, reply: FastifyReply) => {
    if (!request.authenticatedUserId) return reply.code(401).send({ error: 'Authentication required' });
    if (!request.accessToken) return reply.code(401).send({ error: 'Authentication required' });
    const userId = request.authenticatedUserId;
    const parsed = validateDecisionRequest(request.body);
    if (typeof parsed === 'string') {
      request.log.warn({ userId, reason: parsed }, 'rejected invalid analyze input');
      return reply.code(400).send({ error: parsed });
    }
    const { symbol, timeframe } = parsed;

    let marketData: Awaited<ReturnType<typeof fetchMarketData>>;
    let candles;
    try {
      marketData = await fetchMarketData(symbol, timeframe, ANALYSIS_CANDLES);
      candles = selectClosedCandles(marketData.candles, timeframe, Date.now(), traderConfig.CLOSE_GRACE_MS);
    } catch (error) {
      if (error instanceof MarketDataProviderError && error.status === 429) {
        if (error.retryAfter) reply.header('Retry-After', error.retryAfter);
        return reply.code(429).send({ error: 'Market data provider rate limit exceeded.' });
      }
      request.log.error({ userId, symbol, timeframe, err: error instanceof Error ? error.message : 'unknown' }, 'decision candle fetch failed');
      return reply.code(502).send({ error: 'Market data unavailable.' });
    }
    const latestClosed = candles.at(-1);
    if (marketData.stale || !latestClosed || !hasFreshClosedCandleData(marketData.candles, timeframe)) {
      return reply.code(503).send({ error: 'Fresh market data is unavailable; analysis is blocked.' });
    }
    if (candles.length < MIN_ANALYSIS_CANDLES) return reply.code(400).send({ error: 'Not enough closed candles for analysis.' });

    const lastClosedTime = candles[candles.length - 1].time;
    const cacheKey = `${userId}:${symbol}:${timeframe}:${lastClosedTime}`;
    const cached = decisionCache.get(cacheKey);
    if (cached) return { ...(cached as object), cached: true };

    if (!analysisRequestLimiter.consume(userId)) {
      request.log.warn({ userId }, 'decision analysis request rate limit exceeded');
      return reply.code(429).send({ error: 'Analysis is busy. Try again shortly.' });
    }
    try {
      const result = await analyze({
        symbol,
        timeframe,
        candles,
        candleClosure: 'verified_closed',
        dataState: 'ready',
        dataSource: {
          provider: marketData.dataset.provider,
          fetchedAt: marketData.fetchedAt,
          datasetId: marketData.dataset.id,
          marketType: marketData.instrument.marketType,
        },
      }, userId);
      const researchContext = await getApprovedResearchContext(request.accessToken, symbol, timeframe);
      if (researchContext.status === 'unavailable') {
        request.log.warn({ userId, symbol, timeframe }, 'approved research context unavailable; analysis continued without it');
      }
      let journalStatus: 'recorded' | 'failed' = 'recorded';
      try {
        await appendAiLearningJournalEvent({
          eventKey: `trade-analysis:${request.id}`,
          userId,
          eventType: 'trade_analysis_completed',
          title: `Trade analysis completed for ${symbol}`,
          detail: researchContext.status === 'used'
            ? 'Market analysis completed; approved knowledge was attached separately as non-authoritative supplementary context.'
            : `Market analysis completed with research context status: ${researchContext.status}.`,
          symbol,
          timeframe,
          sourceService: 'decision-api',
          correlationId: request.id,
          relatedRecords: { includedKnowledgeIds: researchContext.items.map((item) => item.id) },
          evidence: {
            provider: marketData.dataset.provider,
            datasetId: marketData.dataset.id,
            fetchedAt: marketData.fetchedAt,
            closedCandles: candles.length,
            researchStatus: researchContext.status,
            researchIsNonAuthoritative: true,
            riskGatesUnchanged: true,
          },
        });
      } catch {
        journalStatus = 'failed';
        request.log.error({ userId, symbol, timeframe, correlationId: request.id }, 'trade analysis journal persistence failed');
      }
      const response = { ...result, researchContext, journalStatus, cached: false };
      decisionCache.set(cacheKey, response);
      return response;
    } catch (error) {
      request.log.error({ err: error, userId }, 'decision analysis failed');
      return reply.code(500).send({ error: 'Analysis failed.' });
    }
  };
  const analyzeOptions = { onRequest: app.requireAuth };
  app.post<{ Body: DecisionRequest }>('/api/v1/decisions/analyze', analyzeOptions, handler);
  app.post<{ Body: DecisionRequest }>('/api/v1/analyze', analyzeOptions, handler);

  app.get('/api/v1/autonomy/status', { preHandler: app.requireAuth }, async () => pipeline.getSnapshot());
}
