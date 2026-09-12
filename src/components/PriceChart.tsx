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

interface Props {
  candles: Candle[];
  overlays: Overlay[];
  theme: 'light' | 'dark';
}

// Candlestick chart with live overlays: lines (MAs, Bollinger, trendlines),
// horizontal lines (Fibonacci, S/R), markers (patterns), and price lines (stop/target).
export default function PriceChart({ candles, overlays, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  // Track created overlay series so we can clean them up on each render.
  const overlaySeriesRef = useRef<ISeriesApi<'Line'>[]>([]);

  // Create chart once.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: theme === 'dark' ? '#000000' : '#ffffff' },
        textColor: theme === 'dark' ? '#e5e5e5' : '#171717',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
      },
      grid: {
        vertLines: { color: theme === 'dark' ? '#1a1a1a' : '#f0f0f0' },
        horzLines: { color: theme === 'dark' ? '#1a1a1a' : '#f0f0f0' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: theme === 'dark' ? '#262626' : '#e5e5e5' },
      timeScale: { borderColor: theme === 'dark' ? '#262626' : '#e5e5e5', timeVisible: true },
    });
    chartRef.current = chart;
    candleSeriesRef.current = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      overlaySeriesRef.current = [];
    };
  }, [theme]);

  // Update candle data.
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;
    candleSeriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as Time,
        open: c.open, high: c.high, low: c.low, close: c.close,
      })),
    );
  }, [candles]);

  // Update overlays: clear previous, then add lines/markers/hlines.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candleSeriesRef.current) return;

    // Remove old overlay line series.
    for (const s of overlaySeriesRef.current) {
      try { chart.removeSeries(s); } catch { /* noop */ }
    }
    overlaySeriesRef.current = [];

    const allMarkers: SeriesMarker<Time>[] = [];

    for (const ov of overlays) {
      if (ov.type === 'line' && ov.points && ov.points.length > 1) {
        const line = chart.addLineSeries({
          color: ov.color ?? '#6b7280',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        const data: LineData[] = ov.points
          .filter((p) => !isNaN(p.value))
          .map((p) => ({ time: p.time as Time, value: p.value }));
        line.setData(data);
        overlaySeriesRef.current.push(line);
      } else if (ov.type === 'hline' && ov.price != null) {
        const line = chart.addLineSeries({
          color: ov.color ?? '#9ca3af',
          lineWidth: 1,
          lineStyle: 2, // dashed
          priceLineVisible: false,
          lastValueVisible: true,
          title: ov.label,
        });
        // Draw the hline across the visible range using first and last candle times.
        const first = candles[0]?.time as Time | undefined;
        const last = candles[candles.length - 1]?.time as Time | undefined;
        if (first && last) {
          line.setData([
            { time: first, value: ov.price },
            { time: last, value: ov.price },
          ]);
        }
        overlaySeriesRef.current.push(line);
      } else if (ov.type === 'markers' && ov.markers) {
        for (const m of ov.markers) {
          allMarkers.push({
            time: m.time as Time,
            position: m.position,
            color: m.color,
            shape: m.shape,
            text: m.text,
          });
        }
      }
    }

    // Apply all collected markers to the candle series.
    // lightweight-charts requires markers to be sorted by time in ascending order.
    if (candleSeriesRef.current) {
      allMarkers.sort((a, b) => {
        const aTime = typeof a.time === 'number' ? a.time : parseInt(a.time as string);
        const bTime = typeof b.time === 'number' ? b.time : parseInt(b.time as string);
        return aTime - bTime;
      });
      candleSeriesRef.current.setMarkers(allMarkers);
    }

    return () => {
      for (const s of overlaySeriesRef.current) {
        try { chart.removeSeries(s); } catch { /* noop */ }
      }
      overlaySeriesRef.current = [];
    };
  }, [overlays, candles]);

  return <div ref={containerRef} className="w-full h-full" />;
}
