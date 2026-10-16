import PriceChart from './PriceChart';
import type { Candle, Timeframe, Overlay } from '../lib/types';
import { useEffect, useRef, useState } from 'react';
import { fetchChartTradeHistory, type ChartTradeHistory } from '../lib/backend-api';
import { DEFAULT_CHART_LAYERS, workspaceApi, type UserPreferences } from '../api/workspace';

interface Props {
  symbol: string;
  marketType: string;
  candles: Candle[];
  overlays: Overlay[];
  timeframe: Timeframe;
  theme: 'light' | 'dark';
  wsStatus: string;
}

export default function TradingTerminal({ symbol, candles, overlays, theme }: Props) {
  const [history, setHistory] = useState<ChartTradeHistory | null>(null);
  const [layers, setLayers] = useState<UserPreferences['chartLayers']>(DEFAULT_CHART_LAYERS);
  const layersRef = useRef(layers);
  const saveQueue = useRef(Promise.resolve());
  const [layerSaveError, setLayerSaveError] = useState(false);
  useEffect(() => {
    let active = true;
    void workspaceApi.getPreferences().then((preferences) => { if (active && preferences) { layersRef.current = preferences.chartLayers; setLayers(preferences.chartLayers); } }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const updateLayer = (key: keyof UserPreferences['chartLayers']) => {
    const next = { ...layersRef.current, [key]: !layersRef.current[key] };
    layersRef.current = next;
    setLayers(next);
    saveQueue.current = saveQueue.current.then(() => workspaceApi.saveChartLayers(layersRef.current))
      .then(() => setLayerSaveError(false)).catch(() => setLayerSaveError(true));
  };
  useEffect(() => {
    let active = true;
    const refresh = () => fetchChartTradeHistory(symbol).then((data) => { if (active) setHistory(data); }).catch(() => {
      if (active) setHistory((current) => current?.symbol === symbol ? current : null);
    });
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [symbol]);
  return <PriceChart candles={candles} overlays={overlays} theme={theme} trades={history?.trades ?? []} positions={history?.positions ?? []} journal={history?.journal ?? []} layers={layers} onToggleLayer={updateLayer} layerSaveError={layerSaveError} />;
}
