# Phase 1 — Startup, configuration, database and security

**Status:** IN PROGRESS  
**Baseline:** [Phase 0](PHASE-0-BASELINE.md)

## Increment: stop a server credential from reaching Vite

### Finding

The earlier ignored local `.env` had the same value in `SUPABASE_SERVICE_ROLE_KEY` and `VITE_SUPABASE_ANON_KEY`. Vite makes `VITE_*` values available to browser code. The current `.env` has a distinct opaque `SUPABASE_SECRET_KEY`, and the backend now prefers it; the legacy variable has an `anon` JWT role and is not suitable for server access. A direct read-only RPC check using the selected server key returned `ok: true`, `missing: []`. No credential values were displayed.

### Change

`vite.config.ts` calls `assertSafeViteEnvironment` before defining the Vite server/build. The helper blocks a `VITE_*` name that explicitly declares server-only material and blocks any client variable whose value equals either the legacy service-role key or the modern Supabase secret key. Its error reports variable names only and advises rotation if a server credential may have been exposed. Focused Vitest cases cover both key formats, duplicate values, and server-only variable names.

The local `.env` was intentionally left untouched. Keep the public anon/publishable key in `VITE_SUPABASE_ANON_KEY`; set the server secret in `SUPABASE_SECRET_KEY` (preferred) or a legacy service-role JWT in `SUPABASE_SERVICE_ROLE_KEY`. Do not share either value in chat. Rotation/disablement of the formerly exposed credential must be confirmed in Supabase.

### Evidence

- Node/Vite checks: **PASS** for distinct public/server credentials, duplicate legacy or opaque server-key rejection, and `VITE_SUPABASE_SERVICE_ROLE_KEY` rejection. The current ignored `.env` also passes the guard; no credential values were printed.
- After the owner stopped the blocking processes, elevated `npm ci`: **PASS**, 370 packages added; audit reports 8 advisories (2 moderate, 6 high).
- `npm run typecheck`: **PASS**. `npm run backend:typecheck`: **PASS**. `npm run lint`: **PASS**.
- `npm test`: **PASS**, 54 files and 295 tests after schema, key, CORS, authentication and request-scoped client regressions were added. Sandbox invocation hit esbuild `spawn EPERM`; elevated invocation passed.
- `npm run build`: **PASS** outside sandbox with the corrected Vite key configuration; existing large-chunk warning remains (App 903.86 kB, index 328.52 kB before gzip).
- `npm run check:env`: **PASS**, 48 environment references documented. `npm run check:migration-versions`: **PASS**, 39 unique migration versions. `git diff --check`: **PASS**.
- `npm run dev`: **PASS**; API and Vite both listened successfully. `/health` returned HTTP 200 for liveness. A direct read-only `verify_paper_schema` RPC using the selected `SUPABASE_SECRET_KEY` returned `ok: true`, `missing: []`. The authenticated `/api/v1/me/health` route was not exercised because no user session was supplied.
- Readiness now distinguishes configuration, access, schema and connection failures. JWTs claiming `anon` are rejected before privileged database calls; legacy `service_role` JWTs and opaque `sb_secret_` keys are accepted. Auth tests cover invalid tokens, unavailable auth, role/MFA gates, and sanitized errors. CORS tests cover an allowed and an untrusted origin.
- The UI attempted `/api/v1/stream/ticket` and received 404 because live feed is disabled; the client intentionally switches to polling. A prior live market request received Massive HTTP 429, so provider data availability is not established.
- Static table-access review found `paper_sim_accounts` reads in account loading, health reconciliation and owner export; account creation/updates call `record_paper_account_update`. No direct application insert/update/upsert/delete path was found. The migration revokes direct writes and grants the RPC to `service_role`.
- User-scoped Supabase clients are now created per request rather than cached by raw bearer token in a process-wide map. The new test verifies clients are distinct, persistence/refresh are disabled, and missing URL/anon configuration fails clearly.
- Repository history contains two migrations granting `authenticated` direct `INSERT`/`UPDATE` on this table, followed by the 20261015 revocation. The current schema RPC succeeds, but this workspace has no Supabase CLI for querying migration history/current table grants. `docs/DB_APPLY.md` now includes exact SQL for the owner to confirm both. If the write grants were active before revocation, that was an integrity hole around the ledger/version RPC.

### Remaining Phase 1 work

- Owner confirms the previously exposed legacy key has been rotated or disabled in Supabase; the server currently selects the separate `SUPABASE_SECRET_KEY`.
- With the owner’s authenticated session, verify `/api/v1/me/health` and Trader Desk’s schema/account badges. Local schema RPC readiness passed, but authenticated account and reconciliation paths remain NOT-VERIFIED.
- CORS allowlisting and auth/session handling have code review and unit coverage; deployed two-user RLS isolation, current SQL grants, and migration history remain NOT-VERIFIED because the Supabase CLI/DB connection URL is unavailable in this workspace.
- The auth tests are mocked; confirm `/api/v1/me/health`, Trader Desk badges, and per-user account isolation with an authenticated owner session.
