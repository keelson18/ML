import { useEffect, useMemo, useState } from 'react';
import TradingTerminal from './TradingTerminal';
import type { Candle, MarketType, Timeframe } from '../lib/types';
import { getDataProvider } from '../lib/providers';

interface Props {
  symbol: string;
  marketType: MarketType;
  theme: 'light' | 'dark';
  wsStatus: string;
}

const PANELS: { timeframe: Timeframe; label: string; role: string; limit: number }[] = [
  { timeframe: '1d', label: '1D', role: 'BIAS', limit: 180 },
  { timeframe: '4h', label: '4H', role: 'STRUCTURE', limit: 240 },
  { timeframe: '15m', label: '15M', role: 'EXECUTION', limit: 500 },
  { timeframe: '5m', label: '5M', role: 'CONFIRMATION', limit: 500 },
];

export default function MultiTimeframeTerminal({ symbol, marketType, theme, wsStatus }: Props) {
  const [series, setSeries] = useState<Record<string, Candle[]>>({});
  const [loading, setLoading] = useState(true);
  const dataProvider = useMemo(() => getDataProvider(marketType), [marketType]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSeries({});
    Promise.all(PANELS.map(async (panel) => {
      try {
        return [panel.timeframe, await dataProvider.fetchKlines(symbol, panel.timeframe, panel.limit)] as const;
      } catch {
        return [panel.timeframe, []] as const;
      }
    })).then((entries) => {
      if (!cancelled) setSeries(Object.fromEntries(entries));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dataProvider, symbol]);

  return (
    <div className="mtf-terminal" aria-label="Multi-timeframe trading terminal">
      {PANELS.map((panel) => {
        const candles = series[panel.timeframe] ?? [];
        return (
          <section className={`mtf-chart-panel ${panel.timeframe === '15m' ? 'is-execution' : ''}`} key={panel.timeframe}>
            <header className="mtf-chart-header"><div><strong>{panel.label}</strong><span>{panel.role}</span></div><small>{candles.length ? `${candles.length} candles` : loading ? 'Loading' : 'No data'}</small></header>
            <div className="mtf-chart-body">
              {candles.length > 0 ? <TradingTerminal symbol={symbol} marketType={marketType} candles={candles} overlays={[]} timeframe={panel.timeframe} theme={theme} wsStatus={wsStatus} /> : <span className="command-empty">{loading ? 'Loading timeframe' : 'No data available'}</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
