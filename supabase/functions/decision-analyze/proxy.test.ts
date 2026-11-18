import { describe, expect, it, vi } from 'vitest';
import { createDecisionProxyHandler } from './proxy';

const BACKEND_URL = 'https://api.example.com';
const ORIGIN = 'https://app.example.com';
const BODY = { symbol: 'BTCUSD', timeframe: '1h' };

function post(body: unknown = BODY, headers: Record<string, string> = {}) {
  return new Request('https://functions.example.com/decision-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-jwt', Origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function responseFetch(status = 200, value: unknown = { decision: { result: { decision: 'NO_TRADE' } } }) {
  return vi.fn(async () => new Response(JSON.stringify(value), { status }));
}

describe('canonical decision compatibility proxy', () => {
  it('allows preflight only for a configured origin', async () => {
    const handle = createDecisionProxyHandler({ backendUrl: BACKEND_URL, corsOrigins: ORIGIN, fetchImpl: responseFetch() });
    const allowed = await handle(new Request('https://functions.example.com/decision-analyze', { method: 'OPTIONS', headers: { Origin: ORIGIN } }));
    const denied = await handle(new Request('https://functions.example.com/decision-analyze', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }));
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(denied.status).toBe(403);
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rejects unsupported methods, missing bearer tokens, and malformed requests before fetching', async () => {
    const fetchImpl = responseFetch();
    const handle = createDecisionProxyHandler({ backendUrl: BACKEND_URL, corsOrigins: ORIGIN, fetchImpl });
    const get = await handle(new Request('https://functions.example.com/decision-analyze', { method: 'GET', headers: { Origin: ORIGIN } }));
    const anonymous = await handle(post(BODY, { Authorization: '' }));
    const invalidMarket = await handle(post({ symbol: 'BTCUSD', timeframe: '2h' }));
    const invalidJson = await handle(post('{broken'));
    expect(get.status).toBe(405);
    expect(anonymous.status).toBe(401);
    expect(invalidMarket.status).toBe(400);
    expect(invalidJson.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('bounds the request body even when the caller supplies an excessive Content-Length', async () => {
    const fetchImpl = responseFetch();
    const handle = createDecisionProxyHandler({ backendUrl: BACKEND_URL, corsOrigins: ORIGIN, fetchImpl });
    const response = await handle(post(BODY, { 'Content-Length': String(256 * 1024 + 1) }));
    const streamed = await handle(post({ ...BODY, unused: 'x'.repeat(256 * 1024) }));
    expect(response.status).toBe(413);
    expect(streamed.status).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses an unconfigured or insecure backend instead of running local decision math', async () => {
    const fetchImpl = responseFetch();
    const unconfigured = createDecisionProxyHandler({ backendUrl: undefined, corsOrigins: ORIGIN, fetchImpl });
    const insecure = createDecisionProxyHandler({ backendUrl: 'http://api.example.com', corsOrigins: ORIGIN, fetchImpl });
    expect((await unconfigured(post())).status).toBe(503);
    expect((await insecure(post())).status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('forwards only symbol and timeframe with the caller token and a safe correlation ID', async () => {
    const fetchImpl = responseFetch();
    const handle = createDecisionProxyHandler({ backendUrl: BACKEND_URL, corsOrigins: ORIGIN, fetchImpl });
    const legacyPayload = { ...BODY, candles: Array.from({ length: 400 }, () => ({ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 })) };
    const response = await handle(post(legacyPayload, { 'X-Correlation-Id': 'flow:analysis-42' }));
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(response.status).toBe(200);
    expect(String(url)).toBe(`${BACKEND_URL}/api/v1/decisions/analyze`);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer user-jwt', 'X-Correlation-Id': 'flow:analysis-42' });
    expect(JSON.parse(String(init.body))).toEqual(BODY);
    expect(response.headers.get('X-Correlation-Id')).toBe('flow:analysis-42');
  });

  it('forwards canonical error status and payload without exposing a second decision implementation', async () => {
    const fetchImpl = responseFetch(503, { error: 'Fresh market data is unavailable; analysis is blocked.' });
    const handle = createDecisionProxyHandler({ backendUrl: BACKEND_URL, corsOrigins: ORIGIN, fetchImpl });
    const response = await handle(post());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Fresh market data is unavailable; analysis is blocked.' });
  });

  it('returns generic gateway failures for network and invalid upstream responses', async () => {
    const network = createDecisionProxyHandler({ backendUrl: BACKEND_URL, corsOrigins: ORIGIN, fetchImpl: vi.fn(async () => { throw new Error('secret upstream detail'); }) });
    const invalidJson = createDecisionProxyHandler({ backendUrl: BACKEND_URL, corsOrigins: ORIGIN, fetchImpl: vi.fn(async () => new Response('not-json', { status: 200 })) });
    const networkResponse = await network(post());
    const invalidResponse = await invalidJson(post());
    expect(networkResponse.status).toBe(502);
    expect(await networkResponse.json()).toEqual({ error: 'Canonical decision service is unavailable.' });
    expect(invalidResponse.status).toBe(502);
    expect(await invalidResponse.json()).toEqual({ error: 'Canonical decision service returned an invalid response.' });
  });
});
