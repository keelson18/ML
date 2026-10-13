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
9. `20261016000000_admin_health_checkpoints.sql`
10. `20261017000000_health_empty_and_uncheckpointed_ledger.sql`
11. `20261018000000_immutable_research_runs.sql`
12. `20261019000000_reject_overlapping_research_holdouts.sql`
13. `20261020000000_research_holdout_registration_window.sql`

The paper core, admin checkpoint, health, research governance, overlap protection, and registration-window migrations are `20261015000000_quantum_paper_core.sql`, `20261016000000_admin_health_checkpoints.sql`, `20261017000000_health_empty_and_uncheckpointed_ledger.sql`, `20261018000000_immutable_research_runs.sql`, `20261019000000_reject_overlapping_research_holdouts.sql`, and `20261020000000_research_holdout_registration_window.sql`, in that order after `20261014000000_coach_daily_budget.sql`. The filenames must have unique numeric versions; CI enforces this with `npm run check:migration-versions`.

After applying, run `scripts/verify-schema.sql` in the SQL editor and confirm every required object is present. Then request authenticated `/api/v1/me/health` (or admin `/api/v1/system/health`): `schema.ok` must be true and `schema.missing` empty. Plain `/health` only confirms the API process is running and does not report database schema. Confirm the Trader Desk displays a verified ledger hash chain and reconciled account. Keep autopilot disabled until both checks pass.

If `verify_paper_schema()` succeeds in SQL but the API reports `verify_paper_schema`, refresh PostgREST's schema cache with `NOTIFY pgrst, 'reload schema';` in the SQL editor and restart the backend. If the API still reports it missing, confirm its `SUPABASE_URL` and preferred `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) target the same project whose migration history you checked. The legacy variable must contain a JWT with role `service_role`; a publishable/anon key cannot execute the privileged schema check.

The repository's earlier `20261003000000_user_owned_paper_sim_accounts.sql` (and its duplicate-ID copy) granted `authenticated` `INSERT` and `UPDATE` on `paper_sim_accounts`. The `20261015000000_quantum_paper_core.sql` migration revokes those direct writes; account mutations should use `record_paper_account_update`. In the SQL editor, verify current table grants and migration history before concluding the old grants were active in production:

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'paper_sim_accounts'
order by grantee, privilege_type;

select version
from supabase_migrations.schema_migrations
where version in ('20261003000000', '20261003030312', '20261015000000')
order by version;
```

If either historical write-grant migration was applied before the paper-core revocation, authenticated users had a direct-write path around the append-only ledger/version RPC. Treat that as an integrity hole closed by the paper-core migration; current production grants still require the query above.

The schema check covers the paper tables plus `research_experiments`, `research_runs`, `research_results`, `research_approvals`, `research_holdout_claims`, `strategy_promotions`, both research guards, and server RPCs `record_research_run` and `approve_research_strategy`. Research runs and artifacts are immutable and cannot be inserted through authenticated REST; the app persists them atomically through the service-only RPC. A trigger serializes claims by symbol/timeframe and rejects any overlapping half-open interval, while preserving old claim rows. A second trigger requires the registered future test start and prevents changing the registration timestamp. Run the pgTAP contract with `supabase test db`, then run `npm run test:research-holdout-concurrency` against the disposable local database. The latter uses two simultaneous PostgreSQL sessions and refuses any host except localhost port 54322. Neither database test can run until Docker or Podman is available.
