import { supabase } from './supabase';
import { readJsonSafe } from '../../shared/http';
import type { Candle, MarketDataProvider, MLPrediction, Timeframe } from './types';

export async function authenticatedBackendRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Authentication required.');
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${session.access_token}`);
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new Error('The trading backend is unreachable. Run `npm run dev` to start the API and web app, then retry.');
  }
  const { raw, payload } = await readJsonSafe<T & { error?: string; reason?: string }>(response);
  if (!response.ok) {
    if (payload?.error) throw new Error(payload.error === 'Market coverage is blocked.' && payload.reason
      ? `${payload.error} ${payload.reason.slice(0, 300)}` : payload.error);
    if (response.status !== 401 && (!raw || [502, 503, 504].includes(response.status))) {
      throw new Error('The trading backend is unreachable. Check that it is running, then retry.');
    }
    throw new Error(`Backend request failed (${response.status}).`);
  }
  if (payload === null) throw new Error('The backend returned an empty or invalid response.');
  return payload;
}

export interface BackendDecision {
  decision: 'BUY' | 'SELL' | 'HOLD' | 'WATCH' | 'NO_TRADE';
  marketBias?: 'buy' | 'sell' | 'neutral';
  stages?: {
    setupDetection: { status: 'not_evaluated'; reason: string };
    entryConfirmation: { status: 'not_confirmed'; reason: string };
    riskApproval: { status: 'approved' | 'rejected'; reasons: string[] };
    finalDecision: { action: 'NO_TRADE'; reason: string };
  };
  confidence: number;
  entry?: number;
  invalidation?: number;
  targets?: { price: number }[];
  strategy: string;
  supportingEvidence: { source: string; explanation: string; score?: number }[];
  contradictions: string[];
  reasoning: string;
  explanation: string;
  timestamp: string;
  researchContext?: {
    status: 'used' | 'not_applicable' | 'unavailable';
    authoritative: false;
    note: string;
    items: Array<{ id: string; version: string; title: string; content: string; tags: string[]; confidence: number }>;
  };
  journalStatus?: 'recorded' | 'failed';
}

export interface AutonomyStatus {
  state: 'OFFLINE' | 'IDLE' | 'MONITORING' | 'DECIDING' | 'PAUSED' | 'ERROR';
  lastRunAt?: string;
  processedDecisions: number;
  executedOrders: number;
  skippedRuns: number;
  consecutiveFailures: number;
  lastError?: string;
}

export async function fetchAutonomyStatus(): Promise<AutonomyStatus> {
  return authenticatedBackendRequest<AutonomyStatus>('/api/v1/autonomy/status');
}

export async function requestBackendDecision(symbol: string, timeframe: Timeframe): Promise<BackendDecision | null> {
  const payload = await authenticatedBackendRequest<{
    decision?: { result?: BackendDecision };
    researchContext?: BackendDecision['researchContext'];
    journalStatus?: BackendDecision['journalStatus'];
  }>('/api/v1/decisions/analyze', {
    method: 'POST',
    body: JSON.stringify({ symbol, timeframe }),
  });
  const decision = payload.decision?.result;
  return decision ? {
    ...decision,
    ...(payload.researchContext ? { researchContext: payload.researchContext } : {}),
    ...(payload.journalStatus ? { journalStatus: payload.journalStatus } : {}),
  } : null;
}

export async function requestMLPrediction(pair: string, timeframe: Timeframe): Promise<MLPrediction> {
  return authenticatedBackendRequest<MLPrediction>('/api/v1/ml/predict', {
    method: 'POST',
    body: JSON.stringify({ pair, timeframe }),
  });
}

export interface PaperPosition {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  entryPrice: number;
  requestedEntryPrice?: number;
  confidenceAtEntry?: number;
  engineVersions?: Record<string, string>;
  entryFee: number;
  stopLoss?: number;
  takeProfit?: number;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt?: string;
}

export interface PaperTrade {
  id: string;
  orderId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  maeR: number | null;
  mfeR: number | null;
  openedAt: string;
  closedAt: string;
  positionId?: string;
  fees?: number;
  slippage?: number;
  entrySlippage?: number;
  exitSlippage?: number;
  exitReason?: string;
  executionVersion?: string;
  engineVersions?: Record<string, string>;
}

export interface ChartPaperTrade extends PaperTrade {
  positionId: string;
  orderId?: string;
  side: 'buy' | 'sell';
  quantity: number;
  fees: number;
  slippage: number;
  exitPrice: number;
  entryPrice: number;
  requestedEntryPrice?: number;
  confidenceAtEntry?: number;
  realizedPnl: number;
  exitReason?: string;
  executionVersion: string;
}

export interface PaperAccount {
  accountId: string;
  cash: number;
  positions: PaperPosition[];
  trades: PaperTrade[];
}

export interface MarketDataResponse {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  fetchedAt: number;
  stale: boolean;
}

export async function downloadPersonalDataExport(): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Authentication required.');
  const response = await fetch('/api/v1/me/export', { headers: { Authorization: `Bearer ${session.access_token}` } });
  const { raw, payload } = await readJsonSafe<{ error?: string }>(response);
  if (!response.ok) {
    if (payload?.error) throw new Error(payload.error);
    if (!raw || [502, 503, 504].includes(response.status)) throw new Error('Personal data export is unavailable. Please retry later.');
    throw new Error(`Export request failed (${response.status}).`);
  }
  if (!raw) throw new Error('The export returned an empty response.');
  return new Blob([raw], { type: 'application/json' });
}

export interface EventBlackout {
  id: string;
  title: string;
  impact: 'low' | 'medium' | 'high';
  asset_classes: string[];
  starts_at: string;
  ends_at: string;
  active?: boolean;
  created_at?: string;
  cancelled_at?: string | null;
}

export interface NewsItem {
  id: string;
  provider: string;
  title: string;
  summary: string;
  symbols: string[];
  published_at: string | null;
  ingested_at: string;
}

export interface CalendarEvent extends EventBlackout {
  source: 'manual' | 'provider';
}

export async function fetchNewsItems(symbol?: string): Promise<{ items: NewsItem[]; availability: 'unverified' | 'available' | 'unavailable'; asOf: string }> {
  const query = new URLSearchParams();
  if (symbol) query.set('symbol', symbol);
  return authenticatedBackendRequest(`/api/v1/news/items?${query}`);
}

export async function fetchCalendarEvents(): Promise<{ events: CalendarEvent[]; availability: 'unverified' | 'available' | 'unavailable'; asOf: string }> {
  return authenticatedBackendRequest('/api/v1/calendar/events');
}

export async function fetchNewsProviderStatus(): Promise<{ news: Array<{ provider: string; availability: 'unverified' | 'available' | 'unavailable'; checkedAt: string | null }>; calendar: Array<{ provider: string; availability: 'unverified' | 'available' | 'unavailable'; checkedAt: string | null }> }> {
  return authenticatedBackendRequest('/api/v1/news/status');
}

export async function fetchActiveEventBlackouts(): Promise<EventBlackout[]> {
  const result = await authenticatedBackendRequest<{ events: EventBlackout[] }>('/api/v1/events/active');
  return result.events;
}

export async function fetchAdminEventBlackouts(): Promise<EventBlackout[]> {
  const result = await authenticatedBackendRequest<{ events: EventBlackout[] }>('/api/v1/admin/event-blackouts');
  return result.events;
}

export interface AdminHealthTile {
  status: 'ok' | 'degraded' | 'down' | 'unverified';
  reason: string;
  checkedAt: string;
}

export interface AdminOverview {
  environment: 'test' | 'production';
  generatedAt: string;
  refreshIntervalMs: number;
  schema: AdminHealthTile & { missing: string[] };
  ledger: {
    hashChain: AdminHealthTile & { checkedAccounts: number; brokenAccounts: number; checkedRows: number };
    accounting: AdminHealthTile & { checkedAccounts: number; brokenAccounts: number };
  };
  scheduler: AdminHealthTile & { state: 'stopped' | 'starting' | 'running' | 'paused' | 'degraded' | 'blocked' | 'failed'; enabled: boolean; entriesEnabled: boolean; running: boolean; cycleInProgress: boolean; lastCycleAt: string | null; activeLeaseCount: number; leaseContentionCount: number; leaseClaimFailureCount: number; leaseRenewalFailureCount: number; lastBoundaries: Record<string, number>; nextScheduledAt: string | null; lastError: string | null };
  providers: Array<AdminHealthTile & { provider: 'Massive' | 'Twelve Data'; quota: number; windowMs: number; usedInWindow: number; queued: number; backoffUntil: string | null; last429At: string | null }>;
  feeds: Array<AdminHealthTile & { feed: 'Coinbase' | 'Twelve Data'; subscribedSymbols: number; connectedClients: number; droppedUpdates: number; reconnects: number; gaps: number; lastTickAgeMs: number | null }>;
  freshness: Array<{ symbol: string; timeframe: string; status: AdminHealthTile['status']; reason: string; checkedAt: string; newestClosedCandleAt: string | null; ageMs: number | null }>;
  autopilot: AdminHealthTile & { enrolledAccounts: number; pausedAccounts: number; pausedReasons: string[]; symbolsInUse: number; symbolCap: number };
  auditDenials24h: AdminHealthTile & { count: number };
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return authenticatedBackendRequest<AdminOverview>('/api/v1/admin/overview');
}

export async function requestFullLedgerReverification(reason: string): Promise<void> {
  await authenticatedBackendRequest('/api/v1/admin/overview/ledger/reverify', { method: 'POST', body: JSON.stringify({ reason }) });
}

export async function createEventBlackout(input: { title: string; impact: EventBlackout['impact']; assetClasses: string[]; startsAt: string; endsAt: string }): Promise<string> {
  const result = await authenticatedBackendRequest<{ id: string }>('/api/v1/admin/event-blackouts', { method: 'POST', body: JSON.stringify(input) });
  return result.id;
}

export async function cancelEventBlackout(id: string): Promise<void> {
  await authenticatedBackendRequest(`/api/v1/admin/event-blackouts/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

export interface MarketAvailabilityRecord {
  symbol: string;
  provider: MarketDataProvider | 'unsupported';
  sourceInstrument: string;
  status: 'verified' | 'partially_verified' | 'unverified' | 'unavailable' | 'stale' | 'error';
  checkedAt: number | null;
  reason?: string;
  timeframes?: Array<{
    timeframe: Timeframe;
    status: 'verified' | 'partially_verified' | 'unverified' | 'unavailable' | 'stale' | 'error';
    testType?: 'provider_probe' | 'chart_request';
    environment?: 'test' | 'production';
    checkedAt?: number;
    candleCount?: number;
    closedCandleCount?: number;
    latestClosedCandleAt?: string | null;
    ageMs?: number | null;
    errorCategory?: string;
    reason?: string;
  }>;
}

export async function fetchMarketAvailability(admin = false): Promise<MarketAvailabilityRecord[]> {
  const path = admin ? '/api/v1/admin/markets/availability' : '/api/v1/market/availability';
  const payload = await authenticatedBackendRequest<{ markets: MarketAvailabilityRecord[] }>(path);
  return payload.markets;
}

export interface ProviderBudgetStatus {
  requestsPerWindow: number;
  windowMs: number;
  reservedForPriority: number;
  usedInWindow: number;
  queued: number;
  backoffUntil: string | null;
  last429At: string | null;
  usedToday: number | null;
  dailyRequests: number | null;
  reservedForPriorityDaily: number;
  standardRemaining: number;
  standardDailyRemaining: number | null;
}

export async function fetchMarketBudgets(): Promise<{ massive: ProviderBudgetStatus; twelveData: ProviderBudgetStatus }> {
  return authenticatedBackendRequest('/api/v1/admin/markets/budget');
}

export interface MarketCoverageRecord {
  symbol: string;
  tier: 'A' | 'B' | 'C' | 'blocked';
  label: 'Autopilot' | 'Scanning' | 'On-demand' | 'Blocked';
  reason: string;
  lastScannedAt: number | null;
}

export async function fetchMarketCoverage(): Promise<MarketCoverageRecord[]> {
  const payload = await authenticatedBackendRequest<{ instruments: MarketCoverageRecord[] }>('/api/v1/market/coverage');
  return payload.instruments;
}

export async function fetchAdminMarketCoverage(): Promise<{ instruments: MarketCoverageRecord[]; budgets: { massive: ProviderBudgetStatus; twelveData: ProviderBudgetStatus } }> {
  return authenticatedBackendRequest('/api/v1/admin/markets/coverage');
}

export async function updateAdminMarketCoverage(input: { symbol: string; tier: MarketCoverageRecord['tier']; reason: string; providerMappingVerified: boolean; providerAvailable: boolean; sessionCalendarVerified: boolean }): Promise<void> {
  await authenticatedBackendRequest('/api/v1/admin/markets/coverage', { method: 'PUT', body: JSON.stringify(input) });
}

export async function probeMarkets(symbol: string): Promise<MarketAvailabilityRecord[]> {
  const payload = await authenticatedBackendRequest<{ markets: MarketAvailabilityRecord[] }>('/api/v1/admin/markets/probe', { method: 'POST', body: JSON.stringify({ symbol }) });
  return payload.markets;
}

export async function fetchCanonicalMarketData(symbol: string, timeframe: Timeframe, limit = 1000): Promise<MarketDataResponse> {
  const query = new URLSearchParams({ timeframe, limit: String(limit) });
  return authenticatedBackendRequest<MarketDataResponse>(`/api/v1/market/candles/${encodeURIComponent(symbol)}?${query}`);
}

export async function fetchPaperAccount(): Promise<PaperAccount> {
  return authenticatedBackendRequest<PaperAccount>('/api/v1/paper/positions');
}

export async function closePaperPosition(symbol: string): Promise<PaperTrade> {
  const { trade } = await authenticatedBackendRequest<{ trade: PaperTrade }>('/api/v1/paper/close', {
    method: 'POST',
    body: JSON.stringify({ symbol }),
  });
  return trade;
}

export interface TraderPlan {
  id: string; symbol: string; side: 'long' | 'short'; setupType: string; htfBias: string;
  zone: { low: number; high: number }; trigger: { kind: string; level?: number };
  invalidation: number; targets: Array<{ price: number; fractionOfPosition: number }>;
  minRR: number; expiresAtBar: number; thesis: string; falsification: string;
  grade: string; status: string; createdAt: string; updatedAt: string; datasetId: string; lastReason?: string; activeEventIds?: string[];
}

export interface TraderOverview {
  cash: number; startingEquity: number; equity: number; unrealizedPnl: number; drawdownPct: number;
  openRiskCash: number; heatPct: number; dailyPnl: number; weeklyPnl: number;
  grossExposurePct: number;
  riskLimits: { dailyLossStopPct: number; maxDrawdownPct: number; maxGrossExposurePct: number; maxPortfolioHeatPct: number; riskPerTradePct: number; minRewardRisk: number };
  dailyLossLimitPct: number; weeklyLossLimitPct: number; staleSymbols: string[];
  ledgerStatus: 'verified' | 'broken' | 'unavailable';
  reconciliation: { ok: boolean; actualEquity: number; expectedEquity: number; difference: number };
  positions: Array<PaperPosition & { currentPrice: number; unrealizedPnl: number; rMultiple: number }>;
  recentTrades: PaperTrade[];
}

export async function fetchTraderPlans(): Promise<TraderPlan[]> {
  const result = await authenticatedBackendRequest<{ plans: TraderPlan[] }>('/api/v1/trader/plans');
  return result.plans;
}

export async function fetchTraderOverview(): Promise<TraderOverview> {
  return authenticatedBackendRequest<TraderOverview>('/api/v1/trader/overview');
}

export async function refreshTraderPlans(): Promise<{ plans: TraderPlan[]; watchlist: Array<{ bias: string; regime: string; keyLevels: number[]; qualityScore: number; reason: string }>; count: number }> {
  return authenticatedBackendRequest('/api/v1/trader/plans/refresh', { method: 'POST' });
}

export interface ResearchExperimentRegistration {
  name: string;
  hypothesis: string;
  datasetId: string;
  parameters: { setupType: string; testStartTime: number; transactionCostRate: number; slippageRate: number };
}

export async function registerResearchExperiment(input: ResearchExperimentRegistration): Promise<{ id: string; status: string }> {
  return authenticatedBackendRequest('/api/v1/research/experiments', { method: 'POST', body: JSON.stringify(input) });
}

export async function runResearchExperiment(id: string, symbol: string): Promise<Record<string, unknown>> {
  return authenticatedBackendRequest(`/api/v1/research/experiments/${encodeURIComponent(id)}/run`, {
    method: 'POST', body: JSON.stringify({ symbol, timeframe: '15m', historyLimit: 1000 }),
  });
}

export interface TraderAutopilotSettings {
  enabled: boolean;
  symbols: string[];
  pausedReason: string | null;
  lastRunAt: string | null;
  availableSymbols?: string[];
  maxSymbolsPerUser?: number;
}

export interface BackendHealth {
  schema: { ok: boolean; missing: string[]; failure?: 'configuration' | 'access' | 'schema' | 'connection' };
}
export async function fetchBackendHealth(): Promise<BackendHealth> {
  return authenticatedBackendRequest<BackendHealth>('/api/v1/me/health');
}

export interface TraderAutopilotRunResult {
  queued: true;
}

export async function fetchTraderAutopilot(): Promise<TraderAutopilotSettings> {
  return authenticatedBackendRequest('/api/v1/trader/autopilot');
}

export async function updateTraderAutopilot(settings: Pick<TraderAutopilotSettings, 'enabled' | 'symbols'>): Promise<TraderAutopilotSettings> {
  return authenticatedBackendRequest('/api/v1/trader/autopilot', { method: 'PUT', body: JSON.stringify(settings) });
}

export async function runTraderAutopilotNow(): Promise<TraderAutopilotRunResult> {
  return authenticatedBackendRequest('/api/v1/trader/autopilot/run', { method: 'POST' });
}

export async function fetchTraderHistory<T>(kind: 'journal' | 'reviews' | 'events' | 'orders'): Promise<T[]> {
  const key = { journal: 'entries', reviews: 'reviews', events: 'events', orders: 'orders' }[kind];
  const result = await authenticatedBackendRequest<Record<string, T[]>>(`/api/v1/trader/${kind}?limit=20`);
  return result[key] ?? [];
}
