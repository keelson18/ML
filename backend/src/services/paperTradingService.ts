import { closePaperPosition, simulatePaperOrder, type PaperAccountState, type PaperOrderRequest, type PaperTrade } from '../engines/paper-execution';
import type { Candle } from '../../../src/lib/types';
import type { TradeDecision } from '../engines/decision-engine';

const accounts = new Map<string, PaperAccountState>();

function getOrCreateAccount(accountId: string): PaperAccountState {
  const existing = accounts.get(accountId);
  if (existing) return existing;
  const account = { accountId, cash: 100_000, positions: [], trades: [] };
  accounts.set(accountId, account);
  return account;
}

export function getAccount(accountId = 'default') {
  return getOrCreateAccount(accountId);
}

export async function manageOpenPositions(accountId: string, symbol: string, candle: Candle): Promise<PaperTrade[]> {
  let account = getOrCreateAccount(accountId);
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

  accounts.set(accountId, account);
  return closedTrades;
}

export async function executeDecision(input: {
  accountId?: string;
  symbol: string;
  decision: TradeDecision;
  quantity?: number;
}) {
  const accountId = input.accountId ?? 'default';
  const decision = input.decision;
  const requestedPrice = decision.entry ?? 0;
  const request: PaperOrderRequest = {
    orderId: `paper-${Date.now()}`,
    positionId: `position-${Date.now()}`,
    decisionId: `decision-${decision.timestamp}`,
    assetId: input.symbol,
    symbol: input.symbol,
    decision,
    riskApproved: decision.decision === 'BUY' || decision.decision === 'SELL',
    portfolioApproved: decision.decision === 'BUY' || decision.decision === 'SELL',
    quantity: input.quantity ?? 1,
    requestedPrice,
    feeRate: 0.001,
    slippageRate: 0.0005,
    stopLoss: decision.invalidation,
    takeProfit: decision.targets?.[0]?.price,
    executionVersion: 'paper-simulator-1.0.0',
  };
  const result = simulatePaperOrder(getOrCreateAccount(accountId), request);
  accounts.set(accountId, result.account);
  return result;
}