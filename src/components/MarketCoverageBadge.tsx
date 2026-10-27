import { getMarket, getMarketAvailability } from '../lib/markets';
import { getMarketCoverage } from '../lib/market-coverage';
import type { MarketCoverageRecord } from '../lib/backend-api';

// Keep unknown backend coverage visibly amber instead of implying a working tier.
export default function MarketCoverageBadge({ symbol, compact = false, coverage: record, verified = true }: { symbol: string; compact?: boolean; coverage?: MarketCoverageRecord; verified?: boolean }) {
  if (!verified) return <span title="Coverage status could not be verified from the backend." className="inline-flex rounded-full border border-warning/30 bg-warning/10 px-2 py-1 text-xs font-medium text-warning">Coverage unverified</span>;
  const market = getMarket(symbol);
  if (!market) return <span className="inline-flex rounded-full border border-warning/30 px-2 py-1 text-xs font-medium text-warning">Coverage unverified</span>;
  const coverage = record ?? getMarketCoverage(market, getMarketAvailability(symbol));
  const tone = coverage.tier === 'A' ? 'border-success/30 bg-success/10 text-success'
    : coverage.tier === 'B' ? 'border-primary/30 bg-primary/10 text-primary'
      : coverage.tier === 'C' ? 'border-border bg-bg text-muted' : 'border-warning/30 bg-warning/10 text-warning';
  const label = compact ? coverage.label : `${coverage.label} · ${coverage.reason}`;
  return <span title={`${coverage.label}: ${coverage.reason}`} className={`inline-flex max-w-full items-center rounded-full border px-2 py-1 text-xs font-medium ${tone}`}>{label}</span>;
}
