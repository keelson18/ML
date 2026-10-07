// Stable trader-domain vocabularies and registry-derived correlation groups.
import { MARKET_UNIVERSE } from '../../../src/lib/markets';

export const SETUP_TYPES = ['trend-pullback'] as const;
export type SetupType = typeof SETUP_TYPES[number];

export const HTF_BIASES = ['bull', 'bear', 'range', 'unclear'] as const;
export type HtfBias = typeof HTF_BIASES[number];

export const PLAN_STATUSES = [
  'SCANNING', 'WATCHING', 'ARMED', 'PENDING_ORDER', 'OPEN', 'MANAGING', 'CLOSED', 'REVIEWED',
  'EXPIRED', 'INVALIDATED', 'CANCELLED',
] as const;
export type PlanStatus = typeof PLAN_STATUSES[number];

export const TRIGGER_KINDS = [
  'close_above_level', 'close_below_level', 'bullish_engulfing', 'bearish_engulfing', 'higher_low_break',
] as const;
export type TriggerKind = typeof TRIGGER_KINDS[number];

export const ALLOWED_PLAN_TRANSITIONS: Readonly<Record<PlanStatus, readonly PlanStatus[]>> = {
  SCANNING: ['WATCHING', 'CANCELLED'],
  WATCHING: ['ARMED', 'EXPIRED', 'INVALIDATED', 'CANCELLED'],
  ARMED: ['PENDING_ORDER', 'WATCHING', 'EXPIRED', 'INVALIDATED', 'CANCELLED'],
  PENDING_ORDER: ['OPEN', 'EXPIRED', 'INVALIDATED', 'CANCELLED'],
  OPEN: ['MANAGING', 'CLOSED'],
  MANAGING: ['CLOSED'],
  CLOSED: ['REVIEWED'],
  REVIEWED: [],
  EXPIRED: [],
  INVALIDATED: [],
  CANCELLED: [],
};

// Clusters are derived from the shared registry so adding a market does not require another symbol list.
export const CORRELATION_CLUSTERS: Readonly<Record<string, readonly string[]>> = MARKET_UNIVERSE
  .filter((market) => market.isActive)
  .reduce<Record<string, string[]>>((clusters, market) => {
    const key = market.marketType === 'crypto'
      ? 'crypto-spot'
      : market.marketType === 'stock'
        ? `stock:${market.sector ?? 'other'}`
        : `${market.marketType}:${market.baseAsset}`;
    (clusters[key] ??= []).push(market.symbol);
    return clusters;
  }, {});

export function getCorrelationCluster(symbol: string): string | undefined {
  return Object.entries(CORRELATION_CLUSTERS).find(([, symbols]) => symbols.includes(symbol))?.[0];
}
