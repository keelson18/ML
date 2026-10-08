import { describe, expect, it } from 'vitest';
import { filterNewsAtIngestedAt, getNewsProviderStatus, sanitizePlainText, tagMarketSymbols } from './providers';

describe('news provider boundaries', () => {
  it('reports providers as unverified when none are configured', async () => {
    const status = await getNewsProviderStatus();
    expect(status.news[0].availability).toBe('unverified');
    expect(status.calendar[0].availability).toBe('unverified');
  });

  it('sanitizes provider text into bounded plain text', () => {
    expect(sanitizePlainText('<script>alert(1)</script> Fed & rates\nnext', 40)).toBe('alert(1) Fed & rates next');
    expect(sanitizePlainText('x'.repeat(12), 8)).toBe('x'.repeat(8));
  });

  it('tags only active symbols from the market registry', () => {
    expect(tagMarketSymbols(['BTCUSD', 'NOT-A-MARKET', 'BTCUSD'])).toEqual(['BTCUSD']);
  });

  it('excludes news ingested after the replay candle close', () => {
    const items = [
      { id: 'earlier', ingested_at: '2026-10-01T10:00:00.000Z' },
      { id: 'later', ingested_at: '2026-10-01T10:00:01.000Z' },
    ];
    expect(filterNewsAtIngestedAt(items, '2026-10-01T10:00:00.000Z').map((item) => item.id)).toEqual(['earlier']);
  });
});
