import { resolveCorsOrigin } from './cors';

describe('resolveCorsOrigin', () => {
  it('allows only an exact origin from the configured allowlist', () => {
    expect(resolveCorsOrigin('https://app.example.com', 'https://app.example.com, https://admin.example.com'))
      .toBe('https://app.example.com');
    expect(resolveCorsOrigin('https://untrusted.example.com', 'https://app.example.com')).toBeUndefined();
  });

  it('allows local development preview ports only when enabled', () => {
    expect(resolveCorsOrigin('http://localhost:48752', 'http://localhost:5173', true)).toBe('http://localhost:48752');
    expect(resolveCorsOrigin('http://localhost:48752', 'http://localhost:5173')).toBeUndefined();
    expect(resolveCorsOrigin('http://example.com:48752', 'http://localhost:5173', true)).toBeUndefined();
  });

  it('rejects malformed origins and requests without an origin', () => {
    expect(resolveCorsOrigin('not-an-origin', 'https://app.example.com')).toBeUndefined();
    expect(resolveCorsOrigin(null, 'https://app.example.com')).toBeUndefined();
  });
});
