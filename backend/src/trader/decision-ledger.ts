import { createHash } from 'node:crypto';
import type { PaperAccountState } from '../engines/paper-execution';
import { traderConfig } from './config';

export interface LedgerHashRow {
  accountId: string;
  idempotencyKey: string;
  eventType: string;
  payload: unknown;
  prevHash: string | null;
  rowHash: string;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashLedgerRow(row: Pick<LedgerHashRow, 'accountId' | 'idempotencyKey' | 'eventType' | 'payload' | 'prevHash'>): string {
  return createHash('sha256')
    .update(`${row.prevHash ?? ''}|${row.accountId}|${row.idempotencyKey}|${row.eventType}|${canonicalJson(row.payload)}`)
    .digest('hex');
}

export function verifyLedgerRows(rows: LedgerHashRow[]): { ok: boolean; checked: number; brokenIndex?: number; lastHash: string | null } {
  let previous: string | null = null;
  for (const [index, row] of rows.entries()) {
    if (row.prevHash !== previous || row.rowHash !== hashLedgerRow(row)) return { ok: false, checked: index, brokenIndex: index, lastHash: previous };
    previous = row.rowHash;
  }
  return { ok: true, checked: rows.length, lastHash: previous };
}

export function reconcilePaperAccount(account: PaperAccountState, tolerance = traderConfig.ACCOUNTING_RECONCILIATION_TOLERANCE) {
  const openPositions = account.positions.filter((position) => position.status === 'open');
  const actualEquity = account.cash + openPositions.reduce((sum, position) => sum + position.entryPrice * position.quantity, 0);
  const realizedPnl = account.trades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const openEntryFees = openPositions.reduce((sum, position) => sum + position.entryFee, 0);
  const expectedEquity = traderConfig.TRADER_STARTING_EQUITY + realizedPnl - openEntryFees;
  const difference = actualEquity - expectedEquity;
  return { ok: Math.abs(difference) <= tolerance, actualEquity, expectedEquity, difference };
}
