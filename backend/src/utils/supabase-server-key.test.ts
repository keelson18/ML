import { describe, expect, it } from 'vitest';
import { isSupabaseServerKey } from './supabase-server-key';

function jwtWithRole(role: string): string {
  return `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
}

describe('Supabase server credential shape', () => {
  it('accepts legacy service-role JWTs and opaque Supabase secret keys', () => {
    expect(isSupabaseServerKey(jwtWithRole('service_role'))).toBe(true);
    expect(isSupabaseServerKey('sb_secret_test-key')).toBe(true);
  });

  it('rejects anon JWTs and malformed values without exposing them', () => {
    expect(isSupabaseServerKey(jwtWithRole('anon'))).toBe(false);
    expect(isSupabaseServerKey('not-a-server-key')).toBe(false);
    expect(isSupabaseServerKey('sb_secret_')).toBe(false);
  });
});
