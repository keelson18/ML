/**
 * Rejects a legacy anon JWT accidentally configured as a privileged server key.
 * New Supabase secret keys are opaque and must be validated by the API itself.
 * This only checks key shape/claims; it does not authenticate a credential.
 */
export function isSupabaseServerKey(key: string): boolean {
  const value = key.trim();
  if (value.startsWith('sb_secret_') && value.length > 'sb_secret_'.length) return true;

  const parts = value.split('.');
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { role?: unknown };
    return claims.role === 'service_role';
  } catch {
    return false;
  }
}
