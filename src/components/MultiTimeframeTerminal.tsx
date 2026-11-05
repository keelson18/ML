import { useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import TradingTerminal from './TradingTerminal';
import type { Timeframe } from '../lib/types';
import { getDataProvider } from '../lib/providers';
import { fetchMultiTimeframeAnalysis, MULTI_TIMEFRAME_ANALYSIS_PANELS, TERMINAL_TIMEFRAMES, type MultiTimeframeSeriesResult } from '../lib/terminal';

interface Props {
  symbol: string;
  theme: 'light' | 'dark';
}

type PanelState = { timeframe: Timeframe; size: 'compact' | 'normal' | 'expanded' };
const DEFAULT_PANELS: PanelState[] = MULTI_TIMEFRAME_ANALYSIS_PANELS.map(({ timeframe }) => ({ timeframe, size: 'normal' }));
const LIMITS: Record<Timeframe, number> = { '1m': 500, '3m': 500, '5m': 500, '15m': 500, '30m': 500, '1h': 300, '4h': 240, '1d': 180, '1w': 120, '1M': 120 };

export default function MultiTimeframeTerminal({ symbol, theme }: Props) {
  const [panels, setPanels] = useState<PanelState[]>(DEFAULT_PANELS);
  const [series, setSeries] = useState<Partial<Record<Timeframe, MultiTimeframeSeriesResult>>>({});
  const [loading, setLoading] = useState(true);
  const dataProvider = useMemo(() => getDataProvider(symbol), [symbol]);
  const timeframeKey = panels.map(({ timeframe }) => timeframe).join(',');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSeries({});
    const requests = timeframeKey.split(',').map((timeframe) => ({ timeframe: timeframe as Timeframe, label: timeframe, role: 'CUSTOM', limit: LIMITS[timeframe as Timeframe] }));
    fetchMultiTimeframeAnalysis(dataProvider, symbol, requests)
      .then((results) => { if (!cancelled) setSeries(results); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dataProvider, symbol, timeframeKey]);

  const updatePanel = (index: number, patch: Partial<PanelState>) => setPanels((current) => current.map((panel, panelIndex) => panelIndex === index ? { ...panel, ...patch } : panel));
  const cycleSize = (index: number) => updatePanel(index, { size: panels[index].size === 'compact' ? 'normal' : panels[index].size === 'normal' ? 'expanded' : 'compact' });

  return (
    <div className="mtf-terminal" aria-label="Multi-timeframe trading terminal">
      {panels.map((panel, index) => {
        const result = series[panel.timeframe];
        const candles = result?.candles ?? [];
        return (
          <section id={`terminal-${index}`} className={`mtf-chart-panel mtf-chart-panel-${panel.size} ${panel.timeframe === '15m' ? 'is-execution' : ''}`} key={index}>
            <header className="mtf-chart-header">
              <div>
                <strong>Panel {index + 1}</strong>
                <span>{panel.size === 'expanded' ? 'Expanded' : panel.size === 'compact' ? 'Compact' : 'Standard'}</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`terminal-timeframe-${index}`}>Panel {index + 1} timeframe</label>
                <select id={`terminal-timeframe-${index}`} value={panel.timeframe} onChange={(event) => updatePanel(index, { timeframe: event.target.value as Timeframe })} className="rounded border border-border bg-bg px-2 py-1 text-xs text-text">
                  {TERMINAL_TIMEFRAMES.map((option) => <option key={option.timeframe} value={option.timeframe}>{option.label}</option>)}
                </select>
                <button type="button" onClick={() => cycleSize(index)} aria-label={`${panel.size === 'expanded' ? 'Compress' : panel.size === 'compact' ? 'Restore' : 'Expand'} panel ${index + 1}`} className="rounded p-1 text-muted hover:bg-bg hover:text-text">
                  {panel.size === 'expanded' ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={() => updatePanel(index, DEFAULT_PANELS[index])} aria-label={`Reset panel ${index + 1}`} className="rounded p-1 text-muted hover:bg-bg hover:text-text"><RotateCcw className="h-3.5 w-3.5" /></button>
              </div>
              <small>{candles.length ? `${candles.length} candles` : result?.error ? 'Error' : loading ? 'Loading' : 'No data'}</small>
            </header>
            <div className="mtf-chart-body">
              {candles.length > 0 ? <TradingTerminal candles={candles} theme={theme} /> : <span className="command-empty" role={result?.error ? 'alert' : undefined}>{result?.error ? `Request failed: ${result.error}` : loading ? 'Loading timeframe' : 'No data available'}</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
