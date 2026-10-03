import { closePaperPosition, simulatePaperOrder, type PaperAccountState, type PaperOrderRequest, type PaperTrade } from '../engines/paper-execution';
import type { Candle } from '../../../src/lib/types';
import type { TradeDecision } from '../engines/decision-engine';
import { getSupabaseClient, getSupabaseClientWithToken } from '../db';
import { fetchKlines } from '../../../src/lib/binance';

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
    const created = { accountId, cash: 100_000, positions: [], trades: [] };
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

    const account: PaperAccountState = { accountId, cash: 100_000, positions: [], trades: [] };
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
  const candles = await fetchKlines(symbol, '1m', 1);
  const exitPrice = candles.at(-1)?.close;
  if (!exitPrice || !Number.isFinite(exitPrice)) throw new Error('A current market price is unavailable.');
  return updateAccount(accountId, (account) => {
    const result = closePaperPosition(account, symbol, exitPrice, 0.001, 'paper-simulator-1.0.0', `trade-${Date.now()}`);
    if ('error' in result) throw new Error(result.error);
    return { account: result.account, result: result.trade };
  }, accessToken);
}

export async function manageOpenPositions(accountId: string, symbol: string, candle: Candle): Promise<PaperTrade[]> {
  return updateAccount(accountId, (startingAccount) => {
    let account = startingAccount;
    const closedTrades: PaperTrade[] = [];
    const openPositions = account.positions.filter((position) => position.status === 'open' && position.symbol === symbol);
    for (const position of openPositions) {
      const stopHit = position.stopLoss !== undefined && (position.side === 'buy'
        ? candle.low <= position.stopLoss
        : candle.high >= position.stopLoss);
      const targetHit = !stopHit && position.takeProfit !== undefined && (position.side === 'buy'
        ? candle.high >= position.takeProfit
        : candle.low <= position.takeProfit);
      const exitPrice = stopHit ? position.stopLoss : targetHit ? position.takeProfit : undefined;
      if (exitPrice === undefined) continue;

      const result = closePaperPosition(account, symbol, exitPrice, 0.001, 'paper-simulator-1.0.0', `trade-${Date.now()}`, new Date(candle.time * 1000).toISOString());
      if ('trade' in result) {
        account = result.account;
        closedTrades.push(result.trade);
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
  quantity?: number;
  processedCandle?: { timeframe: string; time: number };
  accessToken?: string;
}) {
  const accountId = input.accountId ?? 'autonomy:default';
  const decision = input.decision;
  const requestedPrice = decision.entry ?? 0;
  const checkpoint = input.processedCandle ? candleCheckpoint(input.symbol, input.processedCandle.timeframe) : undefined;

  return updateAccount(accountId, (account) => {
    if (checkpoint && account.processedCandles?.[checkpoint] === input.processedCandle?.time) {
      return { account, result: simulatePaperOrder(account, {
        orderId: 'duplicate-candle', positionId: 'duplicate-candle', decisionId: `decision-${decision.timestamp}`,
        assetId: input.symbol, symbol: input.symbol, decision, riskApproved: false, portfolioApproved: false,
        quantity: 0, requestedPrice: 0, feeRate: 0, slippageRate: 0, executionVersion: 'paper-simulator-1.0.0',
      }) };
    }
    const currentExposure = account.positions
      .filter((position) => position.status === 'open')
      .reduce((sum, position) => sum + position.quantity * position.entryPrice, 0);
    const equity = Math.max(0, account.cash + currentExposure);
    const quantity = input.quantity ?? (requestedPrice > 0 ? equity * 0.05 / requestedPrice : 0);
    const stop = decision.invalidation;
    const target = decision.targets?.[0]?.price;
    const riskDistance = stop === undefined ? 0 : Math.abs(requestedPrice - stop);
    const rewardDistance = target === undefined ? 0 : Math.abs(target - requestedPrice);
    const directionValid = decision.decision === 'BUY'
      ? stop !== undefined && target !== undefined && stop < requestedPrice && target > requestedPrice
      : decision.decision === 'SELL'
        ? stop !== undefined && target !== undefined && stop > requestedPrice && target < requestedPrice
        : false;
    const riskApproved = (decision.decision === 'BUY' || decision.decision === 'SELL')
      && requestedPrice > 0
      && stop !== undefined && stop > 0
      && target !== undefined && target > 0
      && directionValid && riskDistance > 0 && rewardDistance / riskDistance >= 1.5
      && quantity > 0
      && account.cash >= requestedPrice * quantity
      && equity > 0
      && (currentExposure + requestedPrice * quantity) / equity <= 0.5;
    const request: PaperOrderRequest = {
      orderId: `paper-${Date.now()}`,
      positionId: `position-${Date.now()}`,
      decisionId: `decision-${decision.timestamp}`,
      assetId: input.symbol,
      symbol: input.symbol,
      decision,
      riskApproved,
      portfolioApproved: riskApproved,
      quantity,
      requestedPrice,
      feeRate: 0.001,
      slippageRate: 0.0005,
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
