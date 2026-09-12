import type { PaperAccountState, PaperOrderRequest } from '../intelligence/paper-execution';
import { closePaperPosition, simulatePaperOrder } from '../intelligence/paper-execution';
import { persistPaperOrder, persistPaperPosition, persistPaperTrade } from '../intelligence/paper-persistence';

export interface ExecutePaperOrderInput {
  account: PaperAccountState;
  accountId: string;
  request: PaperOrderRequest;
  persist?: boolean;
}

export interface ClosePaperTradeInput {
  account: PaperAccountState;
  accountId: string;
  decisionId: string;
  assetId: string;
  symbol: string;
  exitPrice: number;
  feeRate: number;
  executionVersion: string;
  tradeId: string;
  persist?: boolean;
  timestamp?: string;
}

export async function executePaperOrder(input: ExecutePaperOrderInput) {
  const result = simulatePaperOrder(input.account, input.request);
  if (!result.accepted || input.persist === false) return result;

  await persistPaperOrder({
    orderId: input.request.orderId,
    accountId: input.accountId,
    decisionId: input.request.decisionId,
    assetId: input.request.assetId,
    side: input.request.decision.decision === 'BUY' ? 'buy' : 'sell',
    quantity: input.request.quantity,
    price: result.fillPrice ?? input.request.requestedPrice,
    status: result.status,
    createdAt: input.request.timestamp ?? new Date().toISOString(),
    filledAt: input.request.timestamp ?? new Date().toISOString(),
  });
  const position = result.account.positions[result.account.positions.length - 1];
  if (position) await persistPaperPosition({ accountId: input.accountId, position });
  return result;
}

export async function closePaperTrade(input: ClosePaperTradeInput) {
  const result = closePaperPosition(
    input.account,
    input.symbol,
    input.exitPrice,
    input.feeRate,
    input.executionVersion,
    input.tradeId,
    input.timestamp,
  );
  if (!('trade' in result) || input.persist === false) return result;

  await persistPaperTrade({
    accountId: input.accountId,
    decisionId: input.decisionId,
    assetId: input.assetId,
    trade: result.trade,
  });
  return result;
}