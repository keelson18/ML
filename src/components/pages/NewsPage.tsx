import { Newspaper } from 'lucide-react';

export default function NewsPage() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Newspaper className="w-4 h-4 text-primary" /> News & Sentiment
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-4">
          <h3 className="text-xs font-medium text-muted mb-3">Market News Feed</h3>
          <div className="text-xs text-muted text-center py-12">News feed loading…</div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-xs font-medium text-muted mb-3">Sentiment Analysis</h3>
          <div className="space-y-3">
            <div className="bg-bg/50 rounded-lg p-3">
              <div className="text-[10px] text-muted mb-1">Overall Sentiment</div>
              <div className="text-lg font-semibold text-muted">--</div>
            </div>
            <div className="bg-bg/50 rounded-lg p-3">
              <div className="text-[10px] text-muted mb-1">News Sentiment</div>
              <div className="text-lg font-semibold text-muted">--</div>
            </div>
            <div className="bg-bg/50 rounded-lg p-3">
              <div className="text-[10px] text-muted mb-1">Social Sentiment</div>
              <div className="text-lg font-semibold text-muted">--</div>
            </div>
          </div>
        </div>
      </div>

      {/* Economic Calendar */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-muted mb-3">Economic Calendar</h3>
        <div className="text-xs text-muted text-center py-8">No upcoming events.</div>
      </div>
    </div>
  );
}
