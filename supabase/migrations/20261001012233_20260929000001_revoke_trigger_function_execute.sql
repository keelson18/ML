/*
# Revoke EXECUTE on Trigger Functions

1. Security Changes
- Revoke EXECUTE from anon and authenticated on three SECURITY DEFINER trigger functions that should only be called by database triggers, not via the REST API:
  a) handle_new_user() — called by on_auth_user_created trigger on auth.users
  b) prevent_profile_role_escalation() — called by protect_profile_role_changes trigger on profiles
  c) touch_paper_sim_account_updated_at() — called by paper_sim_accounts_updated_at trigger on paper_sim_accounts
2. Notes
- These functions are trigger-only and should never be directly invoked by clients.
- REVOKE ensures anon and authenticated roles cannot call them via /rest/v1/rpc/.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_role_escalation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_paper_sim_account_updated_at() FROM anon, authenticated;
