import { Star } from 'lucide-react';

export default function WatchlistsPage() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Star className="w-4 h-4 text-primary" /> Watchlists
      </h2>

      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-medium text-muted">Default Watchlist</h3>
          <button className="px-3 py-1.5 rounded-lg bg-primary text-black text-xs font-medium hover:opacity-90 transition-opacity">
            + Add Symbol
          </button>
        </div>
        <div className="text-xs text-muted text-center py-8">
          Your watchlist is empty. Add symbols to track them here.
        </div>
      </div>
    </div>
  );
}
