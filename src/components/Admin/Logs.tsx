import { useState } from 'react';
import { RefreshCw, AlertTriangle, Info, XCircle } from 'lucide-react';

interface LogEntry {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  source: string;
  timestamp: Date;
}

const mockLogs: LogEntry[] = [
  { id: '1', level: 'info', message: 'System started successfully', source: 'system', timestamp: new Date() },
  { id: '2', level: 'info', message: 'WebSocket connected to Binance', source: 'binance', timestamp: new Date(Date.now() - 60000) },
  { id: '3', level: 'warn', message: 'ML prediction rate limit approached', source: 'ml-predict', timestamp: new Date(Date.now() - 120000) },
  { id: '4', level: 'info', message: 'New user registered', source: 'auth', timestamp: new Date(Date.now() - 300000) },
  { id: '5', level: 'error', message: 'Failed to fetch Forex data: rate limit', source: 'forex-provider', timestamp: new Date(Date.now() - 600000) },
];

const LEVEL_ICONS = {
  info: Info,
  warn: AlertTriangle,
  error: XCircle,
};

const LEVEL_COLORS = {
  info: 'text-primary',
  warn: 'text-warning',
  error: 'text-danger',
};

export default function Logs() {
  const logs = mockLogs;
  const [filter, setFilter] = useState<string>('all');

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.level === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">System Logs</h3>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-2 py-1 rounded text-xs bg-surface border border-border text-text focus:outline-none focus:border-primary"
          >
            <option value="all">All Levels</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
          <button className="p-1.5 rounded hover:bg-bg transition-colors">
            <RefreshCw className="w-3.5 h-3.5 text-muted" />
          </button>
        </div>
      </div>
      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {filtered.map((log) => {
          const Icon = LEVEL_ICONS[log.level];
          return (
            <div key={log.id} className="flex items-start gap-2 py-1.5 px-2 rounded text-xs font-mono">
              <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${LEVEL_COLORS[log.level]}`} />
              <span className="text-muted shrink-0">
                {log.timestamp.toLocaleTimeString()}
              </span>
              <span className={`shrink-0 uppercase ${
                log.level === 'error' ? 'text-danger' : log.level === 'warn' ? 'text-warning' : 'text-muted'
              }`}>
                [{log.source}]
              </span>
              <span className="text-text">{log.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

