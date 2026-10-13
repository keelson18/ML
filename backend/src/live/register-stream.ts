import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { WindowLimiter } from '../utils/limits';
import { CoinbaseFeed } from './coinbase-feed';
import { createFeedRouter } from './feed-router';
import { StreamGateway } from './stream-gateway';
import { TicketStore } from './stream-tickets';
import type { LiveFeed } from './types';

let activeGateway: StreamGateway | undefined;

export function getLiveFeedDiagnostics() {
  return activeGateway?.feedDiagnostics() ?? null;
}

export function registerLiveStream(app: FastifyInstance, allowedOrigins: readonly string[]): void {
  const live = config.liveFeed;
  const feeds: LiveFeed[] = live.coinbase.enabled
    ? [new CoinbaseFeed({ maxSymbols: live.coinbase.maxSymbols, staleMs: live.staleMs })]
    : [];
  const tickets = new TicketStore(live.gateway.ticketTtlMs);
  const gateway = new StreamGateway({
    feeds,
    router: createFeedRouter(feeds),
    tickets,
    allowedOrigins,
    maxClients: live.maxClients,
    maxConnectionsPerUser: live.gateway.maxConnectionsPerUser,
    maxSubscriptions: live.gateway.maxSubscriptions,
    maxMessageBytes: live.gateway.maxMessageBytes,
    maxBufferedBytes: live.gateway.maxBufferedBytes,
    maxConnectionMs: live.gateway.maxConnectionMs,
  });
  const ticketLimiter = new WindowLimiter(live.gateway.ticketRateLimitMax, config.rateLimitWindowMs);
  activeGateway = gateway;

  app.post('/api/v1/stream/ticket', { preHandler: app.requireAuth }, async (request, reply) => {
    const userId = request.authenticatedUserId;
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    if (!ticketLimiter.consume(userId)) return reply.code(429).send({ error: 'Too many stream tickets requested.' });
    return tickets.issue(userId);
  });

  gateway.attach(app.server);
  app.addHook('onClose', async () => {
    if (activeGateway === gateway) activeGateway = undefined;
    await gateway.close();
  });
}
