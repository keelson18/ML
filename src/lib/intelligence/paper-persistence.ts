import { api } from '../../api';
import { DomainError } from '../errors';
import { createCorrelationId, createLogEvent, writeLog } from '../observability';
import type { PaperPosition, PaperTrade } from './paper-execution';

export interface PaperOrderPersistenceInput {
  orderId: string;
  accountId: string;
  decisionId: string;
  assetId: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  status: 'filled' | 'rejected';
  createdAt: string;
  filledAt?: string;
  correlationId?: string;
}

export interface PaperPositionPersistenceInput {
  accountId: string;
  position: PaperPosition;
  correlationId?: string;
}

export interface PaperTradePersistenceInput {
  accountId: string;
  decisionId: string;
  assetId: string;
  trade: PaperTrade;
  correlationId?: string;
}

export async function persistPaperOrder(input: PaperOrderPersistenceInput): Promise<string> {
  const correlationId = input.correlationId ?? createCorrelationId();
  try {
    const result = await api.post<{ id: string }>('/paper/orders', {
      id: input.orderId,
      accountId: input.accountId,
      decisionId: input.decisionId,
      assetId: input.assetId,
      side: input.side,
      quantity: input.quantity,
      price: input.price,
      status: input.status,
      createdAt: input.createdAt,
      filledAt: input.filledAt ?? null,
    });
    writeLog(createLogEvent('info', 'paper.order.persisted', correlationId, { orderId: result.id, accountId: input.accountId }));
    return result.id;
  } catch (e) {
    throw new DomainError('DATA_ERROR', `Paper order persistence failed: ${e instanceof Error ? e.message : 'unknown'}`, { resource: 'paper_order' }, correlationId);
  }
}

export async function persistPaperPosition(input: PaperPositionPersistenceInput): Promise<string> {
  const correlationId = input.correlationId ?? createCorrelationId();
  try {
    const result = await api.post<{ id: string }>('/paper/positions', {
      id: input.position.id,
      accountId: input.accountId,
      assetId: input.position.assetId,
      side: input.position.side === 'buy' ? 'long' : 'short',
      quantity: input.position.quantity,
      averageEntryPrice: input.position.entryPrice,
      stopLoss: input.position.stopLoss ?? null,
      takeProfit: input.position.takeProfit ?? null,
      status: input.position.status,
      openedAt: input.position.openedAt,
      closedAt: input.position.closedAt ?? null,
    });
    writeLog(createLogEvent('info', 'paper.position.persisted', correlationId, { positionId: result.id, accountId: input.accountId }));
    return result.id;
  } catch (e) {
    throw new DomainError('DATA_ERROR', `Paper position persistence failed: ${e instanceof Error ? e.message : 'unknown'}`, { resource: 'paper_position' }, correlationId);
  }
}

export async function persistPaperTrade(input: PaperTradePersistenceInput): Promise<string> {
  const correlationId = input.correlationId ?? createCorrelationId();
  try {
    const result = await api.post<{ id: string }>('/paper/trades', {
      id: input.trade.id,
      accountId: input.accountId,
      decisionId: input.decisionId,
      positionId: input.trade.positionId,
      assetId: input.assetId,
      entryPrice: input.trade.entryPrice,
      exitPrice: input.trade.exitPrice,
      quantity: input.trade.quantity,
      fees: input.trade.fees,
      slippage: input.trade.slippage,
      realizedPnl: input.trade.realizedPnl,
      executionVersion: input.trade.executionVersion,
      openedAt: input.trade.openedAt,
      closedAt: input.trade.closedAt,
    });
    writeLog(createLogEvent('info', 'paper.trade.persisted', correlationId, { tradeId: result.id, accountId: input.accountId }));
    return result.id;
  } catch (e) {
    throw new DomainError('DATA_ERROR', `Paper trade persistence failed: ${e instanceof Error ? e.message : 'unknown'}`, { resource: 'paper_trade' }, correlationId);
  }
}
