import { closePaperPosition, reducePaperPosition, simulatePaperOrder, type PaperAccountState, type PaperOrderRequest, type PaperOrderResult, type PaperTrade } from '../engines/paper-execution';
import type { Candle } from '../../../src/lib/types';
import { getMarket } from '../../../src/lib/markets';
import type { TradeDecision } from '../engines/decision-engine';
import { atr } from '../../../src/lib/indicators';
import { analyzeMarketStructure } from '../../../src/lib/market-structure';
import { getSupabaseClient, getSupabaseClientWithToken } from '../db';
import { fetchMarketData } from './marketDataService';
import { traderConfig } from '../trader/config';
import { calculatePositionSize, markToMarket } from '../trader/risk';
import { managePaperPosition } from '../trader/manager';

const testAccounts = new Map<string, PaperAccountState>();

interface LoadedAccount {
  account: PaperAccountState;
  version: number;
}

async function loadAccount(accountId: string, accessToken?: string): Promise<LoadedAccount> {
  if (!accountId) throw new Error('An account ID is required.');
  if (process.env.NODE_ENV === 'test') {
    const account = testAccounts.get(accountId);
    if (account) return { account, version: 0 };
    const created = { accountId, cash: traderConfig.TRADER_STARTING_EQUITY, positions: [], trades: [] };
    testAccounts.set(accountId, created);
    return { account: created, version: 0 };
  }
  const supabase = accessToken ? getSupabaseClientWithToken(accessToken) : getSupabaseClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('paper_sim_accounts')
      .select('state,version')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) throw new Error(`Could not load paper account: ${error.message}`);
    if (data?.state) return { account: data.state as PaperAccountState, version: Number(data.version) };

    const account: PaperAccountState = { accountId, cash: traderConfig.TRADER_STARTING_EQUITY, positions: [], trades: [] };
    const { error: insertError } = await supabase.from('paper_sim_accounts').insert({ account_id: accountId, state: account, version: 0 });
    if (!insertError) return { account, version: 0 };
    if (insertError.code !== '23505') throw new Error(`Could not create paper account: ${insertError.message}`);
  }
  throw new Error('Could not initialize paper account after concurrent creation.');
}

export function getAccount(accountId = 'autonomy:default', accessToken?: string) {
  return loadAccount(accountId, accessToken).then(({ account }) => account);
}

async function updateAccount<T>(
  accountId: string,
  update: (account: PaperAccountState) => { account: PaperAccountState; result: T },
  accessToken?: string,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const loaded = await loadAccount(accountId, accessToken);
    const changed = update(loaded.account);
    if (process.env.NODE_ENV === 'test') {
      testAccounts.set(accountId, changed.account);
      return changed.result;
    }
    const supabase = accessToken ? getSupabaseClientWithToken(accessToken) : getSupabaseClient();
    const { data, error } = await supabase
      .from('paper_sim_accounts')
      .update({ state: changed.account, version: loaded.version + 1 })
      .eq('account_id', accountId)
      .eq('version', loaded.version)
      .select('version')
      .maybeSingle();
    if (error) throw new Error(`Could not update paper account: ${error.message}`);
    if (data) return changed.result;
  }
  throw new Error('Paper account changed concurrently too many times. Please retry.');
}

export async function closeOpenPaperPosition(accountId: string, symbol: string, accessToken?: string): Promise<PaperTrade> {
  const candles = (await fetchMarketData(symbol, '1m', 1)).candles;
  const exitPrice = candles.at(-1)?.close;
  if (!exitPrice || !Number.isFinite(exitPrice)) throw new Error('A current market price is unavailable.');
  return updateAccount(accountId, (account) => {
    const result = closePaperPosition(account, symbol, exitPrice, traderConfig.FEE_RATE, 'paper-simulator-1.0.0', `trade-${Date.now()}`);
    if ('error' in result) throw new Error(result.error);
    return { account: result.account, result: result.trade };
  }, accessToken);
}

export async function manageOpenPositions(accountId: string, symbol: string, candle: Candle, history: Candle[] = [candle], thesisInvalidated = false): Promise<PaperTrade[]> {
  return updateAccount(accountId, (startingAccount) => {
    let account = startingAccount;
    const closedTrades: PaperTrade[] = [];
    const openPositions = account.positions.filter((position) => position.status === 'open' && position.symbol === symbol);
    const atrSeries = atr(history, 14);
    const currentAtr = atrSeries.at(-1);
    const swingLow = analyzeMarketStructure(history).lows.at(-1)?.value;
    for (const position of openPositions) {
      const managed = managePaperPosition({
        position,
        candle,
        atr: currentAtr,
        swingLow,
        barIndex: (position.barsHeld ?? 0) + 1,
        invalidationObservedAtBar: thesisInvalidated ? position.barsHeld ?? 0 : undefined,
      });
      account = { ...account, positions: account.positions.map((candidate) => candidate.id === position.id
        ? {
            ...candidate,
            stopLoss: managed.position.stopLoss,
            targetsTaken: managed.position.targetsTaken,
            barsHeld: managed.position.barsHeld,
            maxFavorablePrice: managed.position.maxFavorablePrice,
            managementEvents: [...(position.managementEvents ?? []), ...managed.actions.map((action) => ({
              occurredAt: new Date(candle.time * 1000).toISOString(),
              action,
            }))],
          }
        : candidate) };
      for (const exit of managed.exits) {
        const result = reducePaperPosition(account, position.id, exit.quantity, exit.price, traderConfig.FEE_RATE,
          'paper-simulator-1.0.0', `trade-${Date.now()}-${closedTrades.length}`, new Date(candle.time * 1000).toISOString(), exit.reason);
        if ('trade' in result) {
          account = result.account;
          closedTrades.push(result.trade);
        }
      }
      const current = account.positions.find((candidate) => candidate.id === position.id);
      if (current && current.status === 'open') {
        account = { ...account, positions: account.positions.map((candidate) => candidate.id === position.id
          ? {
              ...managed.position,
              quantity: current.quantity,
              entryFee: current.entryFee,
              managementEvents: [...(position.managementEvents ?? []), ...managed.actions.map((action) => ({
                occurredAt: new Date(candle.time * 1000).toISOString(),
                action,
              }))],
            }
          : candidate) };
      }
    }
    return { account, result: closedTrades };
  });
}

function candleCheckpoint(symbol: string, timeframe: string): string {
  return `${symbol}:${timeframe}`;
}

export async function wasCandleProcessed(accountId: string, symbol: string, timeframe: string, time: number): Promise<boolean> {
  const { account } = await loadAccount(accountId);
  return account.processedCandles?.[candleCheckpoint(symbol, timeframe)] === time;
}

export async function markCandleProcessed(accountId: string, symbol: string, timeframe: string, time: number): Promise<void> {
  await updateAccount(accountId, (account) => {
    const key = candleCheckpoint(symbol, timeframe);
    return {
      account: { ...account, processedCandles: { ...account.processedCandles, [key]: time } },
      result: undefined,
    };
  });
}

export async function executeDecision(input: {
  accountId?: string;
  symbol: string;
  decision: TradeDecision;
  processedCandle?: { timeframe: string; time: number };
    marketDataStale?: boolean;
  accessToken?: string;
}) {
  const accountId = input.accountId ?? 'autonomy:default';
  const decision = input.decision;
  const requestedPrice = decision.entry ?? 0;
  const market = getMarket(input.symbol);
  const quoteCurrency = market?.priceCurrency ?? market?.quoteAsset;
  const orderId = `paper-${Date.now()}`;
  const checkpoint = input.processedCandle ? candleCheckpoint(input.symbol, input.processedCandle.timeframe) : undefined;
  const accountSnapshot = await getAccount(accountId, input.accessToken);
  const markPrices: Record<string, number> = { [input.symbol]: requestedPrice };
  if (process.env.NODE_ENV !== 'test') {
    await Promise.all(accountSnapshot.positions.filter((position) => position.status === 'open').map(async (position) => {
      const candles = (await fetchMarketData(position.symbol, '1m', 2)).candles;
      const mark = candles.at(-1)?.close;
      if (!mark || !Number.isFinite(mark)) throw new Error('A mark-to-market price is unavailable for an open position.');
      markPrices[position.symbol] = mark;
    }));
  } else {
    for (const position of accountSnapshot.positions.filter((candidate) => candidate.status === 'open')) markPrices[position.symbol] = position.entryPrice;
  }

  return updateAccount<PaperOrderResult>(accountId, (account) => {
    if (quoteCurrency !== 'USD') {
      return {
        account,
        result: { accepted: false, orderId, status: 'rejected', reason: 'Paper accounts support USD-quoted markets only.', account },
      };
    }
    if (checkpoint && account.processedCandles?.[checkpoint] === input.processedCandle?.time) {
      return { account, result: simulatePaperOrder(account, {
        orderId: 'duplicate-candle', positionId: 'duplicate-candle', decisionId: `decision-${decision.timestamp}`,
        assetId: input.symbol, symbol: input.symbol, decision, riskApproved: false, portfolioApproved: false,
        quantity: 0, requestedPrice: 0, feeRate: 0, slippageRate: 0, executionVersion: 'paper-simulator-1.0.0',
      }) };
    }
    const snapshot = markToMarket(account, markPrices);
    const stop = decision.invalidation;
    const target = decision.targets?.[0]?.price;
    const sizing = stop === undefined ? { accepted: false, quantity: 0, reason: 'Invalid stop distance.' } : calculatePositionSize({
      equity: snapshot.equity,
      entry: requestedPrice,
      invalidation: stop,
      cash: account.cash,
      grossExposure: snapshot.grossExposure,
      symbolExposure: snapshot.positions.filter((item) => item.position.symbol === input.symbol)
        .reduce((sum, item) => sum + item.currentPrice * item.position.quantity, 0),
    });
    const quantity = sizing.quantity;
    const riskDistance = stop === undefined ? 0 : Math.abs(requestedPrice - stop);
    const rewardDistance = target === undefined ? 0 : Math.abs(target - requestedPrice);
    const directionValid = decision.decision === 'BUY'
      ? stop !== undefined && target !== undefined && stop < requestedPrice && target > requestedPrice
      : decision.decision === 'SELL'
        ? stop !== undefined && target !== undefined && stop > requestedPrice && target < requestedPrice
        : false;
    const riskApproved = !input.marketDataStale
      && (decision.decision === 'BUY' || decision.decision === 'SELL')
      && requestedPrice > 0
      && stop !== undefined && stop > 0
      && target !== undefined && target > 0
      && directionValid && riskDistance > 0 && rewardDistance / riskDistance >= traderConfig.MIN_RR
      && sizing.accepted
      && quantity > 0
      && snapshot.equity > 0;
    const request: PaperOrderRequest = {
      orderId,
      positionId: `position-${Date.now()}`,
      decisionId: `decision-${decision.timestamp}`,
      assetId: input.symbol,
      symbol: input.symbol,
      decision,
      riskApproved,
      portfolioApproved: riskApproved,
      quantity,
      requestedPrice,
      feeRate: traderConfig.FEE_RATE,
      slippageRate: traderConfig.SLIPPAGE_RATE,
      stopLoss: decision.invalidation,
      takeProfit: decision.targets?.[0]?.price,
      executionVersion: 'paper-simulator-1.0.0',
    };
    const result = simulatePaperOrder(account, request);
    const nextAccount = checkpoint
      ? { ...result.account, processedCandles: { ...result.account.processedCandles, [checkpoint]: input.processedCandle!.time } }
      : result.account;
    return { account: nextAccount, result: { ...result, account: nextAccount } };
  }, input.accessToken);
}
