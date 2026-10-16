import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BacktestingCenter from './BacktestingCenter';

describe('BacktestingCenter', () => {
  it('presents the registered server-side holdout workflow without browser simulation results', () => {
    const markup = renderToStaticMarkup(<BacktestingCenter
      candles={[]}
      timeframe="1h"
      symbol="BTCUSD"
      theme="dark"
      marketLoading={false}
      marketError={null}
      onRetryMarketData={() => undefined}
    />);

    expect(markup).toContain('canonical paper planner');
    expect(markup).toContain('Falsifiable hypothesis');
    expect(markup).toContain('Register and start collection');
    expect(markup).toContain('90 forward days and 100 trades');
    expect(markup).not.toContain('Run backtest');
    expect(markup).not.toContain('Equity Curve');
  });
});
