import { getSupabaseClient } from '../db';

export interface MarketRestriction {
  symbol: string;
  reason: string;
  updatedAt: string;
}

// Restrictions are optional during rollout, so an unavailable table must not block chart access.
// Explicit administrator restrictions are enforced as soon as the migration is applied.
export async function getBlockedMarketSymbols(symbols: readonly string[]): Promise<Set<string>> {
  if (symbols.length === 0) return new Set();
  try {
    const { data, error } = await getSupabaseClient()
      .from('market_access_restrictions')
      .select('symbol')
      .in('symbol', [...symbols])
      .eq('blocked', true);
    if (error) return new Set();
    return new Set((data ?? []).map((row) => String(row.symbol)));
  } catch {
    return new Set();
  }
}

export async function isMarketAccessBlocked(symbol: string): Promise<boolean> {
  const blocked = await getBlockedMarketSymbols([symbol]);
  return blocked.has(symbol);
}
