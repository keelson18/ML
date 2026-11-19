import type { MarketType, Timeframe } from '../../lib/types';
import { MARKET_TYPES, TIMEFRAMES } from '../../lib/types';

interface CommonProps {
  id?: string;
  className?: string;
  ariaLabel: string;
}

export function MarketTypeSelect({ id, className, ariaLabel, value, onChange, showIcon = false }: CommonProps & {
  value: MarketType;
  onChange: (value: MarketType) => void;
  showIcon?: boolean;
}) {
  return (
    <select id={id} aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value as MarketType)} className={className}>
      {MARKET_TYPES.map((item) => <option key={item.value} value={item.value}>{showIcon ? `${item.icon} ${item.label}` : item.label}</option>)}
    </select>
  );
}

export function MarketSymbolSelect({ id, className, ariaLabel, value, onChange, markets }: CommonProps & {
  value: string;
  onChange: (symbol: string) => void;
  markets: Array<{ symbol: string; label: string }>;
}) {
  return (
    <select id={id} aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} className={className}>
      {markets.map((market) => <option key={market.symbol} value={market.symbol}>{market.label}</option>)}
    </select>
  );
}

export function TimeframeSelect({ id, className, ariaLabel, value, onChange }: CommonProps & {
  value: Timeframe;
  onChange: (timeframe: Timeframe) => void;
}) {
  return (
    <select id={id} aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value as Timeframe)} className={className}>
      {TIMEFRAMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
  );
}

export function TimeframeButtons({ value, onChange, ariaLabel = 'Chart timeframe' }: {
  value: Timeframe;
  onChange: (timeframe: Timeframe) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="dashboard-timeframes" aria-label={ariaLabel}>
      {TIMEFRAMES.map((item) => (
        <button key={item.value} type="button" onClick={() => onChange(item.value)} aria-pressed={value === item.value} className={value === item.value ? 'is-active' : ''}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
