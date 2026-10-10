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

export default function PriceChart({ candles, overlays, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const appliedCandlesRef = useRef<Candle[]>([]);
  const overlayStateRef = useRef(createOverlayState<ISeriesApi<'Line'>>());

  const safeCandles = useMemo(() => normalizeCandles(candles), [candles]);
  const overlayPlan = useMemo(
    () => planOverlays(normalizeOverlays(overlays, safeCandles), safeCandles),
    [overlays, safeCandles],
  );

  const [announced, setAnnounced] = useState<Candle[]>(safeCandles);
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
        fontSize: 11,
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
      });
    };
    updateSize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
    observer?.observe(container);

    return () => {
      observer?.disconnect();
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

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} role="img" aria-label={chartDescription} className="w-full h-full" />
      <table className="sr-only">
        <caption>Latest chart values</caption>
        <thead><tr><th scope="col">Time</th><th scope="col">Open</th><th scope="col">High</th><th scope="col">Low</th><th scope="col">Close</th></tr></thead>
        <tbody>{recentCandles.map((candle) => <tr key={candle.time}><th scope="row">{new Date(candle.time * 1000).toLocaleString()}</th><td>{candle.open}</td><td>{candle.high}</td><td>{candle.low}</td><td>{candle.close}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
