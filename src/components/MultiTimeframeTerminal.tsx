import { useEffect, useMemo, useState } from 'react';
import TradingTerminal from './TradingTerminal';
import type { Timeframe } from '../lib/types';
import { getDataProvider } from '../lib/providers';
import { fetchMultiTimeframeAnalysis, MULTI_TIMEFRAME_ANALYSIS_PANELS, type MultiTimeframeSeriesResult } from '../lib/terminal';

interface Props {
  symbol: string;
  theme: 'light' | 'dark';
}

export default function MultiTimeframeTerminal({ symbol, theme }: Props) {
  const [series, setSeries] = useState<Partial<Record<Timeframe, MultiTimeframeSeriesResult>>>({});
  const [loading, setLoading] = useState(true);
  const dataProvider = useMemo(() => getDataProvider(symbol), [symbol]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSeries({});
    fetchMultiTimeframeAnalysis(dataProvider, symbol)
      .then((results) => { if (!cancelled) setSeries(results); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dataProvider, symbol]);

  return (
    <div className="mtf-terminal" aria-label="Multi-timeframe trading terminal">
      {MULTI_TIMEFRAME_ANALYSIS_PANELS.map((panel) => {
        const result = series[panel.timeframe];
        const candles = result?.candles ?? [];
        return (
          <section id={`terminal-${panel.timeframe}`} className={`mtf-chart-panel ${panel.timeframe === '15m' ? 'is-execution' : ''}`} key={panel.timeframe}>
            <header className="mtf-chart-header"><div><strong>{panel.label}</strong><span>{panel.role}</span></div><small>{candles.length ? `${candles.length} candles` : result?.error ? 'Error' : loading ? 'Loading' : 'No data'}</small></header>
            <div className="mtf-chart-body">
              {candles.length > 0
                ? <TradingTerminal candles={candles} theme={theme} />
                : <span className="command-empty" role={result?.error ? 'alert' : undefined}>
                  {result?.error ? `Request failed: ${result.error}` : loading ? 'Loading timeframe' : 'No data available'}
                </span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
