import type { PaperAccountState } from '../engines/paper-execution';
import type { TradePlan } from '../trader/types';

export const COACH_MAX_PLANS = 5;
export const COACH_MAX_POSITIONS = 10;
export const COACH_MAX_TRADES = 10;

export interface CoachRecords {
  plans: Array<Pick<TradePlan, 'id' | 'symbol' | 'side' | 'setupType' | 'grade' | 'status' | 'zone' | 'invalidation' | 'targets' | 'thesis' | 'falsification' | 'createdAt'>>;
  openPositions: Array<{ id: string; symbol: string; side: string; quantity: number; entryPrice: number; stopLoss: number | null; takeProfit: number | null; initialRisk: number | null; openedAt: string; planId: string | null }>;
  recentTrades: Array<{ id: string; symbol: string; side: string; entryPrice: number; exitPrice: number; realizedPnl: number; rMultiple: number | null; maeR: number | null; mfeR: number | null; exitReason: string | null; closedAt: string; planId: string | null }>;
  stats: { closedTradeCount: number; winCount: number; lossCount: number };
}

function newestFirst<T>(items: T[], timestamp: (item: T) => string): T[] {
  return [...items].sort((left, right) => Date.parse(timestamp(right)) - Date.parse(timestamp(left)));
}

export function buildCoachRecords(account: PaperAccountState, plans: TradePlan[]): CoachRecords {
  const journalById = new Map((account.tradeJournal ?? []).map((entry) => [entry.id, entry]));
  const trades = account.trades;

  return {
    plans: newestFirst(plans, (plan) => plan.createdAt).slice(0, COACH_MAX_PLANS).map((plan) => ({
      id: plan.id, symbol: plan.symbol, side: plan.side, setupType: plan.setupType, grade: plan.grade,
      status: plan.status, zone: plan.zone, invalidation: plan.invalidation, targets: plan.targets,
      thesis: plan.thesis, falsification: plan.falsification, createdAt: plan.createdAt,
    })),
    openPositions: newestFirst(account.positions.filter((position) => position.status === 'open'), (position) => position.openedAt)
      .slice(0, COACH_MAX_POSITIONS).map((position) => ({
        id: position.id, symbol: position.symbol, side: position.side, quantity: position.quantity,
        entryPrice: position.entryPrice, stopLoss: position.stopLoss ?? null, takeProfit: position.takeProfit ?? null,
        initialRisk: position.initialRisk ?? null, openedAt: position.openedAt, planId: position.planId ?? null,
      })),
    recentTrades: newestFirst(trades, (trade) => trade.closedAt).slice(0, COACH_MAX_TRADES).map((trade) => {
      const journal = journalById.get(trade.id);
      const rMultiple = journal?.metrics.rMultiple;
      return {
        id: trade.id, symbol: trade.symbol, side: trade.side, entryPrice: trade.entryPrice, exitPrice: trade.exitPrice,
        realizedPnl: trade.realizedPnl, rMultiple: typeof rMultiple === 'number' ? rMultiple : null,
        maeR: trade.maeR, mfeR: trade.mfeR, exitReason: trade.exitReason ?? null, closedAt: trade.closedAt,
        planId: journal?.planId ?? null,
      };
    }),
    stats: {
      closedTradeCount: trades.length,
      winCount: trades.filter((trade) => trade.realizedPnl > 0).length,
      lossCount: trades.filter((trade) => trade.realizedPnl < 0).length,
    },
  };
}
