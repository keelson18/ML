import { getSupabaseClient } from '../db';
import { setMarketCoverageOverrides, type MarketCoverageOverride } from '../../../src/lib/market-coverage';

let refreshPromise: Promise<void> | null = null;
let refreshedAt = 0;
const COVERAGE_CACHE_TTL_MS = 30_000;

// Keep the worker's coverage view current while preserving code defaults on temporary DB outages.
export async function refreshMarketCoverageOverrides(force = false): Promise<void> {
  if (!force && Date.now() - refreshedAt < COVERAGE_CACHE_TTL_MS) return;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const { data, error } = await getSupabaseClient().from('market_coverage_overrides')
        .select('symbol,tier,reason,provider_mapping_verified,provider_available,session_calendar_verified');
      if (error) return;
      const rows: MarketCoverageOverride[] = (data ?? []).map((row) => ({
        symbol: row.symbol,
        tier: row.tier,
        reason: row.reason,
        providerMappingVerified: row.provider_mapping_verified,
        sessionCalendarVerified: row.session_calendar_verified,
      }));
      setMarketCoverageOverrides(rows);
      refreshedAt = Date.now();
    } catch {
      // Code defaults remain in force when the optional admin override table is unavailable.
    }
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}
