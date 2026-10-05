import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { AutonomousPipeline } from '../autonomy/pipeline';
import { config } from '../config';
import { decisionRoutes } from './decisions';

async function createApp() {
  const app = Fastify();
  app.decorateRequest('authenticatedUserId', null);
  app.decorateRequest('accessToken', null);
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.slice('Bearer '.length);
    if (!token) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }
    request.authenticatedUserId = token;
    request.accessToken = token;
  });
  app.decorate('requireAdmin', app.requireAuth);
  await app.register(rateLimit, {
    global: false,
    hook: 'preHandler',
    max: config.marketRateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    keyGenerator: (request) => request.authenticatedUserId ?? request.ip,
    errorResponseBuilder: () => ({ statusCode: 429, error: 'Too Many Requests', message: 'Too many requests. Please try again later.' }),
  });
  await app.register(decisionRoutes, new AutonomousPipeline({ symbols: [] }));
  await app.ready();
  return app;
}

describe('decision analysis rate limit', () => {
  it('uses the stricter authenticated per-user quota', async () => {
    const app = await createApp();
    let response = await app.inject({
      method: 'POST',
      url: '/api/v1/decisions/analyze',
      headers: { authorization: 'Bearer test-user' },
      payload: {},
    });
    for (let index = 1; index <= config.analyzeRateLimitMax; index += 1) {
      response = await app.inject({
        method: 'POST',
        url: '/api/v1/decisions/analyze',
        headers: { authorization: 'Bearer test-user' },
        payload: {},
      });
    }

    expect(response?.statusCode).toBe(429);
    expect(response?.json()).toEqual({ statusCode: 429, error: 'Too Many Requests', message: 'Too many requests. Please try again later.' });
    await app.close();
  });
});
