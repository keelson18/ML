import { describe, expect, it } from 'vitest';
import { readJsonRequest } from './http';

describe('bounded JSON request parsing', () => {
  it('parses a complete valid UTF-8 JSON request within its byte limit', async () => {
    const request = new Request('https://edge.example.test/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pair: 'BTCUSD', timeframe: '1h' }),
    });
    await expect(readJsonRequest<{ pair: string }>(request, 128)).resolves.toEqual({
      ok: true,
      value: { pair: 'BTCUSD', timeframe: '1h' },
    });
  });

  it('rejects malformed JSON and invalid UTF-8', async () => {
    const malformed = new Request('https://edge.example.test/predict', { method: 'POST', body: '{invalid' });
    await expect(readJsonRequest(malformed, 128)).resolves.toEqual({ ok: false, status: 400 });
    const invalidUtf8 = new Request('https://edge.example.test/predict', {
      method: 'POST',
      body: new Uint8Array([0xc3, 0x28]),
    });
    await expect(readJsonRequest(invalidUtf8, 128)).resolves.toEqual({ ok: false, status: 400 });
  });

  it('rejects both oversized declared bodies and streams that exceed the limit', async () => {
    const declaredOversize = new Request('https://edge.example.test/predict', {
      method: 'POST',
      headers: { 'Content-Length': '129' },
      body: 'x',
    });
    await expect(readJsonRequest(declaredOversize, 128)).resolves.toEqual({ ok: false, status: 413 });
    const streamedOversize = new Request('https://edge.example.test/predict', {
      method: 'POST',
      body: ' '.repeat(256),
    });
    await expect(readJsonRequest(streamedOversize, 128)).resolves.toEqual({ ok: false, status: 413 });
  });

  it('rejects missing request bodies and invalid byte limits', async () => {
    const missingBody = new Request('https://edge.example.test/predict', { method: 'POST' });
    await expect(readJsonRequest(missingBody, 128)).resolves.toEqual({ ok: false, status: 400 });
    await expect(readJsonRequest(missingBody, 0)).rejects.toThrow(/positive safe integer/);
  });
});
