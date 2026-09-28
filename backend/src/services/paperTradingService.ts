import { closePaperPosition, simulatePaperOrder, type PaperAccountState, type PaperOrderRequest, type PaperTrade } from '../engines/paper-execution';
import type { Candle } from '../../../src/lib/types';
import type { TradeDecision } from '../engines/decision-engine';
import { getSupabaseClient } from '../db';

async function getOrCreateAccount(accountId: string): Promise<PaperAccountState> {
  if (!accountId) throw new Error('An account ID is required.');
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('paper_sim_accounts')
    .select('state')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) throw new Error(`Could not load paper account: ${error.message}`);
  if (data?.state) {
    return data.state as PaperAccountState;
  }
  const account = { accountId, cash: 100_000, positions: [], trades: [] };
  const { error: insertError } = await supabase.from('paper_sim_accounts').insert({ account_id: accountId, state: account });
  if (insertError && insertError.code !== '23505') throw new Error(`Could not create paper account: ${insertError.message}`);
  if (insertError?.code === '23505') {
    const { data: raced, error: reloadError } = await supabase.from('paper_sim_accounts').select('state').eq('account_id', accountId).single();
    if (reloadError || !raced?.state) throw new Error(`Could not reload paper account: ${reloadError?.message ?? 'account missing'}`);
    const restored = raced.state as PaperAccountState;
    return restored;
  }
  return account;
}

export function getAccount(accountId = 'autonomy:default') {
  return getOrCreateAccount(accountId);
}

async function saveAccount(account: PaperAccountState): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('paper_sim_accounts')
    .upsert({ account_id: account.accountId, state: account }, { onConflict: 'account_id' });
  if (error) throw new Error(`Could not save paper account: ${error.message}`);
}

export async function manageOpenPositions(accountId: string, symbol: string, candle: Candle): Promise<PaperTrade[]> {
  let account = await getOrCreateAccount(accountId);
  const openPositions = account.positions.filter((position) => position.status === 'open' && position.symbol === symbol);
  const closedTrades: PaperTrade[] = [];

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

  await saveAccount(account);
  return closedTrades;
}

export async function executeDecision(input: {
  accountId?: string;
  symbol: string;
  decision: TradeDecision;
  quantity?: number;
}) {
  const accountId = input.accountId ?? 'autonomy:default';
  const account = await getOrCreateAccount(accountId);
  const decision = input.decision;
  const requestedPrice = decision.entry ?? 0;
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
  await saveAccount(result.account);
  return result;
}
