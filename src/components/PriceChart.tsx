import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type ISeriesApi,
  type LineWidth,
  type Time,
  LineStyle,
} from 'lightweight-charts';
import type { Candle } from '../lib/types';
import { normalizeCandles } from '../lib/chart-data';
import { applyCandleUpdate } from '../lib/chart-feed';
import { recordTiming } from '../lib/perf';

interface OverlayLine {
  type: 'line';
  data: Array<{ time: number; value: number }>;
  color?: string;
  width?: number;
}

interface Props {
  candles: Candle[];
  theme: 'light' | 'dark';
  overlays?: OverlayLine[];
}

const ANNOUNCE_INTERVAL_MS = 1000;

const LINE_WIDTHS: readonly LineWidth[] = [1, 2, 3, 4];

/** Lightweight Charts only accepts 1–4; clamp arbitrary overlay widths to the nearest valid value. */
function toLineWidth(width: number | undefined): LineWidth {
  if (width === undefined || !Number.isFinite(width)) return 2;
  return LINE_WIDTHS.reduce((best, candidate) => (
    Math.abs(candidate - width) < Math.abs(best - width) ? candidate : best
  ), 2);
}

function toCandleBar(candle: Candle) {
  return {
    time: candle.time as Time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function resolveThemeColors(theme: 'light' | 'dark') {
  const root = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  // CSS variables hold space-separated RGB channels (e.g. "150 150 165"); wrap them as rgb(...)
  // so lightweight-charts receives a parseable color string rather than the raw channel list.
  const toColor = (varName: string, fallback: string) => {
    const value = root?.getPropertyValue(varName).trim();
    if (!value) return fallback;
    if (/^(#|rgba?|hsla?)/i.test(value)) return value;
    return `rgb(${value})`;
  };
  return {
    bg: toColor('--bg', theme === 'dark' ? '#14141a' : '#ffffff'),
    text: toColor('--text', theme === 'dark' ? '#f3f4f6' : '#111827'),
    muted: toColor('--muted', theme === 'dark' ? '#9696a5' : '#787887'),
    border: toColor('--border', theme === 'dark' ? '#1e1e26' : '#f0f0f4'),
    primary: toColor('--primary', '#3b82f6'),
    success: toColor('--success', '#22c55e'),
    danger: toColor('--danger', '#ef4444'),
  };
}

export default function PriceChart({ candles, theme, overlays = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
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
    const candleSeries = chart.addCandlestickSeries({
      upColor: colors.success,
      downColor: colors.danger,
      borderVisible: false,
      wickUpColor: colors.success,
      wickDownColor: colors.danger,
    });
    candleSeriesRef.current = candleSeries;
    appliedCandlesRef.current = [];

    for (const overlay of overlays) {
      if (overlay.type !== 'line') continue;
      const series = chart.addLineSeries({
        color: overlay.color ?? colors.primary,
        lineWidth: toLineWidth(overlay.width),
        lineStyle: LineStyle.Solid,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      series.setData(overlay.data.map((point) => ({ time: point.time as Time, value: point.value })));
    }

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
      candleSeriesRef.current = null;
    };
  }, [theme, overlays]);

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
