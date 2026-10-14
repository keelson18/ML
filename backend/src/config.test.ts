import { describe, expect, it } from 'vitest';
import { parseAutonomousTradingEnabled } from './config';

describe('AUTONOMOUS_TRADING configuration', () => {
  it('defaults to disabled and accepts only explicit boolean strings', () => {
    expect(parseAutonomousTradingEnabled(undefined)).toBe(false);
    expect(parseAutonomousTradingEnabled('false')).toBe(false);
    expect(parseAutonomousTradingEnabled('true')).toBe(true);
  });

  it('fails startup validation for ambiguous values', () => {
    expect(() => parseAutonomousTradingEnabled('yes')).toThrow('AUTONOMOUS_TRADING must be either true or false.');
  });
});
