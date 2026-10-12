import { afterEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.hoisted(() => vi.fn(() => ({ created: true })));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import { getSupabaseClientWithToken } from './db';

const originalUrl = config.supabaseUrl;
const originalAnonKey = config.supabaseAnonKey;

afterEach(() => {
  config.supabaseUrl = originalUrl;
  config.supabaseAnonKey = originalAnonKey;
  vi.mocked(createClient).mockClear();
});

describe('user-scoped Supabase clients', () => {
  it('creates request-scoped clients without caching access tokens', () => {
    config.supabaseUrl = 'https://project.example.test';
    config.supabaseAnonKey = 'public-test-key';

    const first = getSupabaseClientWithToken('access-token-a');
    const second = getSupabaseClientWithToken('access-token-a');

    expect(first).not.toBe(second);
    expect(createClient).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createClient).mock.calls[0]).toEqual([
      'https://project.example.test',
      'public-test-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: 'Bearer access-token-a' } },
      },
    ]);
  });

  it('fails clearly when public Supabase configuration is missing', () => {
    config.supabaseUrl = '';
    config.supabaseAnonKey = '';

    expect(() => getSupabaseClientWithToken('access-token-a'))
      .toThrow('Supabase user-scoped access requires SUPABASE_URL and SUPABASE_ANON_KEY.');
    expect(createClient).not.toHaveBeenCalled();
  });
});
