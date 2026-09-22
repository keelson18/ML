import { api } from './client';

export interface TradingPosition {
  id: string;
  symbol: string;
  side: string;
  entry_price: number;
  size: number;
  stop_loss: number | null;
  take_profit: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
}

export interface TradeRecord {
  id: string;
  symbol: string;
  side: string;
  price: number;
  size: number;
  fee: number;
  pnl: number;
  executed_at: string;
}

export interface SystemMetric {
  metric_name: string;
  metric_value: number;
  metric_unit: string;
  recorded_at: string;
}

export const tradingApi = {
  getPositions: () => api.get<{ positions: TradingPosition[] }>('/trading/positions'),
  createPosition: (payload: Record<string, unknown>) =>
    api.post<{ position: TradingPosition | null }>('/trading/positions', payload),
  closePosition: (id: string) =>
    api.put<{ success: boolean }>(`/trading/positions/${id}/close`),
  getTrades: () => api.get<{ trades: TradeRecord[] }>('/trading/trades'),
};

export const metricsApi = {
  getMetrics: () => api.get<{ metrics: SystemMetric[] }>('/metrics'),
};
