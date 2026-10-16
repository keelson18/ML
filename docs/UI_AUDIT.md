# Page interaction audit

Source-level audit of every route in `src/lib/routes.ts`. Page copy, navigation labels, enum choices, and algorithm definitions are source configuration; account records, metrics, market data, settings, and user-authored content are loaded from the current account or API. No demo records are used as live account data.

| Route | Data and interactions |
| --- | --- |
| Dashboard | Live market feed and backend decision state; symbol/timeframe controls, chart overlays, watchlist selection, notifications, theme, and account menu. |
| Trading Terminal | Selected market plus multi-timeframe chart panels; timeframe chips jump to the matching chart. Charts support pan/zoom. |
| Trader Desk | Account-scoped paper trading, plan/run controls, positions, orders, and journal/review data. |
| Markets | Configured market registry with quote refresh and pagination. |
| AI Analysis | Current candle-derived signals and model output, filter/expand controls, refresh action. |
| Strategies | Strategy detectors run against current candles; search and category/readiness/signal filters. |
| Portfolio | Paper account balances and positions; refresh and close-position action. |
| Backtesting | Current historical candles and selected strategy/range; user-entered initial capital, run action, metrics, curve, and trade list. |
| Watchlists | Account-scoped watchlist CRUD and symbol selection. |
| Alerts | Account-scoped alert creation, activation, and deletion. |
| News & Research | Provider-backed news/calendar, research CMS records, filters, refresh, and article reader. |
| Risk Management | Server account/risk values and refresh; position calculator uses server balance/risk limits with user-entered entry/stop values. |
| AI Learning | Account-scoped experiment/model records, refresh and search. |
| Admin Control Center | Nine tabs: system health, metrics, users, models, CMS, logs, market probes, event blackouts, and autonomy status/settings. Data/actions are API-backed and protected by the admin route/server. |
| Knowledge Base | Published CMS records loaded from the authorized published-content query; article open/back navigation. |
| Settings | Account profile, avatar, email/password, theme, sessions/export, MFA, notification preferences. |

Auth, MFA, error, loading, and empty states are contextual states of these flows rather than separate demo pages. CMS article reading is intentionally read-only; admin CMS editing is interactive.

Built-in strategy definitions, metric labels, market-type enums, and route labels remain code-owned configuration. Making those editable requires a defined backend-owned configuration model and admin CRUD API; they are not fabricated account data.

## Follow-up fixes: AI, admin telemetry, and paper automation

- AI Analysis: signal direction filters and expandable evidence remain connected to live dashboard signals; the ML refresh control now has a phone-sized target, and the confidence gauge no longer displays an implied 50% when no prediction exists.
- AI Learning Center: users can save account-scoped learning hypotheses through the authenticated backend endpoint, refresh the model/event/experiment data, and search all three record groups. Empty filtered results are stated explicitly.
- Admin System Metrics: replaced the legacy `system_metrics` table read (which had no writer) with the populated, admin-authorized operational overview: schema, autopilot enrollment, worker, providers, feeds, ledger/accounting checks, and access denials.
- Admin System Logs: now uses the admin-authorized `admin_audit_events` endpoint with search and expandable details instead of the unrelated user-scoped `audit_logs` table.
- Mobile navigation: replaced the drawer and hamburger with a fixed five-destination bottom bar and a safe-area-aware full-height More sheet. All secondary routes, Settings, and admin-only Admin are listed in More; the sheet traps keyboard focus, closes with Escape, and includes red Sign out.
- Paper automation: existing server startup starts the per-account paper autopilot after schema readiness. New entries require the global `AUTONOMOUS_TRADING` switch plus per-account opt-in, verified supported USD crypto markets, fresh closed candles, valid stored plans, and all risk gates. Position exits continue to run for existing positions; each close records a journal entry in paper account state and the owned history endpoint falls back to that state if normalized SQL history is unavailable. Existing tests exercise next-candle entry, managed exit, idempotency, and journal metrics.
