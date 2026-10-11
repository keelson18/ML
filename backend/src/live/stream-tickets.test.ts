import { describe, expect, it } from 'vitest';
import { TicketStore } from './stream-tickets';

describe('TicketStore', () => {
  it('redeems a ticket once for its user', () => {
    const store = new TicketStore(30_000);
    const { ticket } = store.issue('user-1');
    expect(store.redeem(ticket)).toBe('user-1');
    expect(store.redeem(ticket)).toBeUndefined();
  });

  it('rejects expired tickets', () => {
    let now = 1_000;
    const store = new TicketStore(30_000, () => now);
    const { ticket } = store.issue('user-1');
    now += 30_001;
    expect(store.redeem(ticket)).toBeUndefined();
  });

  it('rejects tickets that were never issued', () => {
    expect(new TicketStore(30_000).redeem('forged')).toBeUndefined();
  });
});
