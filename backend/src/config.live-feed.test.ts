import { describe, expect, it } from 'vitest';
import { parseLiveFeedConfig } from './config';

describe('live feed configuration', () => {
  it('defaults to disabled streaming and derives streamable symbols from the registry', () => {
    const config = parseLiveFeedConfig();
    expect(config).toMatchObject({
      enabled: false,
      coinbase: { enabled: true, maxSymbols: 20 },
      twelveData: { enabled: true, maxSymbols: 8 },
      maxClients: 100,
      staleMs: 10_000,
      gateway: {
        maxConnectionsPerUser: 2,
        maxSubscriptions: 20,
        maxMessageBytes: 4_096,
        maxBufferedBytes: 262_144,
        ticketTtlMs: 30_000,
        ticketRateLimitMax: 10,
        maxConnectionMs: 900_000,
      },
    });
    expect(config.twelveData.symbols.length).toBeGreaterThan(0);
  });
});
