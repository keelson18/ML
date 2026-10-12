import { Buffer } from 'node:buffer';

const symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD'];
const state = { accountId: 'scripted-budget-account', cash: 94_950, positions: [{ id: 'position-1', symbol: 'BTCUSD', status: 'open', entryPrice: 50_000, quantity: 0.1, entryFee: 5 }], trades: [], tradePlans: [], pendingPaperOrders: [], tradeJournal: [], dailyReviews: [], executionGateResults: [], processedCandles: {} };
const eventBytes = [];
const oldSnapshotBytes = [];
const initialSnapshotBytes = Buffer.byteLength(JSON.stringify(state));
let oldBytes = 0;
let sequence = 0;
for (let candle = 0; candle < 288; candle++) {
  for (const symbol of symbols) {
    const time = 1_791_000_000 + candle * 300;
    state.processedCandles[`${symbol}:manager:5m`] = time;
    const fullState = JSON.stringify(state);
    oldSnapshotBytes.push(Buffer.byteLength(fullState));
    oldBytes += Buffer.byteLength(fullState);
    const payload = { symbol, timeframe: '5m', candleTime: time, result: 'NO_TRADE', reason: 'No qualifying trigger.' };
    const row = { idempotencyKey: `gate:${symbol}:5m:${time}`, eventType: 'NO_TRADE', payload };
    const bytes = Buffer.byteLength(JSON.stringify(row));
    eventBytes.push(bytes);
    sequence++;
  }
}
const newBytes = initialSnapshotBytes + eventBytes.reduce((sum, bytes) => sum + bytes, 0);
console.log(JSON.stringify({
  workload: { symbols: symbols.length, openPositions: 1, closedCandlesPerSymbol: 288, hours: 24 },
  before: { ledgerRows: sequence, jsonPayloadBytes: oldBytes },
  after: { ledgerRows: sequence + 1, jsonPayloadBytes: newBytes },
  note: 'UTF-8 JSON payload bytes only; excludes PostgreSQL tuple/index/WAL overhead. After-model has one initial snapshot plus one NO_TRADE decision event per processed candle; scheduled and trade-triggered snapshots are additional when due.'
}, null, 2));
