import type { TradeDecision } from './decision-engine';
import type { PendingPaperOrder, PlanEvent, TradePlan } from '../trader/types';

export interface PaperJournalEntry {
  id: string; planId?: string; accountId: string; symbol: string; datasetId: string;
  configHash: string; engineVersions: Record<string, string>; metrics: Record<string, number | string | boolean>;
  createdAt: string;
}

export type PaperOrderSide = 'buy' | 'sell';
export type PaperPositionStatus = 'open' | 'closed';

export interface PaperPosition {
  id: string;
  symbol: string;
  assetId: string;
  side: PaperOrderSide;
  quantity: number;
  entryPrice: number;
  entryFee: number;
  stopLoss?: number;
  takeProfit?: number;
  initialRisk?: number;
  initialQuantity?: number;
  targets?: { price: number; fractionOfPosition: number }[];
  targetsTaken?: number[];
  barsHeld?: number;
  maxFavorablePrice?: number;
  planId?: string;
  managementEvents?: Array<{ occurredAt: string; action: string }>;
  status: PaperPositionStatus;
  openedAt: string;
  closedAt?: string;
}

export interface PaperTrade {
  id: string;
  positionId: string;
  symbol: string;
  side: PaperOrderSide;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  fees: number;
  slippage: number;
  realizedPnl: number;
  executionVersion: string;
  openedAt: string;
  closedAt: string;
  exitReason?: string;
}

export interface PaperAccountState {
  accountId: string;
  cash: number;
  positions: PaperPosition[];
  trades: PaperTrade[];
  processedCandles?: Record<string, number>;
  tradePlans?: TradePlan[];
  pendingPaperOrders?: PendingPaperOrder[];
  planEvents?: PlanEvent[];
  tradeJournal?: PaperJournalEntry[];
  dailyReviews?: Array<{ reviewDate: string; metrics: unknown }>;
  shadowSignals?: Array<{ planId: string; candleTime: number; reason: string }>;
}

export interface PaperOrderRequest {
  orderId: string;
  positionId: string;
  decisionId: string;
  assetId: string;
  symbol: string;
  decision: ExecutableTradeDecision;
  riskApproved: boolean;
  portfolioApproved: boolean;
  quantity: number;
  requestedPrice: number;
  feeRate: number;
  slippageRate: number;
  stopLoss?: number;
  takeProfit?: number;
  targets?: { price: number; fractionOfPosition: number }[];
  planId?: string;
  executionVersion: string;
  timestamp?: string;
}

export interface PaperOrderResult {
  accepted: boolean;
  orderId: string;
  status: 'filled' | 'rejected';
  reason?: string;
  fillPrice?: number;
  fee?: number;
  account: PaperAccountState;
}

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function orderSide(decision: TradeDecision['decision']): PaperOrderSide | null {
  if (decision === 'BUY') return 'buy';
  if (decision === 'SELL') return 'sell';
  return null;
}

function rejected(account: PaperAccountState, orderId: string, reason: string): PaperOrderResult {
  return { accepted: false, orderId, status: 'rejected', reason, account };
}

export function simulatePaperOrder(
  account: PaperAccountState,
  request: PaperOrderRequest,
): PaperOrderResult {
  const side = orderSide(request.decision.decision);
  if (!side) return rejected(account, request.orderId, 'Only directional decisions can be considered for a paper order.');
  if (side !== 'buy') return rejected(account, request.orderId, 'Short paper positions are not enabled for this account; SELL only closes or reduces a long.');
  if (!request.riskApproved || !request.portfolioApproved) {
    return rejected(account, request.orderId, 'Paper execution requires approved risk and portfolio gates.');
  }
  if (!validPositive(request.quantity) || !validPositive(request.requestedPrice)) {
    return rejected(account, request.orderId, 'Quantity and requested price must be greater than zero.');
  }
  if (!Number.isFinite(request.feeRate) || request.feeRate < 0 || !Number.isFinite(request.slippageRate) || request.slippageRate < 0) {
    return rejected(account, request.orderId, 'Fee and slippage rates must be non-negative numbers.');
  }
  if (account.positions.some((position) => position.status === 'open' && position.symbol === request.symbol)) {
    return rejected(account, request.orderId, 'Only one open paper position per symbol is supported by this simulator.');
  }

  const fillPrice = side === 'buy'
    ? request.requestedPrice * (1 + request.slippageRate)
    : request.requestedPrice * (1 - request.slippageRate);
  const notional = fillPrice * request.quantity;
  const fee = notional * request.feeRate;
  const requiredCash = notional + fee;
  if (account.cash < requiredCash) {
    return rejected(account, request.orderId, 'Insufficient paper cash for the requested position.');
  }

  const timestamp = request.timestamp ?? new Date().toISOString();
  const position: PaperPosition = {
    id: request.positionId,
    symbol: request.symbol,
    assetId: request.assetId,
    side,
    quantity: request.quantity,
    entryPrice: fillPrice,
    entryFee: fee,
    stopLoss: request.stopLoss,
    takeProfit: request.takeProfit,
    initialRisk: request.stopLoss === undefined ? undefined : Math.abs(fillPrice - request.stopLoss),
    initialQuantity: request.quantity,
    targets: request.targets ?? (request.takeProfit === undefined ? [] : [{ price: request.takeProfit, fractionOfPosition: 1 }]),
    targetsTaken: [],
    barsHeld: 0,
    maxFavorablePrice: fillPrice,
    planId: request.planId,
    status: 'open',
    openedAt: timestamp,
  };

  return {
    accepted: true,
    orderId: request.orderId,
    status: 'filled',
    fillPrice,
    fee,
    account: {
      ...account,
      cash: account.cash - requiredCash,
      positions: [...account.positions, position],
      trades: account.trades,
    },
  };
}

export function closePaperPosition(
  account: PaperAccountState,
  symbol: string,
  exitPrice: number,
  feeRate: number,
  executionVersion: string,
  tradeId: string,
  timestamp = new Date().toISOString(),
): { account: PaperAccountState; trade: PaperTrade } | { account: PaperAccountState; error: string } {
  const position = account.positions.find((candidate) => candidate.status === 'open' && candidate.symbol === symbol);
  if (!position) return { account, error: 'No open paper position exists for this symbol.' };
  return reducePaperPosition(account, position.id, position.quantity, exitPrice, feeRate, executionVersion, tradeId, timestamp, 'stop-or-target');
}

export function reducePaperPosition(
  account: PaperAccountState,
  positionId: string,
  requestedQuantity: number,
  exitPrice: number,
  feeRate: number,
  executionVersion: string,
  tradeId: string,
  timestamp = new Date().toISOString(),
  exitReason = 'manual-reduction',
): { account: PaperAccountState; trade: PaperTrade } | { account: PaperAccountState; error: string } {
  const position = account.positions.find((candidate) => candidate.status === 'open' && candidate.id === positionId);
  if (!position) return { account, error: 'No open paper position exists for this symbol.' };
  if (!validPositive(requestedQuantity) || !validPositive(exitPrice) || !Number.isFinite(feeRate) || feeRate < 0) {
    return { account, error: 'Exit price must be positive and fee rate must be non-negative.' };
  }

  const quantity = Math.min(position.quantity, requestedQuantity);
  const exitNotional = exitPrice * quantity;
  const exitFee = exitNotional * feeRate;
  const allocatedEntryFee = position.quantity > 0 ? position.entryFee * quantity / position.quantity : 0;
  const pricePnl = position.side === 'buy' ? (exitPrice - position.entryPrice) * quantity : (position.entryPrice - exitPrice) * quantity;
  const realizedPnl = pricePnl - allocatedEntryFee - exitFee;
  const releasedCash = position.side === 'buy' ? exitNotional - exitFee : position.entryPrice * quantity + pricePnl - exitFee;
  const remainingQuantity = Math.max(0, position.quantity - quantity);
  const isClosed = remainingQuantity <= Number.EPSILON * Math.max(1, position.quantity);
  const closedPosition: PaperPosition = {
    ...position,
    quantity: isClosed ? 0 : remainingQuantity,
    entryFee: Math.max(0, position.entryFee - allocatedEntryFee),
    status: isClosed ? 'closed' : 'open',
    closedAt: isClosed ? timestamp : undefined,
  };
  const trade: PaperTrade = {
    id: tradeId,
    positionId: position.id,
    symbol: position.symbol,
    side: position.side,
    quantity,
    entryPrice: position.entryPrice,
    exitPrice,
    fees: position.entryFee + exitFee,
    slippage: 0,
    realizedPnl,
    executionVersion,
    openedAt: position.openedAt,
    closedAt: timestamp,
    exitReason,
  };

  return {
    account: {
      ...account,
      cash: account.cash + releasedCash,
      positions: account.positions.map((candidate) => candidate.id === position.id ? closedPosition : candidate),
      trades: [...account.trades, trade],
    },
    trade,
  };
}

/** The execution simulator only needs a directional decision, not its full audit envelope. */
export type ExecutableTradeDecision = Pick<TradeDecision, 'decision'> & Partial<Omit<TradeDecision, 'decision'>>;
