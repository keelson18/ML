import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { MarketType } from '../../lib/types';
import { MARKET_TYPES } from '../../lib/types';
import { getMarketsByType } from '../../lib/markets';

export default function MarketsPage() {
  const [selectedType, setSelectedType] = useState<MarketType>('crypto');

  const markets = getMarketsByType(selectedType);
  const marketTypeMeta = MARKET_TYPES.find((mt) => mt.value === selectedType);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" /> Markets
      </h2>

      {/* Market Type Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border w-fit">
        {MARKET_TYPES.map((mt) => (
          <button
            key={mt.value}
            onClick={() => setSelectedType(mt.value)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              selectedType === mt.value ? 'bg-primary text-black' : 'text-muted hover:text-text'
            }`}
          >
            {mt.icon} {mt.label}
          </button>
        ))}
      </div>

      {/* Market Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-[10px] text-muted mb-1">Total Markets</div>
          <div className="text-lg font-semibold">{markets.length}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-[10px] text-muted mb-1">Category</div>
          <div className="text-lg font-semibold capitalize">{marketTypeMeta?.label ?? selectedType}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-[10px] text-muted mb-1">Top Gainer</div>
          <div className="text-lg font-semibold text-success">--</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-[10px] text-muted mb-1">Top Loser</div>
          <div className="text-lg font-semibold text-danger">--</div>
        </div>
      </div>

      {/* Market List */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="text-left px-4 py-3 font-medium">Symbol</th>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Exchange</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => (
                <tr key={m.symbol} className="border-b border-border/50 hover:bg-bg/50 transition-colors">
                  <td className="px-4 py-3 font-medium">{m.symbol}</td>
                  <td className="px-4 py-3 text-muted">{m.label}</td>
                  <td className="px-4 py-3 text-muted">{m.exchange}</td>
                  <td className="px-4 py-3 text-muted">{m.category ?? '--'}</td>
                  <td className="px-4 py-3">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-success/10 text-success">Active</span>
                  </td>
                </tr>
              ))}
              {markets.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No markets found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
