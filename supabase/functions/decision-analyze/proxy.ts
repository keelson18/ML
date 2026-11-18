const TIMEFRAMES = new Set(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M']);
const SYMBOL_PATTERN = /^[A-Z0-9._-]{1,20}$/;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REQUEST_BYTES = 256 * 1024;

export interface DecisionProxyDependencies {
  backendUrl: string | undefined;
  corsOrigins: string | undefined;
  fetchImpl?: typeof fetch;
}

function configuredOriginList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((entry) => entry.trim()).filter((entry) => {
    try {
      const url = new URL(entry);
      const localDevelopmentOrigin = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
      return url.origin === entry && (url.protocol === 'https:' || localDevelopmentOrigin);
    } catch {
      return false;
    }
  });
}

function corsHeaders(origin: string | null, allowedOrigins: string[]): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Correlation-Id',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (origin && allowedOrigins.includes(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function jsonResponse(body: unknown, status: number, headers: Headers): Response {
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}

function isValidRequest(value: unknown): value is { symbol: string; timeframe: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return typeof request.symbol === 'string'
    && SYMBOL_PATTERN.test(request.symbol)
    && typeof request.timeframe === 'string'
    && TIMEFRAMES.has(request.timeframe);
}

async function readJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; tooLarge: boolean }> {
  const declaredLength = request.headers.get('Content-Length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) return { ok: false, tooLarge: false };
    if (parsedLength > MAX_REQUEST_BYTES) return { ok: false, tooLarge: true };
  }
  if (!request.body) return { ok: false, tooLarge: false };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalLength += value.byteLength;
      if (totalLength > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return { ok: false, tooLarge: true };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, tooLarge: false };
  } finally {
    reader.releaseLock();
  }
}

function backendEndpoint(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const base = new URL(value);
    const local = ['localhost', '127.0.0.1', 'host.docker.internal'].includes(base.hostname);
    if (base.username || base.password || (base.protocol !== 'https:' && !(base.protocol === 'http:' && local))) return null;
    return new URL('/api/v1/decisions/analyze', base);
  } catch {
    return null;
  }
}

export function createDecisionProxyHandler(dependencies: DecisionProxyDependencies) {
  const allowedOrigins = configuredOriginList(dependencies.corsOrigins);
  const endpoint = backendEndpoint(dependencies.backendUrl);
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  return async function handleDecisionProxy(request: Request): Promise<Response> {
    const origin = request.headers.get('Origin');
    const headers = corsHeaders(origin, allowedOrigins);
    if (origin && !allowedOrigins.includes(origin)) return jsonResponse({ error: 'Origin is not allowed.' }, 403, headers);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, headers);

    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ') || authorization.length <= 7) {
      return jsonResponse({ error: 'Authentication required.' }, 401, headers);
    }

    const parsedBody = await readJsonBody(request);
    if (!parsedBody.ok) return jsonResponse({ error: parsedBody.tooLarge ? 'Request body is too large.' : 'Request body must be valid JSON.' }, parsedBody.tooLarge ? 413 : 400, headers);
    const body = parsedBody.value;
    if (!isValidRequest(body)) return jsonResponse({ error: 'A known symbol and supported timeframe are required.' }, 400, headers);
    if (!endpoint) return jsonResponse({ error: 'Canonical decision service is not configured.' }, 503, headers);

    const requestedCorrelationId = request.headers.get('X-Correlation-Id');
    const correlationId = requestedCorrelationId && /^[A-Za-z0-9._:-]{1,100}$/.test(requestedCorrelationId)
      ? requestedCorrelationId : crypto.randomUUID();
    headers.set('X-Correlation-Id', correlationId);

    try {
      const upstream = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authorization,
          'X-Correlation-Id': correlationId,
        },
        body: JSON.stringify({ symbol: body.symbol, timeframe: body.timeframe }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const result = await upstream.json().catch(() => null);
      if (result === null) return jsonResponse({ error: 'Canonical decision service returned an invalid response.' }, 502, headers);
      return jsonResponse(result, upstream.status, headers);
    } catch {
      return jsonResponse({ error: 'Canonical decision service is unavailable.' }, 502, headers);
    }
  };
}
