export async function readJsonSafe<T>(response: Response): Promise<{ raw: string; payload: T | null }> {
  const raw = await response.text();
  if (!raw) return { raw, payload: null };
  try {
    return { raw, payload: JSON.parse(raw) as T };
  } catch {
    return { raw, payload: null };
  }
}

export type JsonRequestResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 413 };

export async function readJsonRequest<T>(request: Request, maxBytes: number): Promise<JsonRequestResult<T>> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('JSON request byte limit must be a positive safe integer.');
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) return { ok: false, status: 400 };
    if (parsedLength > maxBytes) return { ok: false, status: 413 };
  }
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        void reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }
}
