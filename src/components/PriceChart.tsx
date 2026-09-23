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

export default function PriceChart({ candles, overlays, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<'Line'>[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
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

  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;
    candleSeriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as Time,
        open: c.open, high: c.high, low: c.low, close: c.close,
      })),
    );
  }, [candles]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candleSeriesRef.current) return;

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
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: ov.label,
        });
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
