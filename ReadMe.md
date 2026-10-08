# Quantum Intelligence

> An AI-assisted paper-trading intelligence platform. Built with React, TypeScript, and Supabase.

**Status:** Research and paper-trading prototype. No real-money execution is available; provider access and migrations must be verified in each environment before use.

---

## What exists today

- **React + Vite + TypeScript frontend** with Tailwind CSS and Lightweight Charts
- **Supabase backend** — Auth, PostgreSQL with RLS, Edge Functions
- **Market data** through the backend provider layer (Massive and Twelve Data); browser updates poll the API and provider availability remains unverified until probed.
- **Technical indicators** — SMA, EMA, RSI, MACD, ATR, Bollinger Bands, plus additional indicators (ADX, CCI, Ichimoku, Stochastic, Volume Profile, etc.)
- **Pattern recognition** — Candlestick and chart-pattern detection
- **Market structure engine** — HH/HL/LH/LL, BOS, CHoCH
- **Smart Money Concepts** — Order blocks, FVGs, liquidity sweeps
- **8 trading strategies** with signal combination
- **Paper trading** — position tracking and simulated execution
- **Backtesting** — walk-forward and Monte Carlo scaffolding
- **ML prediction edge function** — logistic regression classifier trained per `(symbol, timeframe)` on engineered OHLCV features
- **Kinetic Coach** — Gemini-powered trading assistant
- **Explainable trade cards** — reasoning breakdown per signal
- **Multi-timeframe analysis** — 1m through 1M
- **Role-based access** — User / Admin with CMS content management, manual event blackouts, and Supabase MFA support

## Architecture

```text
React UI → authenticated Fastify API → market/provider services + paper-trading state
                                      ↘ Supabase PostgreSQL (RLS) / Edge Functions

Trader Desk paper workflow:
Planner → Executor → Manager → Reviewer
  creates    gates       manages   records research evidence
  plan       entries     exits
```

Provider keys stay server-side. Trader decisions use market and risk data only; news and sentiment are not signal inputs. See `docs/RESEARCH.md` and `docs/VERIFICATION.md` for evidence and limitations.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Lightweight Charts, Lucide React |
| Backend API | Fastify (Node.js/TypeScript) |
| Edge Functions | Deno / TypeScript (Supabase) |
| Database | Supabase PostgreSQL with RLS |
| Auth | Supabase Auth (JWT) |
| Market data | Massive / Twelve Data through Fastify; browser polling |
| ML Baseline | Custom logistic regression (Deno edge function) |
| Testing | Vitest |

---

## Getting Started

### Prerequisites

- Node.js 20.11+
- A Supabase project (free tier works)
- Massive API key for the configured crypto markets; verify markets with the admin probe before relying on them
- Twelve Data API key only for symbols assigned to that provider
- Optional Google Gemini API key for Kinetic Coach

### 1. Clone & install

```bash
git clone https://github.com/keelson18/ML.git
cd ML
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Source |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Project Settings → API (server-only) |
| `MASSIVE_API_KEY` | Market-data provider account (server-only) |
| `TWELVEDATA_API_KEY` | Optional market-data provider account (server-only) |
| `ML_SERVICE_API_KEY` | Generate a random secret string |
| `GEMINI_API_KEY` | Google AI Studio (server-only) |
| `CORS_ORIGIN` | `http://localhost:5173` for local dev |
| `VITE_BACKEND_URL` | `http://localhost:8787` for local backend |

For the local Supabase Edge Function runtime, set `BACKEND_URL` to a URL reachable from its container (for example `http://host.docker.internal:8787` on Docker Desktop) and set `ML_FUNCTION_ENV=development`. Hosted Edge Functions require `BACKEND_URL` to be an HTTPS URL; configure `BACKEND_URL` and `ML_FUNCTION_ENV=production` as server-side function secrets. If `BACKEND_URL` is missing, ML prediction/retraining returns a generic 503 instead of calling localhost.

Trader Desk and event-risk parameters are server-side and validated from `.env.example`. Provider symbols are unverified until the backend probe succeeds. Manual blackout windows block entries when configured and position management remains independent of entry holds.

The initial Trader Desk planner is available through the authenticated `POST /api/v1/trader/plans/refresh` route; plans are read from `GET /api/v1/trader/plans`. Apply the new Trader Desk migrations before using these endpoints. Planner refreshes analyze the configured crypto universe with closed 1d/4h/trigger timeframe data, preserve the configured watchlist cap, and default to no plan when evidence is incomplete or conflicting. Authenticated users can read their plans, plan events, paper orders, journal entries, and daily reviews from `/api/v1/trader/*`. Paper sizing is based on stop distance and marked account equity, with cash, gross exposure, and per-symbol exposure caps from configuration. Immediate BUY/SELL execution is disabled while the persisted trigger workflow is built out. Crypto session filtering is off (24/7). Non-crypto paper entries require explicit exchange calendars in `MARKET_SESSION_CALENDAR_JSON`; missing calendars, holidays, closed periods, and configured opening/closing auction windows are blocked. See `docs/RESEARCH.md` for sample-size, calibration, baselines, and paper-result limitations.

### 3. Database setup

Apply migrations with the Supabase CLI and compare the resulting migration history to the repository before using the app. If applying through SQL Editor, record the applied migration IDs separately. Do not remove duplicate-looking SQL files until the owner supplies the production-applied migration list; see `docs/MIGRATIONS.md`.

### 4. Start the app

```bash
npm run dev
```

This starts the Fastify API on `AUTONOMY_PORT` (default 8787), waits for `/health`, then starts Vite on port 5173. For split processes, use `npm run backend:dev` and `npm run dev:web`; do not run the combined command and a second backend on the same port. `npm run dev:web` alone requires a reachable backend configured through `VITE_BACKEND_URL` or `AUTONOMY_PROXY_TARGET`.

### 6. Deploy edge functions (optional)

If using Supabase CLI:

```bash
supabase functions deploy ml-predict
supabase functions deploy kinetic-coach
supabase functions deploy decision-analyze
```

---

## Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Fastify backend and Vite frontend |
| `npm run dev:web` | Start Vite only |
| `npm run backend:dev` | Start backend dev server (watch mode) |
| `npm run backend` | Start backend once |
| `npm run backend:typecheck` | Type-check backend only |
| `npm run build` | Production build (frontend) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (frontend) |
| `npm run test` | Run Vitest suite |
| `npm run check:env` | Fail when an application environment read is missing from `.env.example` |
| `npm run preview` | Preview production build |

## Troubleshooting

- **“Market data unavailable”** — Confirm `npm run dev` started both Fastify and Vite and that the API `/health` endpoint is reachable on `AUTONOMY_PORT` (default 8787). Check that `VITE_BACKEND_URL` or `AUTONOMY_PROXY_TARGET` matches that port, then inspect the API process for startup configuration errors naming `MASSIVE_API_KEY`, `MARKET_SESSION_CALENDAR_JSON`, or another invalid variable.
- **Provider returns 429 / market remains unverified** — Provider limits and keys are environment-specific. Wait for the provider reset, verify the key server-side, and use Admin → Market Availability → Probe markets. Do not treat registry presence as verified access.
- **Auth settings or new routes unavailable** — Confirm the required Supabase migrations were applied and compare their IDs with Supabase migration history. Do not rerun or remove duplicate migrations blindly; see `docs/MIGRATIONS.md`.
- **Edge Function ML request unavailable** — Set `BACKEND_URL` to an address reachable from the Edge Function runtime and set `ML_FUNCTION_ENV` to `development` or `production` as appropriate. Production requires HTTPS.
- **Missing Supabase configuration** — Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in the frontend environment; keep provider and service-role keys server-only.

---

## Roadmap

### ✅ Completed

- Frontend foundation (React + Vite + Tailwind)
- Supabase auth + database + RLS
- Backend market provider layer (Massive and Twelve Data; availability must be probed)
- Core technical indicators
- 8 strategy implementations
- Basic ML prediction (logistic regression edge function)
- Backend-polled market data (provider availability is not guaranteed)
- AI Coach (Gemini integration)
- Paper trading positions
- Backtest scaffolding

### 🚧 In Progress / Next Up

- [ ] Backend API stabilization (controllers → services → repositories)
- [ ] Per-market, per-timeframe ML model persistence
- [ ] Honest backtest validation (fees, slippage, walk-forward, buy-and-hold baseline)
- [ ] Test coverage for core engines and backtester
- [ ] Rate limiting on edge functions
- [x] GitHub Actions CI (environment check, typechecks, lint, tests, build, non-blocking dependency audit)

### 📋 Planned (not yet started)

- [ ] Configure and validate production market/news/calendar providers; current live availability is not verified
- [ ] Multi-market data (Forex via Twelve Data, stocks)
- [ ] Advanced ML models (XGBoost / LightGBM baseline)
- [ ] Reinforcement learning experiments
- [ ] Full explainable-AI trade cards
- [ ] Docker containerization
- [ ] Production monitoring & alerting

---

## Honest Notes

- The current ML model is a **baseline logistic regression** trained on 14 engineered features. It is intentionally simple and serves as a starting point, not a production-grade predictor.
- A successful build or unit test does not establish provider availability, deployed migration state, account-security policy, or live end-to-end operation. Check `docs/VERIFICATION.md` for the current evidence status.
- **No real money trading.** This is a paper-trading / research platform only.

---

## License

MIT
