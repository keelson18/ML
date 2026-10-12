import { describe, expect, it } from 'vitest';
import { assertSafeViteEnvironment } from './vite-env-safety';

describe('Vite client environment safety', () => {
  it('allows a public anon key that differs from the server service-role key', () => {
    expect(() => assertSafeViteEnvironment({
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-value',
      VITE_SUPABASE_ANON_KEY: 'public-anon-value',
    })).not.toThrow();
  });

  it('blocks a service-role key copied into a VITE variable', () => {
    expect(() => assertSafeViteEnvironment({
      SUPABASE_SERVICE_ROLE_KEY: 'same-secret-value',
      VITE_SUPABASE_ANON_KEY: 'same-secret-value',
    })).toThrow(/VITE_SUPABASE_ANON_KEY/);
  });

  it('blocks an opaque Supabase secret copied into a VITE variable', () => {
    expect(() => assertSafeViteEnvironment({
      SUPABASE_SECRET_KEY: 'sb_secret_test-value',
      VITE_SUPABASE_ANON_KEY: 'sb_secret_test-value',
    })).toThrow(/VITE_SUPABASE_ANON_KEY/);
  });

  it('blocks client variable names that declare server-only credentials', () => {
    expect(() => assertSafeViteEnvironment({ VITE_SUPABASE_SERVICE_ROLE_KEY: 'secret' }))
      .toThrow(/VITE_SUPABASE_SERVICE_ROLE_KEY/);
  });
});
