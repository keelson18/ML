// Keep backend import paths stable while sharing candle-boundary logic with the browser.
export { candleIndex, candleSeconds, isClosed, latestClosedCandleTime, nextBoundary, selectClosedCandles } from '../../../src/lib/candle-clock';
