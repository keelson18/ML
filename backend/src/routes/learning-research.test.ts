import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { learningResearchRoutes } from './learning-research';

const dbMocks = vi.hoisted(() => ({ getSupabaseClientWithToken: vi.fn() }));
vi.mock('../db', () => ({ getSupabaseClientWithToken: dbMocks.getSupabaseClientWithToken }));

const TEST_ID = 'a1b2c3d4-1111-4111-8111-111111111111';
let insert: ReturnType<typeof vi.fn>;

async function createApp() {
  const app = Fastify();
  app.decorateRequest('authenticatedUserId', null);
  app.decorateRequest('accessToken', null);
  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.slice('Bearer '.length);
    if (!token) return reply.code(401).send({ error: 'Authentication required.' });
    request.authenticatedUserId = 'authenticated-user';
    request.accessToken = token;
  });
  await app.register(learningResearchRoutes);
  await app.ready();
  return app;
}

describe('learning and research persistence routes', () => {
  beforeEach(() => {
    insert = vi.fn().mockReturnThis();
    const query = {
      insert,
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: TEST_ID }, error: null }),
    };
    dbMocks.getSupabaseClientWithToken.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
  });

  it('stores an authenticated owner learning event as hypothesis without client status escalation', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/learning/events', headers: { authorization: 'Bearer session-token' },
      payload: { sourceType: 'paper_trade', observation: { result: 'loss' }, hypothesis: 'Review the setup after a loss.' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: TEST_ID });
    expect(dbMocks.getSupabaseClientWithToken).toHaveBeenCalledWith('session-token');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'authenticated-user', status: 'hypothesis' }));
    await app.close();
  });

  it('rejects client supplied status and user ownership fields', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/learning/events', headers: { authorization: 'Bearer session-token' },
      payload: { userId: 'other-user', sourceType: 'research', observation: {}, hypothesis: 'Test', status: 'approved' },
    });
    expect(response.statusCode).toBe(400);
    expect(insert).not.toHaveBeenCalled();
    await app.close();
  });

  it('creates research metadata as a draft and restricts parameter keys', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/research/experiments', headers: { authorization: 'Bearer session-token' },
      payload: {
        name: 'test-run', hypothesis: 'Test the setup', datasetId: 'provider:dataset-v1',
        parameters: { trainingEndIndex: 30, testStartIndex: 30, transactionCostRate: 0.001, slippageRate: 0.001 },
      },
    });
    expect(response.statusCode).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'authenticated-user', status: 'draft' }));
    await app.close();
  });
});
