import type { TradeDecision } from './decision-engine';

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
}

export interface PaperAccountState {
  accountId: string;
  cash: number;
  positions: PaperPosition[];
  trades: PaperTrade[];
}

export interface PaperOrderRequest {
  orderId: string;
  positionId: string;
  decisionId: string;
  assetId: string;
  symbol: string;
  decision: TradeDecision;
  riskApproved: boolean;
  portfolioApproved: boolean;
  quantity: number;
  requestedPrice: number;
  feeRate: number;
  slippageRate: number;
  stopLoss?: number;
  takeProfit?: number;
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
  if (!side) return rejected(account, request.orderId, 'Only BUY and SELL decisions can create paper orders.');
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
  if (!validPositive(exitPrice) || !Number.isFinite(feeRate) || feeRate < 0) {
    return { account, error: 'Exit price must be positive and fee rate must be non-negative.' };
  }

  const exitNotional = exitPrice * position.quantity;
  const exitFee = exitNotional * feeRate;
  const pricePnl = position.side === 'buy'
    ? (exitPrice - position.entryPrice) * position.quantity
    : (position.entryPrice - exitPrice) * position.quantity;
  const realizedPnl = pricePnl - position.entryFee - exitFee;
  const releasedCash = position.side === 'buy'
    ? exitNotional - exitFee
    : position.entryPrice * position.quantity + pricePnl - exitFee;
  const closedPosition: PaperPosition = {
    ...position,
    status: 'closed',
    closedAt: timestamp,
  };
  const trade: PaperTrade = {
    id: tradeId,
    positionId: position.id,
    symbol: position.symbol,
    side: position.side,
    quantity: position.quantity,
    entryPrice: position.entryPrice,
    exitPrice,
    fees: position.entryFee + exitFee,
    slippage: 0,
    realizedPnl,
    executionVersion,
    openedAt: position.openedAt,
    closedAt: timestamp,
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