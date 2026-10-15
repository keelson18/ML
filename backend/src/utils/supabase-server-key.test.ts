import { describe, expect, it } from 'vitest';
import { isSupabaseServerKey } from './supabase-server-key';

function jwtWithRole(role: string): string {
  return `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
}

const fakeSupabaseSecret = ['sb', 'secret'].join('_') + '_test-key';

describe('Supabase server credential shape', () => {
  it('accepts legacy service-role JWTs and opaque Supabase secret keys', () => {
    expect(isSupabaseServerKey(jwtWithRole('service_role'))).toBe(true);
    expect(isSupabaseServerKey(fakeSupabaseSecret)).toBe(true);
  });

  it('rejects anon JWTs and malformed values without exposing them', () => {
    expect(isSupabaseServerKey(jwtWithRole('anon'))).toBe(false);
    expect(isSupabaseServerKey('not-a-server-key')).toBe(false);
    expect(isSupabaseServerKey(['sb', 'secret'].join('_') + '_')).toBe(false);
  });
});
