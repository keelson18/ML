import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '../db';
import { claimPaperAutopilotLease, releasePaperAutopilotLease, renewPaperAutopilotLease } from './paperAutopilotLease';

vi.mock('../db', () => ({ getSupabaseClient: vi.fn() }));

describe('paper autopilot durable lease client', () => {
  const rpc = vi.fn();

  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never);
  });

  it('returns the database fencing token for a successful claim', async () => {
    rpc.mockResolvedValue({ data: [{ fencing_token: 8, expires_at: '2026-10-16T12:00:00Z' }], error: null });

    await expect(claimPaperAutopilotLease('account-uuid', 'worker-uuid', 90_000)).resolves.toEqual({
      accountId: 'account-uuid', ownerId: 'worker-uuid', fencingToken: 8, expiresAt: '2026-10-16T12:00:00Z',
    });
    expect(rpc).toHaveBeenCalledWith('claim_paper_autopilot_lease', {
      p_account_id: 'account-uuid', p_owner_id: 'worker-uuid', p_lease_ms: 90_000,
    });
  });

  it('treats an occupied lease as not acquired and database errors as failures', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(claimPaperAutopilotLease('account-uuid', 'worker-uuid', 90_000)).resolves.toBeNull();
    rpc.mockResolvedValueOnce({ data: null, error: new Error('database unavailable') });
    await expect(claimPaperAutopilotLease('account-uuid', 'worker-uuid', 90_000)).rejects.toThrow(/claim the durable/);
  });

  it('fails closed when renewal says the fence is no longer current and releases by token', async () => {
    const lease = { accountId: 'account-uuid', ownerId: 'worker-uuid', fencingToken: 8, expiresAt: '2026-10-16T12:00:00Z' };
    rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(renewPaperAutopilotLease(lease, 90_000)).resolves.toBe(false);
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(releasePaperAutopilotLease(lease)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenLastCalledWith('release_paper_autopilot_lease', {
      p_account_id: lease.accountId, p_owner_id: lease.ownerId, p_fencing_token: lease.fencingToken,
    });
  });
});
