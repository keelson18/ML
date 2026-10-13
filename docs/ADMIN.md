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
| Market Availability | `/api/v1/admin/markets/availability`, `/api/v1/admin/markets/budget`; probe route is under `/api/v1/admin/markets/probe` | Admin | Probes consume provider budget; they are not part of overview refresh. |
| Event Risk | `/api/v1/admin/event-blackouts` | Admin | Database RPCs enforce admin access and record create/cancel actions. |
| Settings | `/api/v1/autonomy/status` | Admin UI access | Read-only legacy pipeline status. |

The Phase 2 Autopilot controls, Phase 3 Audit viewer, Phase 4 suspension controls, and Phase 5 queued market probes, log improvements, and in-app alerts are not available yet. Phase 6 research/promotion features are deferred.

## Health overview and ledger cost

`GET /api/v1/admin/overview` is admin-only and cached server-side for `ADMIN_OVERVIEW_CACHE_TTL_MS` (default 15 seconds). It does not contact market-data providers. Provider budgets and live feed counters are process-local snapshots; candle freshness uses only cached closed candles. Missing sources are reported as unverified.

Migration `20261016000000_admin_health_checkpoints.sql` adds a service-role-only checkpoint for each paper account. Normal ledger health verifies only rows after each stored `(sequence, hash)` checkpoint; the work is proportional to new rows, plus one indexed lookup per account. Accounts without a checkpoint are reported as unverified; ordinary overview requests never perform a first-time scan. The explicit `POST /api/v1/admin/overview/ledger/reverify` establishes or refreshes checkpoints by performing a full scan of all ledger rows. It is limited to one request per minute, requires AAL2, and records a success audit in the same database transaction as the checkpoints. Database application and production execution must be verified separately.

Audit rows are retained indefinitely by the application; there is no app delete path. Database retention and backup policies remain the deployment owner's responsibility.
