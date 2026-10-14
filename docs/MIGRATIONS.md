# Migration inventory and duplicate candidates

Production-applied migration IDs were not available in this repository session. This change renames the pending `restrict_research_result_access` filename from a duplicate numeric version to `20261004000003_restrict_research_result_access.sql`; confirm production history before applying it.

| Earlier file | Duplicate candidate | Provisional canonical source for a clean install | Evidence / caveat |
| --- | --- | --- | --- |
| `20260723000000_prevent_profile_role_escalation.sql` | `20261001011915_20260723000000_prevent_profile_role_escalation.sql` | `20261001011915_20260723000000_prevent_profile_role_escalation.sql` | Reported as a repeated role-escalation migration. Confirm the applied migration IDs and compare full SQL before changing either file. |
| `20260928000001_ml_rate_limits.sql` | `20261001011946_20260928000001_ml_rate_limits.sql` | `20261001011946_20260928000001_ml_rate_limits.sql` | Reported as a repeated ML rate-limit migration. Confirm whether both IDs appear in production migration history. |
| `20260928000002_paper_sim_account_versions.sql` | `20261001011957_20260928000002_paper_sim_account_versions.sql` | `20261001011957_20260928000002_paper_sim_account_versions.sql` | Reported as a repeated paper-account version migration. Confirm production state first. |
| `20260928000000_paper_sim_accounts.sql` | `20261001011931_20260928000000_paper_sim_accounts.sql` | `20261001011931_20260928000000_paper_sim_accounts.sql` | The later copy is not byte-equivalent: its trigger function adds `SECURITY DEFINER` and `SET search_path = public`. Preserve that hardening. |
| `20261003000000_user_owned_paper_sim_accounts.sql` | `20261003030312_20261003000000_user_owned_paper_sim_accounts.sql.sql` | `20261003000000_user_owned_paper_sim_accounts.sql` | Doubled `.sql.sql` suffix on the duplicate candidate. Compare SQL and applied IDs before cleanup. |
| `20261002000000_user_workspace_and_profile_rls.sql` | `20261003030258_20261002000000_user_workspace_and_profile_rls.sql.sql` | `20261002000000_user_workspace_and_profile_rls.sql` | The duplicate has an unusually named `.sql.sql` path. Compare full content and migration history before cleanup. |
| `20261004000000_grant_workspace_table_access.sql` | `20261004000000_restrict_research_result_access.sql` | `20261004000000_grant_workspace_table_access.sql`; restrict file renamed to `20261004000003_restrict_research_result_access.sql` | Both files had the same Supabase version. Verify neither version was applied under the old filename before push. |

## Safe reconciliation procedure

1. Obtain the production Supabase migration history from the project owner; filenames alone do not prove that a migration ran.
2. Compare every candidate pair's full contents and identify security changes, not just schema overlap.
3. Record production-applied IDs and the selected canonical source in this file.
4. Only then propose a migration rename/removal, with an explicit backup and rollout plan.

Until that evidence is supplied, duplicates remain in place. Applying files through the SQL Editor also requires separately recording which repository migrations were applied; SQL execution alone does not synchronize CLI migration history.

## Quantum paper core

`supabase/migrations/20261015000000_quantum_paper_core.sql` is the new owner-applied migration, sequenced after `20261014000000_coach_daily_budget.sql`. It creates the append-only hash-chained decision ledger, event projections, schema check, and autopilot configuration. Do not enable autopilot until the owner has backed up account state, applied it, and verified it against the target project's history; no remote migration was run here. CI runs `npm run check:migration-versions` to reject duplicate numeric prefixes.

## Immutable research replay

`supabase/migrations/20261018000000_immutable_research_runs.sql` follows `20261017000000_health_empty_and_uncheckpointed_ledger.sql`. It adds append-only research evidence, database-enforced single use of an exact holdout interval, server-only run/promotion functions, and expands `verify_paper_schema()` to require the research objects. Apply it only after confirming all earlier migration IDs in the target project. Local PostgreSQL integration remains unverified until the pgTAP contract in `supabase/tests/research_governance.test.sql` runs against a disposable Supabase database.

`supabase/migrations/20261019000000_reject_overlapping_research_holdouts.sql` adds a BEFORE INSERT trigger that locks by symbol/timeframe and rejects any intersecting `[start, end)` holdout range. The trigger preserves existing rows and permits adjacent non-overlapping intervals. Its concurrency harness is `scripts/test-research-holdout-concurrency.mjs`; run it against local Supabase only after `supabase start`. It explicitly refuses non-local hosts.

`supabase/migrations/20261020000000_research_holdout_registration_window.sql` locks each draft's research split to a future test start recorded at experiment creation.

`supabase/migrations/20261021000000_accumulate_research_holdout_candles.sql` adds the append-only bounded forward candle store and service-only batch RPC. Its migration contract is `supabase/tests/research_collection.test.sql`; run it only after applying earlier versions in order and inspecting the target project's history. The SQL has not been executed against local PostgreSQL or the hosted project in this session.
