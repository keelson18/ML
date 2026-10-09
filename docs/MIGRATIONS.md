# Migration inventory and duplicate candidates

No migration files were removed or renamed. Production-applied migration IDs were not available in this repository session, so every item below requires comparison with the Supabase migration history before any cleanup.

| Earlier file | Duplicate candidate | Provisional canonical source for a clean install | Evidence / caveat |
| --- | --- | --- | --- |
| `20260723000000_prevent_profile_role_escalation.sql` | `20261001011915_20260723000000_prevent_profile_role_escalation.sql` | `20261001011915_20260723000000_prevent_profile_role_escalation.sql` | Reported as a repeated role-escalation migration. Confirm the applied migration IDs and compare full SQL before changing either file. |
| `20260928000001_ml_rate_limits.sql` | `20261001011946_20260928000001_ml_rate_limits.sql` | `20261001011946_20260928000001_ml_rate_limits.sql` | Reported as a repeated ML rate-limit migration. Confirm whether both IDs appear in production migration history. |
| `20260928000002_paper_sim_account_versions.sql` | `20261001011957_20260928000002_paper_sim_account_versions.sql` | `20261001011957_20260928000002_paper_sim_account_versions.sql` | Reported as a repeated paper-account version migration. Confirm production state first. |
| `20260928000000_paper_sim_accounts.sql` | `20261001011931_20260928000000_paper_sim_accounts.sql` | `20261001011931_20260928000000_paper_sim_accounts.sql` | The later copy is not byte-equivalent: its trigger function adds `SECURITY DEFINER` and `SET search_path = public`. Preserve that hardening. |
| `20261003000000_user_owned_paper_sim_accounts.sql` | `20261003030312_20261003000000_user_owned_paper_sim_accounts.sql.sql` | `20261003000000_user_owned_paper_sim_accounts.sql` | Doubled `.sql.sql` suffix on the duplicate candidate. Compare SQL and applied IDs before cleanup. |
| `20261002000000_user_workspace_and_profile_rls.sql` | `20261003030258_20261002000000_user_workspace_and_profile_rls.sql.sql` | `20261002000000_user_workspace_and_profile_rls.sql` | The duplicate has an unusually named `.sql.sql` path. Compare full content and migration history before cleanup. |

## Safe reconciliation procedure

1. Obtain the production Supabase migration history from the project owner; filenames alone do not prove that a migration ran.
2. Compare every candidate pair's full contents and identify security changes, not just schema overlap.
3. Record production-applied IDs and the selected canonical source in this file.
4. Only then propose a migration rename/removal, with an explicit backup and rollout plan.

Until that evidence is supplied, duplicates remain in place. Applying files through the SQL Editor also requires separately recording which repository migrations were applied; SQL execution alone does not synchronize CLI migration history.
