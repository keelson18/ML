import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../config';
import { hasConfiguredProbeProvider } from './market-availability';

describe('market availability probe configuration', () => {
  const originalMassiveKey = config.massiveApiKey;
  const originalTwelveDataKey = config.twelveDataApiKey;

  afterEach(() => {
    config.massiveApiKey = originalMassiveKey;
    config.twelveDataApiKey = originalTwelveDataKey;
  });

  it('allows probing a Twelve Data market without a Massive key', () => {
    config.massiveApiKey = '';
    config.twelveDataApiKey = 'test-twelve-data-key';
    expect(hasConfiguredProbeProvider(['BTCUSD'])).toBe(true);
  });

  it('requires a key for at least one configured market provider', () => {
    config.massiveApiKey = '';
    config.twelveDataApiKey = '';
    expect(hasConfiguredProbeProvider(['BTCUSD'])).toBe(false);
  });
});
