import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Candle } from '../lib/types';
import PriceChart from './PriceChart';

describe('PriceChart', () => {
  it('renders candle values without layer controls or chart-only drawings', () => {
    const candle: Candle = {
      time: 1_767_225_600,
      open: 99,
      high: 102,
      low: 98,
      close: 101,
      volume: 12,
    };
    const markup = renderToStaticMarkup(<PriceChart candles={[candle]} theme="dark" />);

    expect(markup).toContain('role="img"');
    expect(markup).toContain('Price chart with 1 bar. Latest close: 101.');
    expect(markup).toContain('Latest chart values');
    expect(markup).toContain('<td>99</td><td>102</td><td>98</td><td>101</td>');
    expect(markup).not.toContain('Chart layers');
    expect(markup).not.toContain('Structure');
    expect(markup).not.toContain('Zones');
    expect(markup).not.toContain('Signals');
    expect(markup).not.toContain('Trade levels');
    expect(markup).not.toContain('Trades');
    expect(markup).not.toContain('<svg');
  });
});
