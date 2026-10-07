import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { paperRoutes } from './paper';

async function createApp() {
  const app = Fastify();
  app.decorateRequest('authenticatedUserId', null);
  app.decorateRequest('accessToken', null);
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers.authorization !== 'Bearer test-token') return reply.code(401).send({ error: 'Authentication required.' });
    request.authenticatedUserId = 'user-123';
    request.accessToken = 'test-token';
  });
  await app.register(paperRoutes);
  await app.ready();
  return app;
}

describe('paper trade route', () => {
  it('rejects immediate execution and requires the plan trigger workflow', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/paper/execute',
      headers: { authorization: 'Bearer test-token' },
      payload: { symbol: 'BTCUSD', timeframe: '15m' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'Immediate paper execution is disabled. Create a plan and wait for a confirmed trigger.' });
    await app.close();
  });

  it('validates market and timeframe before refusing the legacy order path', async () => {
    const app = await createApp();
    const badSymbol = await app.inject({ method: 'POST', url: '/api/v1/paper/execute', headers: { authorization: 'Bearer test-token' }, payload: { symbol: 'INVALID', timeframe: '15m' } });
    const badTimeframe = await app.inject({ method: 'POST', url: '/api/v1/paper/execute', headers: { authorization: 'Bearer test-token' }, payload: { symbol: 'BTCUSD', timeframe: 'bad' } });
    expect(badSymbol.statusCode).toBe(400);
    expect(badTimeframe.statusCode).toBe(400);
    await app.close();
  });
});
