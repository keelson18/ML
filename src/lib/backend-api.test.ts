import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCanonicalMarketData } from './backend-api';
import { supabase } from './supabase';

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
    error: null,
  } as Awaited<ReturnType<typeof supabase.auth.getSession>>);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('authenticated backend responses', () => {
  it('reports an empty successful response clearly', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    await expect(fetchCanonicalMarketData('BTCUSD', '1h')).rejects.toThrow(
      'The backend returned an empty or invalid response.',
    );
  });

  it('reports an empty server error as an unreachable backend', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));
    await expect(fetchCanonicalMarketData('BTCUSD', '1h')).rejects.toThrow(
      'The trading backend is unreachable. Check that it is running, then retry.',
    );
  });

  it('does not expose an HTML proxy error body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>upstream details</html>', { status: 502 }));
    await expect(fetchCanonicalMarketData('BTCUSD', '1h')).rejects.toThrow(
      'The trading backend is unreachable. Check that it is running, then retry.',
    );
  });

  it('prefers the backend error message', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Invalid request.' }), { status: 400 }));
    await expect(fetchCanonicalMarketData('BTCUSD', '1h')).rejects.toThrow('Invalid request.');
  });

  it('returns valid JSON payloads', async () => {
    const marketData = { symbol: 'BTCUSD', timeframe: '1h', candles: [], fetchedAt: 1, stale: false };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(marketData), { status: 200 }));
    await expect(fetchCanonicalMarketData('BTCUSD', '1h')).resolves.toEqual(marketData);
  });

  it('preserves the backend authentication error', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401 }));
    await expect(fetchCanonicalMarketData('BTCUSD', '1h')).rejects.toThrow('Authentication required.');
  });
});
