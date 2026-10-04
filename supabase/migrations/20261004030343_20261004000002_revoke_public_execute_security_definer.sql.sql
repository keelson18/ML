/*
# Revoke PUBLIC EXECUTE on SECURITY DEFINER Functions

## Purpose
The previous REVOKE FROM anon did not remove access because these functions
still had PUBLIC grants. This migration revokes from PUBLIC (which covers both
anon and authenticated) and then grants EXECUTE only where actually needed.

## Changes

### Trigger functions (no client access needed)
- `handle_new_user()` — REVOKE FROM PUBLIC. Trigger-only; no role needs EXECUTE.
- `prevent_profile_role_escalation()` — REVOKE FROM PUBLIC. Trigger-only.
- `touch_paper_sim_account_updated_at()` — REVOKE FROM PUBLIC. Trigger-only.

### RLS helper function
- `is_current_user_admin()` — REVOKE FROM PUBLIC, then GRANT EXECUTE TO authenticated.
  This function is used in RLS policies, which run with the caller's privileges.
  Authenticated users need EXECUTE so policies that reference it can evaluate.

## Security
- After this change, none of these functions are callable via the REST API
  (`/rest/v1/rpc/...`) by anon or unauthenticated requests.
- Trigger functions continue to work because triggers execute with the
  function's own privileges (SECURITY DEFINER), not the caller's.
- `is_current_user_admin()` is callable by authenticated users via RPC, but
  it only returns a boolean — it does not mutate data or expose sensitive info.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_role_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_paper_sim_account_updated_at() FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;
