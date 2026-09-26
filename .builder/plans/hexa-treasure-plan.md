# App-wide functionality, chart reliability, and strategy expansion

## Preconditions

- Do not edit implementation files until the existing local/remote merge conflict is resolved and the current uncommitted work is reconciled by the project owner through the normal sync flow.
- Preserve the existing local changes; do not reset, discard, or overwrite them.
- After reconciliation, re-audit the touched files because the current branch is behind remote and the working tree already contains broad feature work.

## Recommended approach

Deliver the work in four coordinated layers rather than patching pages independently:

1. **Make navigation and shared page behavior reliable.** Add a lightweight URL route map around the existing `SidebarTab` model using the History API and `popstate`, preserving the current single-dashboard shell while enabling refresh, deep links, and browser back/forward. Add consistent page loading, error, empty, and retry states using existing data sources only.
2. **Use one chart implementation everywhere.** Consolidate `PriceChart` and the active `TradingTerminal` path around a shared chart component or hook. Normalize candle and overlay data before passing it to `lightweight-charts`, clear stale data during symbol/timeframe changes, observe the actual container with `ResizeObserver`, and ensure theme, sidebar, grid, and mobile layout changes resize every chart correctly.
3. **Create one authoritative strategy catalog.** Replace hard-coded Strategy Lab/backtesting lists and the split frontend/backend dispatch paths with versioned strategy definitions. Expose stable IDs, display metadata, category, supported timeframes, minimum candles, detector, and backtest metadata. Keep candlestick/chart patterns distinguishable from executable strategies while allowing them to remain visible as evidence.
4. **Wire the backtester and page data flows to real results.** Make selected strategy, asset/current symbol, date range, capital, and timeframe drive execution. Use the portfolio-aware backtest engine, render its equity and trade data with the shared chart pattern, and surface honest data limitations instead of reporting static operational metrics.

## Implementation phases

### 1. Baseline and architecture

- Reconcile the Git conflict first, then run the existing typecheck/build once to capture the clean baseline.
- Confirm the active page components and provider/backend APIs after sync; do not assume deleted or newly added files remain unchanged.
- Define a small route table mapping each sidebar tab to a stable path and a parser/serializer for the current tab. Keep role checks in the render boundary so unauthorized admin paths fall back safely.
- Centralize strategy metadata and chart-facing normalization utilities in existing `src/lib` locations rather than adding parallel registries.

### 2. Routing and shared page shell

- Update `src/components/Dashboard.tsx` and `src/components/Sidebar.tsx` to initialize the active tab from the URL, update the URL on tab changes without full reloads, and respond to browser navigation.
- Preserve the existing auth/theme/header/sidebar layout and make mobile sidebar open/close behavior distinct from desktop collapse where needed.
- Standardize page wrappers, headings, responsive action areas, focus styles, and visible loading/error/empty states across `src/components/pages/*`.
- Keep existing CMS/admin role behavior and ensure direct navigation cannot expose admin content to non-admin users.

### 3. Chart reliability and visual consistency

- Fix the missing React hook imports in both current chart files and remove the risk of maintaining two divergent chart lifecycles.
- Make all chart consumers use the consolidated implementation, including the dashboard command chart and the four multi-timeframe terminal panels.
- Add one normalization path for candles, line overlays, horizontal lines, markers, and any supported zones: finite numeric values, ascending unique timestamps, safe empty data, and marker ordering.
- Clear the candle series and overlays when data is temporarily empty or a request changes symbol/timeframe so old data cannot appear under a new selection.
- Replace window-only width updates with a `ResizeObserver` that applies both width and height from the measured container, with cleanup for Strict Mode and unmounts.
- Fix provider/live-data timestamp handling, especially forex tick updates, so updates replace the current timeframe candle instead of creating one pseudo-candle per tick.
- Ensure chart containers have stable responsive heights inside the existing `main.overflow-y-auto`, dashboard grid, and mobile multi-timeframe layout.
- Validate theme changes, sidebar collapse, symbol/timeframe switches, empty/error responses, mobile breakpoint transitions, and all four terminal charts.

Primary files: `src/components/TradingTerminal.tsx`, `src/components/PriceChart.tsx`, `src/components/MultiTimeframeTerminal.tsx`, `src/components/AutonomousCommandCenter.tsx`, `src/components/Dashboard.tsx`, `src/index.css`, `src/lib/providers/forex.ts`, `src/lib/providers/binance.ts`, `src/lib/providers/stocks.ts`, and `src/lib/types.ts`.

### 4. Unified strategy catalog and expanded backtesting set

- Introduce stable strategy definitions with ID/version/name/category/description, supported timeframes, minimum candles, default parameters, detector, and backtest execution metadata.
- Start from the existing implementations and expose the useful catalog without duplicating logic: MA Crossover, RSI Divergence, Bollinger/volatility, Trend Following, Support/Resistance, Fibonacci, breakout, and mean-reversion variants where the existing code supports them.
- Register the existing orphaned Trend Following implementation and adapt the current legacy detectors into catalog entries where they are intended to be backtestable.
- Keep candlestick and extended chart patterns as typed evidence sources rather than silently treating every pattern name as a strategy.
- Make frontend dashboard analysis, Strategy Lab, Backtesting Center, and backend strategy analysis consume the same registry and timeframe/minimum-candle eligibility rules.
- Add strategy IDs and versions to signal/backtest provenance while preserving readable names in the UI and existing decision output compatibility where required by the reconciled code.
- Replace Strategy Lab’s four conceptual hard-coded cards and first-word signal lookup with registry-driven cards showing real active signals, availability, timeframe support, and no-signal states.
- Replace Backtesting Center’s hard-coded strategy options with registry options and ensure the selected definition is the one simulated.
- Record detector failures with enough context for an honest UI state instead of silently making a failed strategy look inactive.

Primary files: `src/lib/types.ts`, `src/lib/strategies.ts`, `src/lib/strategies/index.ts`, `src/lib/strategies/trend-following.ts`, `src/lib/patterns/*`, `src/components/pages/StrategyLab.tsx`, backend strategy engine/domain contracts, and any consumers discovered after sync.

### 5. Functional Backtesting Center

- Fix date-range options to use explicit numeric values for 100 candles, 500 candles, and all available data.
- Add controlled strategy/asset inputs and pass the selected strategy, current symbol, timeframe, and validated capital into the simulation.
- Use the portfolio-aware engine as the single UI execution path, with explicit, documented defaults for warmup, holding period, and execution timing; avoid claiming unsupported fees/slippage or live performance.
- Return result provenance: strategy ID/version, range, capital, timeframe, candle count, and execution assumptions.
- Render actual equity data as a chart using the shared chart approach (or an existing chart primitive if it can safely render the result), with a readable no-result/loading/error state.
- Render a responsive trade ledger with entry/exit times, side, prices, size, P&L, and strategy/reason fields; add an empty state when no trades qualify.
- Display win rate, total return/net profit, max drawdown, Sharpe where valid, total trades, and timeframe from the result rather than placeholders. Avoid displaying misleading metrics when the sample is too small.
- Add safeguards for invalid capital, insufficient candles, unsupported timeframes, and no eligible strategy signals.

Primary files: `src/components/pages/BacktestingCenter.tsx`, `src/lib/backtest/engine.ts`, `src/lib/backtest/metrics.ts`, `src/lib/backtest.ts`, and the unified strategy catalog.

### 6. Page-by-page functional pass

Use existing providers/backend APIs and make unavailable services explicit and actionable; do not invent credentials or silently fabricate live data.

- **Dashboard / terminal:** verify selectors, live updates, recommendation overlays, multi-timeframe panels, loading/error states, and responsive charts.
- **Markets:** connect available market data/status fields, make category tabs and empty/error states accurate, and avoid static “active” claims when no live status exists.
- **AI Analysis:** preserve the current ML refresh flow and clearly distinguish cached, loading, unavailable, and current prediction states.
- **Portfolio:** refresh reliably, calculate equity using available current prices where supported, and label any paper/entry-price fallback accurately.
- **Watchlists:** scope storage by user, validate malformed local storage safely, and expose current data only when a provider is available.
- **Alerts:** retain persistence and validation, then connect monitoring/triggered state only if an existing price/event service supports it; otherwise show configured-versus-monitoring status honestly.
- **News:** use any existing news/sentiment source, with retry and connection state; keep a clear setup state if no provider is configured.
- **Risk Management:** derive metrics from available portfolio/market data, make the sizing calculator safe for equal entry/stop and invalid values, and replace or clearly label unsupported correlation data.
- **AI Learning and Admin:** connect existing status/metrics APIs where available, add refresh/error/empty states, and replace static controls with working actions only when a backing service exists.
- **CMS/Settings:** verify direct route access, role gating, theme persistence, and accessible controls; keep notification settings honest if no persistence/service exists.

### 7. Validation and browser verification

- Add focused unit tests for route parsing, candle/overlay normalization, empty-chart clearing, provider timeframe bucketing, strategy registry eligibility, Strategy Lab signal matching, backtest range parsing, capital validation, and backtest metric calculations.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`; run backend typecheck if backend contracts/engine files change.
- Start the dev server and manually exercise every sidebar page at desktop and narrow mobile widths.
- Verify URL refresh, direct paths, browser back/forward, role-gated pages, theme switching, sidebar collapse/open, chart rendering on dashboard and terminal, symbol/timeframe changes, backtest execution, equity chart, and trade history.
- Treat any chart runtime error, stale chart data, broken route, misleading metric, or unhandled page loading/error state as a blocker before completion.
