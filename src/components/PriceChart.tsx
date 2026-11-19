import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  LineStyle,
} from 'lightweight-charts';
import type { Candle } from '../lib/types';
import { normalizeCandles } from '../lib/chart-data';
import { applyCandleUpdate } from '../lib/chart-feed';
import { recordTiming } from '../lib/perf';
import { resolveThemeColors } from './price-chart-colors';
import { planOverlays, type ChartOverlay } from './price-chart-overlays';

interface Props {
  candles: Candle[];
  theme: 'light' | 'dark';
  overlays?: ChartOverlay[];
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

export default function PriceChart({ candles, theme, overlays = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const appliedCandlesRef = useRef<Candle[]>([]);

  const safeCandles = useMemo(() => normalizeCandles(candles), [candles]);

  const [announced, setAnnounced] = useState<Candle[]>(safeCandles);
  const latestCandlesRef = useRef(safeCandles);
  const announceTimerRef = useRef<number | null>(null);
  const lastAnnouncedAtRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const colors = resolveThemeColors(theme);
    const chart = createChart(container, {
      width: Math.max(container.clientWidth, 1),
      height: Math.max(container.clientHeight, 1),
      layout: {
        background: { type: ColorType.Solid, color: colors.bg },
        textColor: colors.muted,
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
        fontSize: container.clientWidth < 1024 ? 14 : 12,
      },
      grid: {
        vertLines: { color: colors.border, style: 1 },
        horzLines: { color: colors.border, style: 1 },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border, timeVisible: true },
    });
    chartRef.current = chart;
    const candleSeries = chart.addCandlestickSeries({
      upColor: colors.success,
      downColor: colors.danger,
      borderVisible: false,
      wickUpColor: colors.success,
      wickDownColor: colors.danger,
    });
    candleSeriesRef.current = candleSeries;
    appliedCandlesRef.current = [];

    const updateSize = () => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: Math.max(containerRef.current.clientWidth, 1),
        height: Math.max(containerRef.current.clientHeight, 1),
        layout: { fontSize: containerRef.current.clientWidth < 1024 ? 14 : 12 },
      });
    };
    updateSize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
    observer?.observe(container);

    return () => {
      observer?.disconnect();
      chart.remove();
      chartRef.current = null;
      overlaySeriesRef.current = [];
      priceLinesRef.current = [];
      candleSeriesRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;
    for (const series of overlaySeriesRef.current) chart.removeSeries(series);
    overlaySeriesRef.current = [];
    for (const line of priceLinesRef.current) candleSeries.removePriceLine(line);
    priceLinesRef.current = [];
    candleSeries.setMarkers([]);

    const colors = resolveThemeColors(theme);
    const plan = planOverlays(overlays, colors);
    for (const line of plan.lines) {
      const series = chart.addLineSeries({
        color: line.color,
        lineWidth: line.width,
        lineStyle: LineStyle.Solid,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      series.setData(line.data);
      overlaySeriesRef.current.push(series);
    }
    if (plan.markers.length) candleSeries.setMarkers(plan.markers);
    priceLinesRef.current = plan.priceLines.map((line) => candleSeries.createPriceLine({
      price: line.price,
      color: line.color,
      title: line.title,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
    }));
  }, [overlays, theme]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    const start = performance.now();
    applyCandleUpdate(candleSeries, toCandleBar, appliedCandlesRef.current, safeCandles);
    appliedCandlesRef.current = safeCandles;
    recordTiming('chart.candles', performance.now() - start);
  }, [safeCandles, theme]);

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
    : `Price chart with ${announced.length} bar${announced.length === 1 ? '' : 's'}. Latest close: ${latestClose}.`;

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
