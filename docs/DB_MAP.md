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
| `market_universe`, `assets` | authoritative | Active-symbol registry consulted during SQL enrollment. |
| `admin_audit_events` | authoritative | Records privileged autopilot cap changes. |
| `research_experiments` | authoritative | Owner-created hypotheses and fixed research parameters; immutable after a run is recorded. |
| `research_runs` | authoritative | Server-created immutable replay lineage, seed, source revision, and run configuration. |
| `research_results` | authoritative | Server-created immutable metrics and exact provider candle snapshots. |
| `research_holdout_claims` | authoritative | One claim per symbol, timeframe, and exact test interval to prevent repeated holdout tuning. |
| `strategy_promotions` | authoritative | Active/retired setup allowlist linked to the validated run, admin reviewer, and rollback target. |
| `research_approvals` | authoritative | Append-only record of admin strategy promotion decisions. |
| `trade_plans`, `plan_events`, `paper_orders`, `trade_journal`, `daily_reviews` | planned | Legacy/relational history surfaces; account JSON remains authoritative where noted by route fallback behavior. |
| `paper_accounts` | dead | Legacy parallel account table; no current paper execution writes. |

This map reflects code references in this repository. Before dropping any `planned` or `dead` table, inspect production SQL usage and migration history.
