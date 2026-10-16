import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import type { Candle, Overlay } from '../lib/types';
import type { ChartPaperPosition, ChartPaperTrade } from '../lib/backend-api';
import { mapPaperTradesToDrawings } from '../lib/trade-chart';
import type { UserPreferences } from '../api/workspace';
import ExplainableTrade from './ExplainableTrade';
import { normalizeCandles, normalizeOverlays } from '../lib/chart-data';
import {
  applyCandleUpdate,
  createOverlayState,
  planOverlays,
  syncOverlays,
  type ChartLike,
  type LineOptions,
  type LinePoint,
  type MarkerSpec,
} from '../lib/chart-feed';
import { recordTiming } from '../lib/perf';

interface Props {
  candles: Candle[];
  overlays: Overlay[];
  theme: 'light' | 'dark';
  trades?: ChartPaperTrade[];
  positions?: ChartPaperPosition[];
  journal?: Array<{ id: string; planId?: string; metrics: Record<string, number | string | boolean | null>; engineVersions: Record<string, string> }>;
  layers?: UserPreferences['chartLayers'];
  onToggleLayer?: (key: keyof UserPreferences['chartLayers']) => void;
  layerSaveError?: boolean;
}

const ANNOUNCE_INTERVAL_MS = 1000;

function toCandleBar(candle: Candle) {
  return {
    time: candle.time as Time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function toMarker(marker: MarkerSpec): SeriesMarker<Time> {
  return { time: marker.time as Time, position: marker.position, color: marker.color, shape: marker.shape, text: marker.text };
}

export default function PriceChart({ candles, overlays, theme, trades = [], positions = [], journal = [], layers = { structure: true, zones: true, tradeLevels: true, signals: true, trades: true }, onToggleLayer, layerSaveError = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const appliedCandlesRef = useRef<Candle[]>([]);
  const overlayStateRef = useRef(createOverlayState<ISeriesApi<'Line'>>());

  const safeCandles = useMemo(() => normalizeCandles(candles), [candles]);
  const visibleOverlays = useMemo(() => overlays.filter((overlay) => {
    if (overlay.type === 'zone') return layers.zones;
    if (overlay.type === 'markers') return layers.signals;
    if (overlay.type === 'hline' && /\b(sl|tp\d?|entry)\b/i.test(overlay.label ?? '')) return layers.tradeLevels;
    return layers.structure;
  }), [overlays, layers]);
  const overlayPlan = useMemo(
    () => planOverlays(normalizeOverlays(visibleOverlays, safeCandles), safeCandles),
    [visibleOverlays, safeCandles],
  );

  const [announced, setAnnounced] = useState<Candle[]>(safeCandles);
  const [, setCoordinateRevision] = useState(0);
  const [selectedTrade, setSelectedTrade] = useState<ChartPaperTrade | null>(null);
  const latestCandlesRef = useRef(safeCandles);
  const announceTimerRef = useRef<number | null>(null);
  const lastAnnouncedAtRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      width: Math.max(container.clientWidth, 1),
      height: Math.max(container.clientHeight, 1),
      layout: {
        background: { type: ColorType.Solid, color: theme === 'dark' ? '#14141a' : '#ffffff' },
        textColor: theme === 'dark' ? '#9696a5' : '#787887',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
        fontSize: container.clientWidth < 1024 ? 14 : 12,
      },
      grid: {
        vertLines: { color: theme === 'dark' ? '#1e1e26' : '#f0f0f4', style: 1 },
        horzLines: { color: theme === 'dark' ? '#1e1e26' : '#f0f0f4', style: 1 },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: theme === 'dark' ? '#2a2a34' : '#eaeaef' },
      timeScale: { borderColor: theme === 'dark' ? '#2a2a34' : '#eaeaef', timeVisible: true },
    });
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    appliedCandlesRef.current = [];
    overlayStateRef.current = createOverlayState();

    const updateSize = () => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: Math.max(containerRef.current.clientWidth, 1),
        height: Math.max(containerRef.current.clientHeight, 1),
        layout: { fontSize: containerRef.current.clientWidth < 1024 ? 14 : 12 },
      });
      setCoordinateRevision((value) => value + 1);
    };
    const updateCoordinates = () => setCoordinateRevision((value) => value + 1);
    chart.timeScale().subscribeVisibleTimeRangeChange(updateCoordinates);
    updateSize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
    observer?.observe(container);

    return () => {
      observer?.disconnect();
      chart.timeScale().unsubscribeVisibleTimeRangeChange(updateCoordinates);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    const start = performance.now();
    applyCandleUpdate(candleSeries, toCandleBar, appliedCandlesRef.current, safeCandles);
    appliedCandlesRef.current = safeCandles;
    recordTiming('chart.candles', performance.now() - start);
    // Reproject trade markers and drawing levels after Lightweight Charts has
    // applied the new series data and its autoscale coordinates have settled.
    setCoordinateRevision((value) => value + 1);
  }, [safeCandles, theme]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;
    const adapter: ChartLike<ISeriesApi<'Line'>> = {
      addLine: (options: LineOptions) => chart.addLineSeries(options),
      setLineData: (series, points: LinePoint[]) => series.setData(points.map((point) => ({ time: point.time as Time, value: point.value })) as LineData<Time>[]),
      removeSeries: (series) => chart.removeSeries(series),
    };
    const start = performance.now();
    syncOverlays(adapter, overlayStateRef.current, overlayPlan, (markers) => candleSeries.setMarkers(markers.map(toMarker)));
    recordTiming('chart.overlays', performance.now() - start);
  }, [overlayPlan, theme]);

  useEffect(() => {
    latestCandlesRef.current = safeCandles;
    if (announceTimerRef.current !== null) return;
    const wait = Math.max(0, lastAnnouncedAtRef.current + ANNOUNCE_INTERVAL_MS - Date.now());
    announceTimerRef.current = window.setTimeout(() => {
      announceTimerRef.current = null;
      lastAnnouncedAtRef.current = Date.now();
      setAnnounced(latestCandlesRef.current);
    }, wait);
  }, [safeCandles]);

  useEffect(() => () => {
    if (announceTimerRef.current !== null) window.clearTimeout(announceTimerRef.current);
  }, []);

  const recentCandles = announced.slice(-10);
  const latestClose = recentCandles[recentCandles.length - 1]?.close;
  const chartDescription = latestClose === undefined
    ? 'Price chart with no data available.'
    : `Price chart with ${announced.length} bars. Latest close: ${latestClose}.`;

  const tradeDrawings = mapPaperTradesToDrawings(trades, positions, safeCandles.at(-1));
  const plotTrades = tradeDrawings.map((drawing) => ({
    ...drawing,
    x1: chartRef.current?.timeScale().timeToCoordinate(drawing.entryTime as Time),
    y1: candleSeriesRef.current?.priceToCoordinate(drawing.entryPrice),
    x2: chartRef.current?.timeScale().timeToCoordinate(drawing.exitTime as Time),
    y2: candleSeriesRef.current?.priceToCoordinate(drawing.exitPrice),
  })).filter((item) => item.x1 !== null && item.x1 !== undefined && item.y1 !== null && item.y1 !== undefined
    && item.x2 !== null && item.x2 !== undefined && item.y2 !== null && item.y2 !== undefined
    && item.x1 >= 0 && item.x1 <= (containerRef.current?.clientWidth ?? 0)
    && item.x2 >= 0 && item.x2 <= (containerRef.current?.clientWidth ?? 0)
    && item.y1 >= 0 && item.y1 <= (containerRef.current?.clientHeight ?? 0)
    && item.y2 >= 0 && item.y2 <= (containerRef.current?.clientHeight ?? 0));
  const outsideViewTradeCount = tradeDrawings.length - plotTrades.length;
  const selectedPosition = selectedTrade ? positions.find((position) => position.id === selectedTrade.positionId) : undefined;
  const selectedJournal = selectedPosition?.planId ? journal.find((entry) => entry.planId === selectedPosition.planId) : undefined;
  const zones = overlays.filter((overlay) => overlay.type === 'zone' && overlay.from !== undefined && overlay.to !== undefined && layers.zones)
    .map((zone) => ({ zone, y1: candleSeriesRef.current?.priceToCoordinate(zone.from!), y2: candleSeriesRef.current?.priceToCoordinate(zone.to!) }))
    .filter((item) => item.y1 !== null && item.y1 !== undefined && item.y2 !== null && item.y2 !== undefined);
  const tradeLevels = layers.tradeLevels ? positions.filter((position) => position.status === 'open').flatMap((position) => [
    { id: `${position.id}:entry`, label: 'ENTRY', price: position.entryPrice, color: '#2563eb' },
    ...(position.stopLoss === undefined ? [] : [{ id: `${position.id}:sl`, label: 'SL', price: position.stopLoss, color: '#b91c1c' }]),
    ...(position.takeProfit === undefined || position.targets?.length ? [] : [{ id: `${position.id}:tp`, label: 'TP', price: position.takeProfit, color: '#15803d' }]),
    ...(position.targets ?? []).map((target, index) => ({ id: `${position.id}:tp${index + 1}`, label: `TP${index + 1}`, price: target.price, color: '#15803d' })),
  ]).map((level) => ({ ...level, y: candleSeriesRef.current?.priceToCoordinate(level.price) }))
    .filter((level) => level.y !== null && level.y !== undefined) : [];

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} role="img" aria-label={chartDescription} className="w-full h-full" />
      {onToggleLayer && <div className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] gap-1 overflow-x-auto rounded-lg border border-border bg-surface/95 p-1" aria-label="Chart layers">
        {([['structure', 'Structure'], ['zones', 'Zones'], ['tradeLevels', 'Trade levels'], ['signals', 'Signals'], ['trades', 'Trades']] as const).map(([key, label]) =>
          <button key={key} type="button" className={`min-h-11 shrink-0 rounded-md px-3 text-sm font-medium ${layers[key] ? 'bg-primary text-white' : 'bg-bg text-muted'}`} aria-pressed={layers[key]} onClick={() => onToggleLayer(key)}>{label}</button>)}
      </div>}
      {layers.trades && outsideViewTradeCount > 0 && <span className="absolute right-2 top-2 z-10 rounded-md border border-border bg-surface/95 px-2 py-1 text-sm text-muted" role="status">
        {outsideViewTradeCount} trade{outsideViewTradeCount === 1 ? '' : 's'} outside chart view
      </span>}
      {layerSaveError && <span className="absolute left-2 top-14 z-10 rounded-md bg-danger px-2 py-1 text-sm text-white" role="status">Layer preference could not be saved.</span>}
      <svg aria-label="Analytical chart zones" className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style={{ zIndex: 4 }}>
        {zones.map(({ zone, y1, y2 }) => <g key={zone.id}>
          <rect x="0" y={Math.min(Number(y1), Number(y2))} width="100%" height={Math.max(2, Math.abs(Number(y1) - Number(y2)))}
            fill={zone.color ?? 'rgba(59,130,246,0.1)'} fillOpacity={/filled|mitigated/i.test(zone.label ?? '') ? 0.04 : 1}
            stroke={zone.color ?? '#3b82f6'} strokeWidth="1.5" strokeOpacity={/filled|mitigated/i.test(zone.label ?? '') ? 0.4 : 1} />
          <text x="8" y={Math.min(Number(y1), Number(y2)) + 16} fill={theme === 'dark' ? '#f4f4f5' : '#18181b'} fontSize="14" fontWeight="700">{zone.label ?? 'Zone'}</text>
        </g>)}
      </svg>
      {layers.tradeLevels && <svg aria-label="Open trade levels" className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style={{ zIndex: 4.5 }}>
        {tradeLevels.map((level) => <g key={level.id}><line x1="0" x2="100%" y1={Number(level.y)} y2={Number(level.y)} stroke={level.color} strokeWidth="2" />
          <text x="8" y={Number(level.y) - 4} fill={level.color} fontSize="14" fontWeight="700" style={{ fontVariantNumeric: 'tabular-nums' }}>{level.label} {level.price}</text></g>)}
      </svg>}
      {layers.trades && <svg aria-label="Paper trade markers" className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style={{ zIndex: 5 }}>
        {plotTrades.map(({ trade, x1, y1, x2, y2, open, pnlPct, rMultiple }) => {
          const favorable = open ? pnlPct >= 0 : trade.realizedPnl >= 0;
          const color = open ? '#52525b' : favorable ? '#15803d' : '#b91c1c';
          return <g key={trade.id} className="pointer-events-auto cursor-pointer" role="button" tabIndex={0}
            aria-label={`${trade.side} entry at ${trade.entryPrice}${open ? ', open position' : `, exit ${trade.exitReason ?? 'closed'} at ${trade.exitPrice}`}`}
            onPointerEnter={() => setSelectedTrade(trade)} onClick={() => setSelectedTrade(trade)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedTrade(trade); } }}>
            <line x1={Number(x1)} y1={Number(y1)} x2={Number(x2)} y2={Number(y2)} stroke={color} strokeWidth="2" strokeDasharray="6 4" opacity="0.9" />
            <circle cx={Number(x1)} cy={Number(y1)} r="8" fill={open ? 'transparent' : color} stroke={trade.side === 'buy' ? '#16a34a' : '#dc2626'} strokeWidth="3" />
            <path d={trade.side === 'buy' ? `M ${x1} ${Number(y1) - 13} l -7 11 h 14 z` : `M ${x1} ${Number(y1) + 13} l -7 -11 h 14 z`} fill={open ? 'transparent' : color} stroke={trade.side === 'buy' ? '#16a34a' : '#dc2626'} strokeWidth="2" />
            {!open && <path d={`M ${x2} ${Number(y2) + (trade.side === 'buy' ? 12 : -12)} l -7 ${trade.side === 'buy' ? -11 : 11} h 14 z`} fill={color} stroke={color} strokeWidth="2" />}
            {!open && <text x={Number(x2) + 8} y={Number(y2) - 19} fill={color} fontSize="14" fontWeight="700">{trade.exitReason ?? 'EXIT'}</text>}
            <rect x={Number(x2) + 8} y={Number(y2) - 14} width="142" height="28" rx="5" fill={color} />
            <text x={Number(x2) + 79} y={Number(y2) + 5} fill="white" textAnchor="middle" fontSize="14" fontWeight="700" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {rMultiple === null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : `${rMultiple >= 0 ? '+' : ''}${rMultiple.toFixed(2)}R · ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`}
            </text>
          </g>;
        })}
      </svg>}
      {layers.trades && selectedTrade && <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:w-80 z-10" role="region" aria-label="Paper trade details">
        <ExplainableTrade trade={selectedTrade} planId={selectedJournal?.planId ?? selectedPosition?.planId}
          confidence={selectedJournal?.metrics.confidence === undefined ? undefined : String(selectedJournal.metrics.confidence)}
          engineVersions={{ ...selectedPosition?.engineVersions, ...selectedTrade.engineVersions }} onClose={() => setSelectedTrade(null)} />
      </div>}
      <table className="sr-only">
        <caption>Latest chart values</caption>
        <thead><tr><th scope="col">Time</th><th scope="col">Open</th><th scope="col">High</th><th scope="col">Low</th><th scope="col">Close</th></tr></thead>
        <tbody>{recentCandles.map((candle) => <tr key={candle.time}><th scope="row">{new Date(candle.time * 1000).toLocaleString()}</th><td>{candle.open}</td><td>{candle.high}</td><td>{candle.low}</td><td>{candle.close}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
