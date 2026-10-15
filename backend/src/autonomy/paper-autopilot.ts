import type { Candle, Timeframe } from '../../../src/lib/types';
import { getMarket } from '../../../src/lib/markets';
import { getSupabaseClient } from '../db';
import { config } from '../config';
import { fetchMarketData, type MarketDataSeries } from '../services/marketDataService';
import { advanceStoredTradePlans, getAccount, listStoredTradePlans, manageOpenPositions, storeTradePlan } from '../services/paperTradingService';
import { getMarketAvailability } from '../services/marketAvailability';
import { createTradePlan } from '../trader/planner';
import { traderConfig } from '../trader/config';
import { candleSeconds, latestClosedCandleTime, selectClosedCandles } from '../trader/candle-math';
import { nextScheduledRunAt } from './candle-clock';

export function providerRequestSpacingMs(requestsPerWindow = config.massiveRequestsPerWindow, windowMs = config.massiveBudgetWindowMs, traderReservedRequests = config.massiveTraderReservedRequests): number {
  const traderAllocation = Math.max(1, Math.min(requestsPerWindow, traderReservedRequests));
  return Math.ceil(windowMs / traderAllocation);
}

export const AUTOPILOT_TIMEFRAMES = [...new Set([
  ...traderConfig.HTF_TIMEFRAMES,
  traderConfig.SETUP_TIMEFRAME,
  ...traderConfig.TRIGGER_TIMEFRAMES,
  traderConfig.MGMT_TIMEFRAME,
])] as Timeframe[];

export interface PaperAutopilotConfig {
  account_id: string;
  enabled: boolean;
  symbols: string[];
  paused_reason: string | null;
  last_run_at: string | null;
}

export interface SeriesRequest { symbol: string; timeframe: Timeframe }

export function uniqueSeriesRequests(requests: SeriesRequest[]): SeriesRequest[] {
  const unique = new Map<string, SeriesRequest>();
  for (const request of requests) unique.set(`${request.symbol}:${request.timeframe}`, request);
  return [...unique.values()];
}

export function prioritizeSeriesRequests(requests: SeriesRequest[], management: Timeframe, triggers: readonly Timeframe[]): SeriesRequest[] {
  const priority = (timeframe: Timeframe) => timeframe === management ? 0 : triggers.includes(timeframe) ? 1 : 2;
  return [...requests].sort((left, right) => priority(left.timeframe) - priority(right.timeframe));
}

export function replayCandlesAfter(candles: Candle[], checkpoint: number | undefined, maximum: number): Candle[] {
  return candles.filter((candle) => checkpoint === undefined || candle.time > checkpoint).slice(0, maximum);
}

export async function replaySequentialCandles(
  candles: Candle[], checkpoint: number | undefined, maximum: number,
  process: (candle: Candle, history: Candle[]) => Promise<void>,
): Promise<number> {
  const pending = replayCandlesAfter(candles, checkpoint, maximum);
  for (const candle of pending) {
    const index = candles.findIndex((candidate) => candidate.time === candle.time);
    await process(candle, candles.slice(0, index + 1));
  }
  return pending.length;
}

export function entryCandleIsFresh(candle: Candle, timeframe: Timeframe, now: number): boolean {
  const durationMs = candleSeconds(timeframe, candle.time) * 1000;
  return now - (candle.time * 1000 + durationMs) <= traderConfig.MAX_ENTRY_AGE_BARS * durationMs;
}

export function accountEntriesAllowed(input: { autonomousEnabled: boolean; accountEnabled: boolean; pausedReason: string | null; dataFailure: string | undefined }): boolean {
  return input.autonomousEnabled && input.accountEnabled && !input.pausedReason && !input.dataFailure;
}

export function isAutopilotSymbol(symbol: string): boolean {
  const market = getMarket(symbol);
  const availability = getMarketAvailability().find((item) => item.symbol === symbol)?.status;
  return Boolean(market?.isActive && market.provider === 'massive' && market.marketType === 'crypto' && market.priceCurrency === 'USD' && availability === 'available');
}

export function verifiedAutopilotSymbols(symbols: readonly string[]): string[] {
  return [...new Set(symbols)].filter(isAutopilotSymbol);
}

export class PaperAutopilotScheduler {
  private timer?: ReturnType<typeof setTimeout>;
  private active = false;
  private running?: Promise<void>;
  private readonly lastBoundaries = new Map<Timeframe, number>();
  private readonly accountQueues = new Map<string, Promise<void>>();
  private readonly manualRuns = new Set<string>();
  private lastCycleAt: string | null = null;
  private nextScheduledAt: string | null = null;
  private lastError: string | null = null;

  diagnostics() {
    return {
      running: this.active,
      cycleInProgress: Boolean(this.running),
      lastCycleAt: this.lastCycleAt,
      lastBoundaries: Object.fromEntries(this.lastBoundaries),
      nextScheduledAt: this.nextScheduledAt,
      lastError: this.lastError,
    };
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    void this.runScheduledCycle();
  }

  stop(): void {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.nextScheduledAt = null;
  }

  async queueAccountRun(accountId: string): Promise<{ queued: true }> {
    if (!config.autonomousTradingEnabled) throw new Error('AUTONOMOUS_TRADING is disabled; paper autopilot runs are blocked.');
    const { data, error } = await getSupabaseClient().from('paper_autopilot').select('*').eq('account_id', accountId).maybeSingle();
    if (error) throw new Error('Autopilot settings are unavailable.');
    if (!data?.enabled) throw new Error('Enable paper autopilot before running it.');
    if (data.paused_reason) throw new Error(`Paper autopilot is paused: ${data.paused_reason}`);
    if (this.manualRuns.has(accountId)) return { queued: true };
    this.manualRuns.add(accountId);
    void this.runAccounts([data as PaperAutopilotConfig], new Set(AUTOPILOT_TIMEFRAMES), Date.now())
      .catch(async (error: unknown) => {
        const reason = error instanceof Error ? error.message : 'Paper autopilot run failed.';
        try { await getSupabaseClient().rpc('pause_paper_autopilot', { p_account_id: accountId, p_reason: reason }); }
        catch { /* Keep the original run failure if the safety pause cannot be persisted. */ }
      })
      .finally(() => this.manualRuns.delete(accountId));
    return { queued: true };
  }

  private scheduleNext(): void {
    if (!this.active) return;
    const nextRun = Math.min(...AUTOPILOT_TIMEFRAMES.map((timeframe) => nextScheduledRunAt(Date.now(), timeframe, traderConfig.CLOSE_GRACE_MS)));
    this.nextScheduledAt = new Date(nextRun).toISOString();
    this.timer = setTimeout(() => { void this.runScheduledCycle(); }, Math.max(0, nextRun - Date.now()));
  }

  private async runScheduledCycle(): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      try {
        const now = Date.now();
        const due = new Set<Timeframe>();
        const boundaries = new Map<Timeframe, number>();
        for (const timeframe of AUTOPILOT_TIMEFRAMES) {
          const boundary = latestClosedCandleTime(now, timeframe, traderConfig.CLOSE_GRACE_MS);
          boundaries.set(timeframe, boundary);
          if (this.lastBoundaries.get(timeframe) !== boundary) due.add(timeframe);
        }
        if (due.size > 0) {
          const { data, error } = await getSupabaseClient().rpc('list_enabled_paper_autopilots');
          if (error) throw new Error('Could not list opted-in paper autopilot accounts.');
          const rows = (data ?? []) as PaperAutopilotConfig[];
          const result = await this.runAccounts(rows, due, now);
          for (const timeframe of due) this.lastBoundaries.set(timeframe, boundaries.get(timeframe)!);
          if (result.pausedReason) this.lastError = 'One or more autopilot accounts were paused after a safety failure.';
          else this.lastError = null;
        } else {
          this.lastError = null;
        }
      } catch (error) {
        this.lastError = error instanceof Error ? 'Scheduler cycle failed; inspect server logs.' : 'Scheduler cycle failed.';
        console.error('[paper-autopilot] scheduler cycle failed:', error instanceof Error ? error.message : 'unknown error');
      } finally {
        this.lastCycleAt = new Date().toISOString();
        this.running = undefined;
        this.scheduleNext();
      }
    })();
    return this.running;
  }

  private async runAccounts(rows: PaperAutopilotConfig[], due: Set<Timeframe>, now: number): Promise<{ pausedReason?: string; processed: number }> {
    if (rows.length === 0) return { processed: 0 };
    const snapshots = new Map<string, Awaited<ReturnType<typeof getAccount>>>();
    let pausedReason: string | undefined;
    for (const row of rows) {
      try { snapshots.set(row.account_id, await getAccount(row.account_id)); }
      catch (error) {
        const reason = error instanceof Error ? error.message : 'Paper account schema is unavailable.';
        pausedReason ??= reason;
        try { await getSupabaseClient().rpc('pause_paper_autopilot', { p_account_id: row.account_id, p_reason: reason }); }
        catch { /* Keep the original account-load failure if the safety pause cannot be persisted. */ }
      }
    }
    const availableRows = rows.filter((row) => snapshots.has(row.account_id));
    if (availableRows.length === 0) return { pausedReason, processed: 0 };

    const requestsBySymbol = new Map<string, Set<Timeframe>>();
    const requestsByAccount = new Map<string, Map<string, Set<Timeframe>>>();
    const managedSymbolsByAccount = new Map<string, Set<string>>();
    for (const row of availableRows) {
      const account = snapshots.get(row.account_id)!;
      const activePlans = (account.tradePlans ?? []).filter((plan) => ['WATCHING', 'ARMED', 'PENDING_ORDER'].includes(plan.status));
      const openSymbols = new Set(account.positions.filter((position) => position.status === 'open').map((position) => position.symbol));
      const entrySymbols = verifiedAutopilotSymbols(row.symbols);
      const managedSymbols = new Set([...entrySymbols, ...openSymbols]);
      const accountRequests = new Map<string, Set<Timeframe>>();
      managedSymbolsByAccount.set(row.account_id, managedSymbols);
      for (const symbol of managedSymbols) {
        const required = new Set<Timeframe>();
        const combined = requestsBySymbol.get(symbol) ?? new Set<Timeframe>();
        const isConfigured = entrySymbols.includes(symbol);
        if (due.has(traderConfig.MGMT_TIMEFRAME as Timeframe) && openSymbols.has(symbol)) {
          required.add(traderConfig.MGMT_TIMEFRAME as Timeframe);
          required.add('4h');
        }
        if (isConfigured && row.enabled) {
          for (const timeframe of traderConfig.TRIGGER_TIMEFRAMES as Timeframe[]) {
            if (due.has(timeframe as Timeframe) && activePlans.some((plan) => plan.symbol === symbol && (plan.triggerTimeframe ?? traderConfig.TRIGGER_TIMEFRAMES[0]) === timeframe)) required.add(timeframe as Timeframe);
          }
          if ((traderConfig.HTF_TIMEFRAMES as Timeframe[]).some((timeframe) => due.has(timeframe))) {
            for (const timeframe of [...(traderConfig.HTF_TIMEFRAMES as Timeframe[]), traderConfig.SETUP_TIMEFRAME as Timeframe, ...(traderConfig.TRIGGER_TIMEFRAMES as Timeframe[])]) required.add(timeframe as Timeframe);
          }
          if (due.has(traderConfig.SETUP_TIMEFRAME as Timeframe)) {
            for (const timeframe of [...(traderConfig.HTF_TIMEFRAMES as Timeframe[]), traderConfig.SETUP_TIMEFRAME as Timeframe, ...(traderConfig.TRIGGER_TIMEFRAMES as Timeframe[])]) required.add(timeframe as Timeframe);
          }
        }
        for (const timeframe of required) combined.add(timeframe);
        accountRequests.set(symbol, required);
        requestsBySymbol.set(symbol, combined);
      }
      requestsByAccount.set(row.account_id, accountRequests);
    }

    const seriesByKey = new Map<string, MarketDataSeries>();
    const failuresByKey = new Map<string, string>();
    const seriesRequests = prioritizeSeriesRequests(uniqueSeriesRequests([...requestsBySymbol].flatMap(([symbol, timeframes]) =>
      [...timeframes].map((timeframe) => ({ symbol, timeframe })))),
    traderConfig.MGMT_TIMEFRAME as Timeframe, traderConfig.TRIGGER_TIMEFRAMES as Timeframe[]);
    let previousRequestWasFresh = false;
    for (const { symbol, timeframe } of seriesRequests) {
      if (previousRequestWasFresh) await new Promise((resolve) => setTimeout(resolve, providerRequestSpacingMs()));
      const key = `${symbol}:${timeframe}`;
      const startedAt = Date.now();
      try {
        const series = await fetchMarketData(symbol, timeframe, 1000, { priority: true });
        previousRequestWasFresh = series.fetchedAt >= startedAt;
        if (series.stale) throw new Error(`Stale ${timeframe} market data for ${symbol}.`);
        seriesByKey.set(key, series);
      } catch (error) {
        previousRequestWasFresh = true;
        failuresByKey.set(key, error instanceof Error ? error.message : `Market data unavailable for ${symbol} ${timeframe}.`);
      }
    }

    let processed = 0;
    for (const row of availableRows) {
      const account = snapshots.get(row.account_id)!;
      await this.withAccountLock(row.account_id, async () => {
        const managedSymbols = managedSymbolsByAccount.get(row.account_id)!;
        const accountRequests = requestsByAccount.get(row.account_id)!;
        const missing = [...accountRequests.entries()].flatMap(([symbol, timeframes]) =>
          [...timeframes].map((timeframe) => failuresByKey.get(`${symbol}:${timeframe}`)).filter((reason): reason is string => Boolean(reason)));
        const accountEntryPause = missing[0];
        const entriesAllowed = accountEntriesAllowed({ autonomousEnabled: config.autonomousTradingEnabled, accountEnabled: row.enabled, pausedReason: row.paused_reason, dataFailure: accountEntryPause });
        const entryDataRequested = [...accountRequests.values()].some((timeframes) =>
          [...timeframes].some((timeframe) => timeframe !== traderConfig.MGMT_TIMEFRAME));
        if (accountEntryPause) {
          pausedReason = accountEntryPause;
          await getSupabaseClient().rpc('pause_paper_autopilot', { p_account_id: row.account_id, p_reason: accountEntryPause });
        } else if (row.paused_reason && entryDataRequested) {
          await getSupabaseClient().rpc('resume_paper_autopilot', { p_account_id: row.account_id });
        }
        for (const symbol of managedSymbols) {
          const managerTimeframe = traderConfig.MGMT_TIMEFRAME as Timeframe;
          if (due.has(managerTimeframe) && account.positions.some((position) => position.status === 'open' && position.symbol === symbol)) {
            const managerSeries = seriesByKey.get(`${symbol}:${managerTimeframe}`);
            const invalidationSeries = seriesByKey.get(`${symbol}:4h`);
            if (managerSeries) processed += await this.replayManagement(row.account_id, symbol, managerTimeframe, managerSeries, invalidationSeries, now);
          }
        }
        for (const symbol of verifiedAutopilotSymbols(row.symbols)) {
          const plannerDue = (traderConfig.HTF_TIMEFRAMES as Timeframe[]).some((timeframe) => due.has(timeframe))
            || due.has(traderConfig.SETUP_TIMEFRAME as Timeframe);
          if (plannerDue) {
            const daily = seriesByKey.get(`${symbol}:1d`);
            const fourHour = seriesByKey.get(`${symbol}:4h`);
            const setupSeries = seriesByKey.get(`${symbol}:${traderConfig.SETUP_TIMEFRAME}`);
            if (daily && fourHour && setupSeries && entriesAllowed) {
              const existingPlans = await listStoredTradePlans(row.account_id);
              const trigger = traderConfig.TRIGGER_TIMEFRAMES[0] as Timeframe;
              if (!existingPlans.some((plan) => plan.symbol === symbol && (plan.triggerTimeframe ?? traderConfig.TRIGGER_TIMEFRAMES[0]) === trigger && ['WATCHING', 'ARMED', 'PENDING_ORDER'].includes(plan.status))) {
                const triggerSeries = seriesByKey.get(`${symbol}:${trigger}`);
                if (triggerSeries) {
                const dailyCandles = selectClosedCandles(daily.candles, '1d', now, traderConfig.CLOSE_GRACE_MS);
                const fourHourCandles = selectClosedCandles(fourHour.candles, '4h', now, traderConfig.CLOSE_GRACE_MS);
                const setupCandles = selectClosedCandles(setupSeries.candles, traderConfig.SETUP_TIMEFRAME, now, traderConfig.CLOSE_GRACE_MS);
                const triggerCandles = selectClosedCandles(triggerSeries.candles, trigger, now, traderConfig.CLOSE_GRACE_MS);
                const result = createTradePlan({ accountId: row.account_id, symbol, htfCandles: { '1d': dailyCandles, '4h': fourHourCandles }, setupCandles, triggerCandles, triggerTimeframe: trigger, datasetId: `${daily.dataset.id}:${fourHour.dataset.id}:${setupSeries.dataset.id}:${triggerSeries.dataset.id}` });
                if (result.plan) await storeTradePlan(row.account_id, result.plan);
                }
              }
            }
          }
          for (const timeframe of traderConfig.TRIGGER_TIMEFRAMES as Timeframe[]) {
            if (!due.has(timeframe)) continue;
            const series = seriesByKey.get(`${symbol}:${timeframe}`);
            if (!series || !entriesAllowed) continue;
            processed += await this.replayEntries(row.account_id, symbol, timeframe, series, now);
          }
        }
        await getSupabaseClient().rpc('touch_paper_autopilot_run', { p_account_id: row.account_id });
      }).catch(async (error: unknown) => {
        const reason = error instanceof Error ? error.message : 'Paper autopilot account processing failed.';
        pausedReason ??= reason;
        try { await getSupabaseClient().rpc('pause_paper_autopilot', { p_account_id: row.account_id, p_reason: reason }); }
        catch { /* Keep the original processing failure if the safety pause cannot be persisted. */ }
      });
    }
    return { pausedReason, processed };
  }

  private async replayManagement(accountId: string, symbol: string, timeframe: Timeframe, series: MarketDataSeries, invalidationSeries: MarketDataSeries | undefined, now: number): Promise<number> {
    const candles = selectClosedCandles(series.candles, timeframe, now, traderConfig.CLOSE_GRACE_MS);
    const invalidationCandles = invalidationSeries
      ? selectClosedCandles(invalidationSeries.candles, '4h', now, traderConfig.CLOSE_GRACE_MS)
      : [];
    const account = await getAccount(accountId);
    const checkpoint = account.processedCandles?.[`${symbol}:manager:${timeframe}`];
    return replaySequentialCandles(candles, checkpoint, traderConfig.SCHEDULER_MAX_CATCH_UP_BARS,
      (candle, history) => manageOpenPositions(accountId, symbol, candle, history, invalidationCandles, timeframe).then(() => undefined));
  }

  private async replayEntries(accountId: string, symbol: string, timeframe: Timeframe, series: MarketDataSeries, now: number): Promise<number> {
    const candles = selectClosedCandles(series.candles, timeframe, now, traderConfig.CLOSE_GRACE_MS);
    const account = await getAccount(accountId);
    const checkpoint = account.processedCandles?.[`${symbol}:executor:${timeframe}`] ?? account.processedCandles?.[`${symbol}:${timeframe}`];
    return replaySequentialCandles(candles, checkpoint, traderConfig.SCHEDULER_MAX_CATCH_UP_BARS,
      async (candle, history) => {
        const allowEntries = entryCandleIsFresh(candle, timeframe, now);
        await advanceStoredTradePlans({ accountId, symbol, timeframe, candle, candles: history, entriesAllowed: allowEntries });
      });
  }

  private async withAccountLock<T>(accountId: string, run: () => Promise<T>): Promise<T> {
    const previous = this.accountQueues.get(accountId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.accountQueues.set(accountId, queued);
    await previous;
    try { return await run(); }
    finally {
      release();
      if (this.accountQueues.get(accountId) === queued) this.accountQueues.delete(accountId);
    }
  }
}

export const paperAutopilotScheduler = new PaperAutopilotScheduler();
