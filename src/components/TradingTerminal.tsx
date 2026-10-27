import PriceChart from './PriceChart';
import type { Candle } from '../lib/types';

interface Props {
  candles: Candle[];
  theme: 'light' | 'dark';
}

export default function TradingTerminal({ candles, theme }: Props) {
  return <PriceChart candles={candles} theme={theme} />;
}
