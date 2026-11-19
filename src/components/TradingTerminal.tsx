import { useMemo } from 'react';
import PriceChart from './PriceChart';
import { movingAverageOverlay } from './price-chart-overlays';
import type { Candle } from '../lib/types';

interface Props {
  candles: Candle[];
  theme: 'light' | 'dark';
}

export default function TradingTerminal({ candles, theme }: Props) {
  const overlays = useMemo(() => {
    const average = movingAverageOverlay(candles, 20);
    return average ? [average] : [];
  }, [candles]);

  return <PriceChart candles={candles} theme={theme} overlays={overlays} />;
}
