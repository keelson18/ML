# Database apply and verify

Back up `paper_sim_accounts` before applying the paper core migration. Compare the list below with `supabase_migrations.schema_migrations`; apply only pending versions, in this ascending order. Several old files are duplicate semantic migrations with distinct IDs; review [MIGRATIONS.md](MIGRATIONS.md) and production history before applying those candidates to an established project.

1. `20260721031100_create_trading_tables.sql`
2. `20260722000000_phase2_role_management.sql`
3. `20260723000000_prevent_profile_role_escalation.sql`
4. `20260809000000_quantuam_foundation.sql` through `20260809000006_profile_baseline_fields.sql` (ascending suffix)
5. `20260928000000_paper_sim_accounts.sql` through `20260928000002_paper_sim_account_versions.sql` (ascending suffix)
6. Remaining `20261001*` through `20261013*` files in ascending filename order, after resolving duplicate semantic migrations against production history.
7. `20261014000000_coach_daily_budget.sql`
8. `20261015000000_quantum_paper_core.sql`

The new migration is `supabase/migrations/20261015000000_quantum_paper_core.sql`. It follows `20261014000000_coach_daily_budget.sql`. The filenames must have unique numeric versions; CI enforces this with `npm run check:migration-versions`.

After applying, run `scripts/verify-schema.sql` in the SQL editor and confirm every required object is present. Then request authenticated `/api/v1/me/health` (or admin `/api/v1/system/health`): `schema.ok` must be true and `schema.missing` empty. Plain `/health` only confirms the API process is running and does not report database schema. Confirm the Trader Desk displays a verified ledger hash chain and reconciled account. Keep autopilot disabled until both checks pass.

If `verify_paper_schema()` succeeds in SQL but the API reports `rpc:verify_paper_schema`, refresh PostgREST's schema cache with `NOTIFY pgrst, 'reload schema';` in the SQL editor and restart the backend. If the API still reports it missing, confirm its `SUPABASE_URL` and server `SUPABASE_SERVICE_ROLE_KEY` target the same project whose migration history you checked.

The schema check covers `paper_sim_accounts`, `decision_ledger`, `paper_fills`, `shadow_trades`, `paper_autopilot`, `autopilot_settings`, and the RPCs `record_paper_account_update`, `set_paper_autopilot`, `list_enabled_paper_autopilots`, `pause_paper_autopilot`, `resume_paper_autopilot`, `touch_paper_autopilot_run`, `paper_ledger_health`, and `verify_decision_ledger`. It also checks the authenticated cap-display RPC `get_paper_autopilot_limits`.
