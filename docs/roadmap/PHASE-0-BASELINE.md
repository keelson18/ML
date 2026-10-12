# Phase 0 — Repository baseline

**Observed:** 2026-10-12  
**Branch / commit:** `main` / `15ed2e1` (`feat: update database migration process and verification steps`)  
**Initial worktree:** clean. The current uncommitted changes are only this roadmap increment; no pre-existing user edits were overwritten.

## Architecture map

- **Client:** React + TypeScript + Vite. `vite.config.ts` proxies `/api/v1` and `/health` to the configured Fastify API target. Browser Supabase auth uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `src/lib/supabase.ts`.
- **API:** Fastify in `backend/src/server.ts`, with auth guards and separate decision, market, paper, positions, Trader Desk, coach, news, admin and personal-data routes. `scripts/dev.mjs` is the single local orchestrator: it starts the API, waits for basic `/health`, then starts Vite.
- **Market data:** `src/lib/markets.ts` is the canonical registry. `backend/src/services/marketDataService.ts` selects Massive or Twelve Data, validates candle shape and provider identity, and applies request budgets and a bounded process cache. Coinbase and Twelve Data also have live-feed adapters; live availability is not implied by their presence.
- **Decision and paper path:** backend decision engines produce evidence and risk gates. Trader Desk planning/execution is separate and paper-only. Autonomy obtains market series, manages checkpoints, and routes account writes through paper services and the versioned `record_paper_account_update` RPC. `reconcilePaperAccount` checks cash/cost-basis accounting; the append-only `decision_ledger` has hash verification.
- **Persistence and security:** Supabase PostgreSQL migrations define account, ledger, fills, shadow trades, autopilot settings and RPCs with RLS/grants. Service-role operations belong on the server. `scripts/verify-schema.sql` is the operator inventory check.
- **Known architectural distinction:** the browser Dashboard and exploratory backtest contain presentation-side calculations separate from Trader Desk planning/replay. Treat their outputs as separate until the Phase 3/4 audits prove equivalence and research validity. Existing review in `docs/ARCHITECTURE_AUDIT.md` lists broader findings; its evidence predates this baseline and should be rechecked phase by phase.

## Runtime and scripts

- `package.json` requires Node `>=20.19`; CI pins Node `20.19`. Local Node is `v24.15.0`, npm is `11.12.1`.
- Available checks: `check:env`, `check:migration-versions`, frontend and backend typechecks, lint, Vitest, and Vite build. `npm run dev` is the combined local startup command.
- `.env.example` documents browser-safe Supabase URL/anon key separately from the server URL/service-role key. `.env` is ignored by Git and is not tracked.

## Baseline commands and observed results

| Command / observation | Status | Result |
| --- | --- | --- |
| `git status --short --branch`, `git branch --show-current`, `git log -1 --oneline` | PASS | `main`, commit `15ed2e1`; worktree was clean before this increment. |
| `node --version`; `npm --version` | PASS | Node `v24.15.0`; npm `11.12.1`. |
| `npm ci` | PASS (outside sandbox) | Initial attempts failed with `EPERM` while esbuild processes held the binary and then `EPERM spawn`; after the owner stopped them, elevated `npm ci` completed: 370 packages added, 371 audited. npm reported 8 advisories (2 moderate, 6 high); no audit fix was applied. |
| `npm run typecheck` | PASS | `tsc --noEmit -p tsconfig.app.json`, exit 0. |
| `npm run backend:typecheck` | PASS | `tsc --noEmit -p backend/tsconfig.json`, exit 0. |
| `npm run lint` | PASS | `eslint .`, exit 0. |
| `npm test` | PASS (outside sandbox) | 54 test files, 295 tests passed after Phase 1 schema/auth/CORS/key/session regressions were added. In-sandbox execution failed because esbuild could not spawn (`EPERM`); elevated execution passed. Tests use fixtures/mocks and do not prove all live provider behavior. |
| `npm run build` | PASS (outside sandbox) | Vite production build completed. It reports an existing large chunk warning: `App` 903.86 kB and `index` 328.52 kB before gzip. In-sandbox execution failed because esbuild could not spawn (`EPERM`). |
| Dependency advisory audit / lockfile consistency | PARTIALLY VERIFIED | `npm ci` succeeded from the lockfile and audited 371 packages, reporting 8 advisories (2 moderate, 6 high). Full advisory triage is not done. |
| `npm run dev` | PASS (local startup/schema preflight) | Combined launcher started Fastify on `127.0.0.1:8787` and Vite on `localhost:5173`. After config began preferring `SUPABASE_SECRET_KEY`, startup had no schema failure log. A separate read-only RPC check returned `ok: true`, `missing: []`. Processes were stopped after verification. |
| `http://127.0.0.1:8787/health` | PASS (liveness only) | Returned HTTP 200 `{status:"ok", service:"quantum-api"}`. This endpoint does not report database readiness. |
| `npm run check:env` | PASS | All 48 application environment reads are documented/commented in `.env.example`. |
| `npm run check:migration-versions` | PASS | 39 migration files have unique numeric versions. |
| `git diff --check` | PASS | No whitespace errors in the current changes. |
| Node assertion of the Vite safety helper | PASS | Public anon distinct from service key is accepted; copied/named server credentials are rejected. After the owner's correction, `.env`'s VITE anon value is distinct from the service-role value; no values were printed. |
| Linked Supabase CLI migration/schema check | PASS (linked project only) | Version `20261015000000` is recorded applied; `verify_paper_schema()` returned `ok: true`, `missing: []`, and service-role execute privilege is present. It does not prove a running backend process uses this project. |

## Environment and security findings

- Secret-safe checks confirm the ignored local `.env` points at the linked project, the preferred `SUPABASE_SECRET_KEY` is configured, and it differs from the VITE anon key. The legacy `SUPABASE_SERVICE_ROLE_KEY` token claims `anon`; the backend now prefers the configured opaque secret key, and `verify_paper_schema()` returned `ok: true`, `missing: []` using that key. No key values were printed.
- **Previously exposed credential risk:** the earlier ignored `.env` had identical values for `VITE_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`; Vite exposes `VITE_*` values to browser code. The owner reports correcting `.env` and stopping the prior processes, but key rotation is not verifiable from this workspace. Treat rotation in Supabase as still required until confirmed.
- The earlier supplied runtime log reported `missing: ["verify_paper_schema"]`. This worktree now selects the configured `SUPABASE_SECRET_KEY`, and the direct RPC check through that key returned `ok: true`, `missing: []`; combined startup also passed schema preflight. This verifies the local `.env` path, not a separately deployed backend or an authenticated user's account health.
- `AUTONOMY_PORT` defaults to 8787; the combined dev script starts API before Vite. Do not start a duplicate API while another process owns the port.
- Migration history includes older semantic overlaps. Do not blindly apply/reset a database; `docs/DB_APPLY.md` is the reviewed order and requires backup before pending paper-core changes.

## Prioritized roadmap

1. **Phase 1 security/startup (active):** keep the VITE anon key public and distinct; the backend now uses `SUPABASE_SECRET_KEY` ahead of the legacy service-role variable. Local schema preflight passes. Verify authenticated `/api/v1/me/health`, review database grants/RLS, and confirm the formerly exposed legacy key was rotated or disabled.
2. **Phase 2 market universe:** enumerate every registry instrument/provider/timeframe; add bounded live verification and explicit per-combination outcomes. Current configured-provider entitlement and coverage are not verified.
3. **Phase 3 decision engine:** reconcile decision/UI paths and document/test candle, feature, risk, evidence and abstention invariants.
4. **Phase 4 backtesting/research:** preserve exploratory labels; validate chronology, leakage, costs and baselines before any performance claims.
5. **Phase 5 paper/risk:** cover idempotency, atomicity, restart and persistence failures; keep all execution simulated.
6. **Phase 6 research loop:** persist reproducible experiments and approval-gated promotion.
7. **Phase 7 release readiness:** verify observability, security regressions, recovery and browser responsiveness with external evidence.

## Exit status

Phase 0 is **PARTIALLY VERIFIED**: migration/env checks, dependency installation, typechecks, lint, tests, build, combined startup, and the local schema RPC passed. Authenticated user health, live provider availability, complete RLS review, and advisory triage remain unverified. npm reports 8 dependency advisories. The Vite safety guard's focused cases ran as part of the passing 295-test suite.
