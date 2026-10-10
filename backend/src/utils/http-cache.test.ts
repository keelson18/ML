import { describe, expect, it } from 'vitest';
import { etagFor, matchesEtag } from './http-cache';

describe('http cache helpers', () => {
  it('derives a stable strong ETag from the body', () => {
    expect(etagFor('{"a":1}')).toBe(etagFor('{"a":1}'));
    expect(etagFor('{"a":1}')).not.toBe(etagFor('{"a":2}'));
    expect(etagFor('{}')).toMatch(/^"[A-Za-z0-9_-]+"$/);
  });

  it('matches single, listed, and wildcard If-None-Match values only', () => {
    const etag = etagFor('{}');
    expect(matchesEtag(etag, etag)).toBe(true);
    expect(matchesEtag(`"other", ${etag}`, etag)).toBe(true);
    expect(matchesEtag('*', etag)).toBe(true);
    expect(matchesEtag('"other"', etag)).toBe(false);
    expect(matchesEtag(undefined, etag)).toBe(false);
  });
});
