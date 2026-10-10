import { describe, expect, it } from 'vitest';
import { formatServerTiming } from './server-timing';

describe('formatServerTiming', () => {
  it('formats named durations and clamps negative values', () => {
    expect(formatServerTiming([
      { name: 'provider', durationMs: 12.34 },
      { name: 'total', durationMs: -1 },
    ])).toBe('provider;dur=12.3, total;dur=0.0');
  });
});
