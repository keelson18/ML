import { randomBytes } from 'node:crypto';

interface IssuedTicket {
  userId: string;
  expiresAt: number;
}

export class TicketStore {
  private readonly tickets = new Map<string, IssuedTicket>();

  constructor(private readonly ttlMs: number, private readonly now: () => number = Date.now) {}

  issue(userId: string): { ticket: string; expiresAt: string } {
    this.prune();
    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + this.ttlMs;
    this.tickets.set(ticket, { userId, expiresAt });
    return { ticket, expiresAt: new Date(expiresAt).toISOString() };
  }

  redeem(ticket: string): string | undefined {
    const entry = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!entry || entry.expiresAt < this.now()) return undefined;
    return entry.userId;
  }

  private prune(): void {
    const now = this.now();
    for (const [ticket, entry] of this.tickets) {
      if (entry.expiresAt < now) this.tickets.delete(ticket);
    }
  }
}
