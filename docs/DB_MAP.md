# Database map

Status means: **authoritative** is read or written by active application paths; **planned** has a schema but no authoritative application workflow; **dead** has no current code or migration consumer and should be reviewed before removal.

| Table | Status | Current role |
| --- | --- | --- |
| `paper_sim_accounts` | authoritative | Canonical versioned paper account state. Writes go through `record_paper_account_update`; direct table writes are revoked. |
| `decision_ledger` | authoritative | Append-only event and scheduled/trade snapshots with a per-account hash chain. |
| `paper_fills` | authoritative | Relational projection of entry and exit fills. |
| `shadow_trades` | authoritative | Projection of shadow signals. |
| `paper_autopilot` | authoritative | Per-user enrollment, symbols, safety pause and run timestamp. |
| `autopilot_settings` | authoritative | Database-owned per-user and global symbol caps. |
| `market_coverage_overrides` | authoritative | Admin/MFA audited tier overrides; authenticated and anonymous direct table access is revoked, backend service reads the table, and writes go through `admin_set_market_coverage_tier`. Code defaults cover the registry when no override exists. |
| `market_universe`, `assets` | authoritative | Active-symbol registry consulted during SQL enrollment. |
| `admin_audit_events` | authoritative | Records privileged actions, including admin AI learning-note creation. |
| `models`, `model_versions`, `model_evaluations`, `model_deployments` | authoritative | Admin-only model registry and review metadata. Authenticated reads are restricted by `is_current_user_admin()`; registry writes are service-side. |
| `learning_events` | authoritative | User-owned learning notes, with administrator-only cross-user review; admin-created review notes and audit rows use `admin_create_learning_event`. |
| `ai_learning_journal` | authoritative | Append-only system analysis/research journal; service-role-only event RPC, owner/admin reads, stable idempotency key, and provenance/correlation fields. |
| `learning_experiments`, `learning_outcomes` | authoritative | Owner-linked learning research; administrator SELECT is available for review. |
| `research_experiments` | authoritative | Owner-created hypotheses and fixed costs plus a DB-validated future test start; registration time cannot be rewritten and parameters become immutable after a run is recorded. Admins may review all records; other users see their own. |
| `research_runs` | authoritative | Server-created immutable replay lineage, seed, source revision, and run configuration. |
| `research_results` | authoritative | Server-created immutable metrics and exact provider candle snapshots. |
| `research_collection_state` | authoritative | Locks each collection to one owner, instrument, provider, continuity policy, and immutable registered holdout start. |
| `research_collection_candles` | authoritative | Append-only, per-timeframe provider candles collected in bounded requests before and during forward research; authenticated clients cannot read or write it. |
| `research_holdout_claims` | authoritative | Append-only claims; a transaction-locked trigger rejects any overlapping time interval for the same symbol/timeframe while allowing adjacent intervals. |
| `strategy_promotions` | authoritative | Active/retired setup allowlist linked to the validated run, admin reviewer, and rollback target. |
| `research_approvals` | authoritative | Append-only record of admin strategy promotion decisions. |
| `trade_plans`, `plan_events`, `paper_orders`, `trade_journal`, `daily_reviews` | planned | Legacy/relational history surfaces; account JSON remains authoritative where noted by route fallback behavior. |
| `paper_accounts` | dead | Legacy parallel account table; no current paper execution writes. |

This map reflects code references in this repository. Before dropping any `planned` or `dead` table, inspect production SQL usage and migration history.
