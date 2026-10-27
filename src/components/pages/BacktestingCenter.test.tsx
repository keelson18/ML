import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BacktestingCenter from './BacktestingCenter';

describe('BacktestingCenter', () => {
  it('shows the requested exploratory backtest controls and paper-only caveat', () => {
    const markup = renderToStaticMarkup(<BacktestingCenter
      candles={[]}
      timeframe="1h"
      symbol="BTCUSD"
      theme="dark"
      marketLoading={false}
      marketError={null}
      onRetryMarketData={() => undefined}
    />);

    expect(markup).toContain('Backtesting Center');
    expect(markup).toContain('Strategy');
    expect(markup).toContain('BTCUSD');
    expect(markup).toContain('Initial Capital');
    expect(markup).toContain('Exploratory results only');
    expect(markup).toContain('Equity Curve');
    expect(markup).toContain('Trade History');
  });

  it('shows an explicit feed error and retry action when historical market data is unavailable', () => {
    const markup = renderToStaticMarkup(<BacktestingCenter
      candles={[]}
      timeframe="1h"
      symbol="BTCUSD"
      theme="dark"
      marketLoading={false}
      marketError="Provider availability is unverified."
      onRetryMarketData={() => undefined}
    />);

    expect(markup).toContain('Market data unavailable: Provider availability is unverified.');
    expect(markup).toContain('Retry feed');
  });
});
