import { useEffect, useRef } from 'react';
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

interface Props {
  candles: Candle[];
  overlays: Overlay[];
  theme: 'light' | 'dark';
}

export default function PriceChart({ candles, overlays, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<'Line'>[]>([]);

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
      overlaySeriesRef.current = [];
    };
  }, [theme]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    const safeCandles = normalizeCandles(candles);
    candleSeries.setData(safeCandles.map((candle) => ({
      time: candle.time as Time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })));
  }, [candles, theme]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;
    const safeCandles = normalizeCandles(candles);
    const safeOverlays = normalizeOverlays(overlays, safeCandles);

    for (const series of overlaySeriesRef.current) {
      try { chart.removeSeries(series); } catch { /* chart may already be unmounted */ }
    }
    overlaySeriesRef.current = [];
    const allMarkers: SeriesMarker<Time>[] = [];

    for (const overlay of safeOverlays) {
      if (overlay.type === 'line' && overlay.points) {
        const line = chart.addLineSeries({
          color: overlay.color ?? '#6b7280',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        const data: LineData[] = overlay.points.map((point) => ({ time: point.time as Time, value: point.value }));
        line.setData(data);
        overlaySeriesRef.current.push(line);
      } else if (overlay.type === 'hline' && overlay.price !== undefined && safeCandles.length) {
        const line = chart.addLineSeries({
          color: overlay.color ?? '#9ca3af',
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: overlay.label,
        });
        line.setData([
          { time: safeCandles[0].time as Time, value: overlay.price },
          { time: safeCandles[safeCandles.length - 1].time as Time, value: overlay.price },
        ]);
        overlaySeriesRef.current.push(line);
      } else if (overlay.type === 'markers' && overlay.markers) {
        allMarkers.push(...overlay.markers.map((marker) => ({
          time: marker.time as Time,
          position: marker.position,
          color: marker.color,
          shape: marker.shape,
          text: marker.text,
        })));
      }
    }

    allMarkers.sort((a, b) => Number(a.time) - Number(b.time));
    candleSeries.setMarkers(allMarkers);

    return () => {
      for (const series of overlaySeriesRef.current) {
        try { chart.removeSeries(series); } catch { /* chart may already be unmounted */ }
      }
      overlaySeriesRef.current = [];
    };
  }, [overlays, candles, theme]);

  const recentCandles = candles.slice(-10);
  const latestClose = recentCandles[recentCandles.length - 1]?.close;
  const chartDescription = latestClose === undefined
    ? 'Price chart with no data available.'
    : `Price chart with ${candles.length} bars. Latest close: ${latestClose}.`;

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
