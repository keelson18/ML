import { supabase } from '../lib/supabase';

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
  async getPositions(): Promise<{ positions: TradingPosition[] }> {
    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .order('opened_at', { ascending: false });
    if (error || !data) return { positions: [] };
    return {
      positions: data.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        symbol: r.symbol as string,
        side: r.side as string,
        entry_price: Number(r.entry_price),
        size: Number(r.size),
        stop_loss: r.stop_loss != null ? Number(r.stop_loss) : null,
        take_profit: r.take_profit != null ? Number(r.take_profit) : null,
        status: r.status as string,
        opened_at: r.opened_at as string,
        closed_at: (r.closed_at as string) ?? null,
      })),
    };
  },

  async createPosition(payload: Record<string, unknown>): Promise<{ position: TradingPosition | null }> {
    const { data, error } = await supabase
      .from('positions')
      .insert({
        symbol: payload.symbol,
        side: payload.side,
        entry_price: payload.entry_price ?? payload.entryPrice,
        size: payload.size,
        stop_loss: payload.stop_loss ?? payload.stopLoss,
        take_profit: payload.take_profit ?? payload.takeProfit,
        market_type: payload.market_type ?? payload.marketType ?? 'crypto',
      })
      .select('*')
      .maybeSingle();
    if (error || !data) return { position: null };
    return {
      position: {
        id: data.id as string,
        symbol: data.symbol as string,
        side: data.side as string,
        entry_price: Number(data.entry_price),
        size: Number(data.size),
        stop_loss: data.stop_loss != null ? Number(data.stop_loss) : null,
        take_profit: data.take_profit != null ? Number(data.take_profit) : null,
        status: data.status as string,
        opened_at: data.opened_at as string,
        closed_at: (data.closed_at as string) ?? null,
      },
    };
  },

  async closePosition(id: string): Promise<{ success: boolean }> {
    const { error } = await supabase
      .from('positions')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', id);
    return { success: !error };
  },

  async getTrades(): Promise<{ trades: TradeRecord[] }> {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .order('executed_at', { ascending: false });
    if (error || !data) return { trades: [] };
    return {
      trades: data.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        symbol: r.symbol as string,
        side: r.side as string,
        price: Number(r.price),
        size: Number(r.size),
        fee: Number(r.fee),
        pnl: Number(r.pnl),
        executed_at: r.executed_at as string,
      })),
    };
  },
};

export const metricsApi = {
  async getMetrics(): Promise<{ metrics: SystemMetric[] }> {
    const { data, error } = await supabase
      .from('system_metrics')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(100);
    if (error || !data) return { metrics: [] };
    return {
      metrics: data.map((r: Record<string, unknown>) => ({
        metric_name: r.metric_name as string,
        metric_value: Number(r.metric_value),
        metric_unit: r.metric_unit as string,
        recorded_at: r.recorded_at as string,
      })),
    };
  },
};
