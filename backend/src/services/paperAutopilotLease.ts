import { getSupabaseClient } from '../db';

export interface PaperAccountWriteFence {
  ownerId: string;
  fencingToken: number;
}

export interface PaperAutopilotLease extends PaperAccountWriteFence {
  accountId: string;
  expiresAt: string;
}

export async function claimPaperAutopilotLease(accountId: string, ownerId: string, leaseMs: number): Promise<PaperAutopilotLease | null> {
  const { data, error } = await getSupabaseClient().rpc('claim_paper_autopilot_lease', {
    p_account_id: accountId,
    p_owner_id: ownerId,
    p_lease_ms: leaseMs,
  });
  if (error) throw new Error('Could not claim the durable paper-autopilot lease.');
  const row = Array.isArray(data) ? data[0] as { fencing_token?: unknown; expires_at?: unknown } | undefined : undefined;
  if (!row || !Number.isSafeInteger(Number(row.fencing_token)) || typeof row.expires_at !== 'string') return null;
  return { accountId, ownerId, fencingToken: Number(row.fencing_token), expiresAt: row.expires_at };
}

export async function renewPaperAutopilotLease(lease: PaperAutopilotLease, leaseMs: number): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc('renew_paper_autopilot_lease', {
    p_account_id: lease.accountId,
    p_owner_id: lease.ownerId,
    p_fencing_token: lease.fencingToken,
    p_lease_ms: leaseMs,
  });
  if (error) throw new Error('Could not renew the durable paper-autopilot lease.');
  return data === true;
}

export async function releasePaperAutopilotLease(lease: PaperAutopilotLease): Promise<void> {
  const { error } = await getSupabaseClient().rpc('release_paper_autopilot_lease', {
    p_account_id: lease.accountId,
    p_owner_id: lease.ownerId,
    p_fencing_token: lease.fencingToken,
  });
  if (error) throw new Error('Could not release the durable paper-autopilot lease.');
}
