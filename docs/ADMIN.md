# Administration

All admin backend routes require `app.requireAdmin`; client-side route protection is not an authorization boundary. The Phase 1 full-ledger action requires AAL2 and a reason. Existing role-change MFA denial auditing remains pending Phase 4. The server audit log is `admin_audit_events`; details must remain redacted and limited to explicitly allowed fields.

## Environment label

`APP_ENV` is server configuration, validated as `test` or `production`. It is returned by the admin overview and shown in the Administration header. `APP_ENV` is independent of `NODE_ENV`; set it deliberately for each deployment. The header also labels the application as paper-trading-only.

## Available tabs and routes

| Tab | Read route / data source | Role requirement | MFA / audit |
| --- | --- | --- | --- |
| System Health | `GET /api/v1/admin/overview` | Admin | Read-only. A full ledger re-verification is an explicit AAL2 action, requires a reason, and records success, failure, and MFA denial in `admin_audit_events`. |
| System Metrics | Existing metrics source | Admin | Read-only. |
| User Management | `/api/v1/admin/users`; role changes use `admin_change_user_role` | Admin | Role changes are audited by the database function; AAL2 step-up and denial auditing remain pending Phase 4. |
| ML Models | Existing model-management source | Admin | Read-only. |
| Content (CMS) | Builder CMS integration | Admin UI access | Publishing follows the CMS permissions and audit behavior configured by that integration. |
| System Logs | Existing log and actor-scoped activity sources | Admin UI access | Do not treat actor-scoped `audit_logs` as a global privileged-action audit feed. |
| Market Availability | `/api/v1/admin/markets/availability`, `/api/v1/admin/markets/budget`; `POST /api/v1/admin/markets/probe` | Admin | A probe body selects one registry-mapped crypto or commodity symbol. It checks the configured planner, trigger, and management timeframes and consumes provider budget; it is not part of overview refresh. Results are per-timeframe and distinguish verified, partial, unverified, unavailable (provider-confirmed), stale, and error states. Concurrent probes are rejected rather than returning evidence for the wrong symbol. |
| Market Coverage | `GET/PUT /api/v1/admin/markets/coverage` | Admin with AAL2 for tier edits | Table reads show every active registry instrument and both provider budgets; edits call `admin_set_market_coverage_tier`, enforce tier rules/caps, and write `admin_audit_events`. Rejected RPC edits are separately recorded as `market.coverage.update_denied`; missing migration, MFA, and safety-policy errors are shown as safe categories. The owner must apply the coverage migration before edits work. |
| Event Risk | `/api/v1/admin/event-blackouts` | Admin | Database RPCs enforce admin access and record create/cancel actions. |
| Settings | `/api/v1/autonomy/status` | Admin UI access | Read-only legacy pipeline status. |
| AI Learning | `GET /api/v1/admin/ai/overview`; notes use `POST /api/v1/admin/ai/events` | Admin, with the existing MFA/AAL2 guard | Reads are server-side and rate-limited. Admin notes are inserted and audited by `admin_create_learning_event`; system analysis/research events are appended to `ai_learning_journal` through a service-only RPC. |

Tier B scanning currently rotates one 4h/1h closed-candle fetch per interval at standard provider priority, subject to minute and daily reserves. Confirmed provider 404s are recorded against the specific timeframe; transient errors and rate limits are not treated as permanent unavailability. Admin probes are explicitly selected, bounded to one instrument per request, and accept active registry-mapped crypto and commodity symbols. Availability evidence is process-local and resets on backend restart; no live provider probe is implied by unit tests or registry mappings. Tier C chart requests use mapped Massive/Twelve Data providers only after the user opens a chart; blocked instruments are denied by the backend. Scan timestamps are process-local and scans do not yet emit shadow plans. See `docs/COVERAGE_BUDGET.md`; provider entitlement and deployed database behavior remain owner-verification items.

AI Learning is an admin-only read surface for saved model and strategy versions, learning notes, knowledge records, research experiments/runs/results, collection state, and append-only journal events. Approved tagged knowledge may be attached to a trade analysis as visibly non-authoritative supplementary context; it does not change the decision or risk checks. Research replay still advances only when its API is invoked; no always-on learning scheduler or automatic backlog discovery is configured. Migrations `20261024000002_admin_ai_review_access.sql` and `20261026000000_ai_learning_journal.sql` add review access and journal storage; neither hosted application nor effective deployed grants are claimed verified here.

## Health overview and ledger cost

`GET /api/v1/admin/overview` is admin-only and cached server-side for `ADMIN_OVERVIEW_CACHE_TTL_MS` (default 15 seconds). It does not contact market-data providers. Provider budgets and live feed counters are process-local snapshots; candle freshness uses only cached closed candles. Missing sources are reported as unverified.

Migration `20261016000000_admin_health_checkpoints.sql` adds a service-role-only checkpoint for each paper account. Normal ledger health verifies only rows after each stored `(sequence, hash)` checkpoint; the work is proportional to new rows, plus one indexed lookup per account. Accounts without a checkpoint are reported as unverified; ordinary overview requests never perform a first-time scan. The explicit `POST /api/v1/admin/overview/ledger/reverify` establishes or refreshes checkpoints by performing a full scan of all ledger rows. It is limited to one request per minute, requires AAL2, and records a success audit in the same database transaction as the checkpoints. Database application and production execution must be verified separately.

Audit rows are retained indefinitely by the application; there is no app delete path. Database retention and backup policies remain the deployment owner's responsibility.
