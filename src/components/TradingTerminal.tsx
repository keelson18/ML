import PriceChart from './PriceChart';
import type { Candle, Timeframe, Overlay } from '../lib/types';

interface Props {
  symbol: string;
  marketType: string;
  candles: Candle[];
  overlays: Overlay[];
  timeframe: Timeframe;
  theme: 'light' | 'dark';
  wsStatus: string;
}

export default function TradingTerminal({ candles, overlays, theme }: Props) {
  return <PriceChart candles={candles} overlays={overlays} theme={theme} />;
}
