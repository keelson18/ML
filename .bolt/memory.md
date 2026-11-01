# Project memory

## Product intent & audience

- Existing project: **Quantum Intelligence** — a serious, explainable, research-driven **AI Trading Intelligence Platform** operating with controlled paper-trading capabilities.
- Framework: vite-react (frontend; server/backend stack inferred but not fully confirmed).
- Not a greenfield build: goal is to audit, understand, correct, and improve the existing codebase.
- Not a cosmetic redesign. No hardcoded workarounds, no fake market data, no BUY/SELL from incomplete candles.
- Platform should eventually decouple from one free API provider and a fixed small instrument list (currently 8 hardcoded).

## Brand personality & voice

- Serious, explainable, evidence-based tone. No over-claiming functionality. No "it works" without proof. Final reporting must distinguish passed / failed / blocked / not implemented / not tested.

## Visual design & UX direction

- Pages should have clear responsibilities and consolidated shared components.
- Chart must not show unwanted overlays the spec doesn't require; required overlay features are currently missing from `src` and need adding.
- Header misleadingly shows a cached price as if live; "SYSTEM NOMINAL" is hardcoded — both must be corrected.
- Must support loading, empty, and error states meaningfully; responsive desktop + mobile layouts.
- An orphaned/unused page component exists and should be removed or wired in.

## Decisions, constraints & rationale

- No application code changed this turn; only `FIX_PROMPT.md` written at project root with overview, tech stack, audit summary, 28 prioritized issues, fix order, and testing checklist.
- Build passes at current baseline.
- Folder is **not a git repo** here, so no history comparison was possible — documented as a limit.
- Audit is **partial**: several files not read; document says so honestly.
- Investigation first → root-cause → plan → implement carefully → test → document everything. Strict staged order (Stage 1 inventory → Stage 8 final verification) must be followed; no parallel fix-everything.
- No destructive DB changes; migrations may not match live applied SQL — unresolved.
- No fabricated test success: blocked tests must be reported as blocked.

## Open questions & assumptions

- Highest-risk open: can forming (unfinished) candles reach analysis? Server paper executor rejects open candles, but frontend consumers not yet confirmed.
- Does the server actually reject non-admins, or is RBAC only enforced in the UI?
- Do repo migration files match the SQL applied to the live hosted database?
- pgTAP tests have not been run — status unknown.
- Browser-side paper-trading service (turns BUY/SELL into orders) appears only reachable from its test — confirm no hidden caller.
- Provider coupling and fixed 8-instrument restriction: full remediation approach not yet implemented.