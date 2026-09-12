import { supabase } from '../supabase';
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
  const { data, error } = await supabase
    .from('paper_orders')
    .insert({
      id: input.orderId,
      account_id: input.accountId,
      decision_id: input.decisionId,
      asset_id: input.assetId,
      side: input.side,
      order_type: 'market',
      quantity: input.quantity,
      limit_price: null,
      stop_price: null,
      status: input.status,
      created_at: input.createdAt,
      filled_at: input.filledAt ?? null,
    })
    .select('id')
    .single();

  if (error) throw new DomainError('DATA_ERROR', `Paper order persistence failed: ${error.message}`, { resource: 'paper_order' }, correlationId);
  const row = data as { id: string } | null;
  if (!row?.id) throw new DomainError('DATA_ERROR', 'Paper order persistence failed: database returned no order ID.', { resource: 'paper_order' }, correlationId);
  writeLog(createLogEvent('info', 'paper.order.persisted', correlationId, { orderId: row.id, accountId: input.accountId }));
  return row.id;
}

export async function persistPaperPosition(input: PaperPositionPersistenceInput): Promise<string> {
  const correlationId = input.correlationId ?? createCorrelationId();
  const { data, error } = await supabase
    .from('paper_positions')
    .insert({
      id: input.position.id,
      account_id: input.accountId,
      asset_id: input.position.assetId,
      side: input.position.side === 'buy' ? 'long' : 'short',
      quantity: input.position.quantity,
      average_entry_price: input.position.entryPrice,
      stop_loss: input.position.stopLoss ?? null,
      take_profit: input.position.takeProfit ?? null,
      status: input.position.status,
      opened_at: input.position.openedAt,
      closed_at: input.position.closedAt ?? null,
    })
    .select('id')
    .single();

  if (error) throw new DomainError('DATA_ERROR', `Paper position persistence failed: ${error.message}`, { resource: 'paper_position' }, correlationId);
  const row = data as { id: string } | null;
  if (!row?.id) throw new DomainError('DATA_ERROR', 'Paper position persistence failed: database returned no position ID.', { resource: 'paper_position' }, correlationId);
  writeLog(createLogEvent('info', 'paper.position.persisted', correlationId, { positionId: row.id, accountId: input.accountId }));
  return row.id;
}

export async function persistPaperTrade(input: PaperTradePersistenceInput): Promise<string> {
  const correlationId = input.correlationId ?? createCorrelationId();
  const { data, error } = await supabase
    .from('paper_trades')
    .insert({
      id: input.trade.id,
      account_id: input.accountId,
      decision_id: input.decisionId,
      position_id: input.trade.positionId,
      asset_id: input.assetId,
      entry_price: input.trade.entryPrice,
      exit_price: input.trade.exitPrice,
      quantity: input.trade.quantity,
      fees: input.trade.fees,
      slippage: input.trade.slippage,
      realized_pnl: input.trade.realizedPnl,
      execution_version: input.trade.executionVersion,
      opened_at: input.trade.openedAt,
      closed_at: input.trade.closedAt,
    })
    .select('id')
    .single();

  if (error) throw new DomainError('DATA_ERROR', `Paper trade persistence failed: ${error.message}`, { resource: 'paper_trade' }, correlationId);
  const row = data as { id: string } | null;
  if (!row?.id) throw new DomainError('DATA_ERROR', 'Paper trade persistence failed: database returned no trade ID.', { resource: 'paper_trade' }, correlationId);
  writeLog(createLogEvent('info', 'paper.trade.persisted', correlationId, { tradeId: row.id, accountId: input.accountId }));
  return row.id;
}