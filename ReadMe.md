# Quantum Intelligence

> An AI-assisted paper-trading intelligence platform. Built with React, TypeScript, and Supabase.

**Status:** Early prototype — core frontend, basic backend, and a single baseline ML model are operational. Not production-ready.

---

## What exists today

- **React + Vite + TypeScript frontend** with Tailwind CSS and Lightweight Charts
- **Supabase backend** — Auth, PostgreSQL with RLS, Edge Functions
- **Live crypto data** via Binance REST + WebSocket
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
- **Role-based access** — User / Admin with CMS content management

## Architecture

```javascript
Frontend (React 18 + Vite)
  ├── src/components/      — UI components (Dashboard, PriceChart, etc.)
  ├── src/lib/             — Indicators, patterns, strategies, backtest, ML client
  ├── src/api/             — Centralized API layer
  └── src/context/         — Auth, theme, CMS state

Backend
  ├── backend/src/         — Fastify/Express API layer (Phase 0)
  │   ├── controllers/     — Route handlers
  │   ├── services/        — Business logic
  │   ├── repositories/    — Supabase data access
  │   ├── engines/         — Intelligence engines (decision, risk, pattern, etc.)
  │   └── routes/          — REST route definitions
  └── supabase/
      ├── functions/       — Edge Functions (ml-predict, kinetic-coach, decision-analyze)
      └── migrations/      — Versioned schema + RLS policies
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Lightweight Charts, Lucide React |
| Backend API | Fastify (Node.js/TypeScript) |
| Edge Functions | Deno / TypeScript (Supabase) |
| Database | Supabase PostgreSQL with RLS |
| Auth | Supabase Auth (JWT) |
| Real-time | WebSockets (Binance) |
| ML Baseline | Custom logistic regression (Deno edge function) |
| Testing | Vitest |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)
- A Binance account (no API key needed for public market data)
- (Optional) Google Gemini API key for the Kinetic Coach

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
| `ML_SERVICE_API_KEY` | Generate a random secret string |
| `GEMINI_API_KEY` | Google AI Studio |
| `CORS_ORIGIN` | `http://localhost:5173` for local dev |
| `VITE_BACKEND_URL` | `http://localhost:8787` for local backend |

For the local Supabase Edge Function runtime, set `BACKEND_URL` to a URL reachable from its container (for example `http://host.docker.internal:8787` on Docker Desktop) and set `ML_FUNCTION_ENV=development`. Hosted Edge Functions require `BACKEND_URL` to be an HTTPS URL; configure `BACKEND_URL` and `ML_FUNCTION_ENV=production` as server-side function secrets. If `BACKEND_URL` is missing, ML prediction/retraining returns a generic 503 instead of calling localhost.

### 3. Database setup

Run the migrations in `supabase/migrations/` against your Supabase project (via the SQL Editor or Supabase CLI).

### 4. Start the frontend

```bash
npm run dev        # Starts Vite dev server on :5173
```

### 5. Start the backend (optional — backend is in early Phase 0)

```bash
npm run backend:dev   # Starts Fastify API on :8787
```

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
| `npm run dev` | Start frontend dev server |
| `npm run backend:dev` | Start backend dev server (watch mode) |
| `npm run backend` | Start backend once |
| `npm run backend:typecheck` | Type-check backend only |
| `npm run build` | Production build (frontend) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (frontend) |
| `npm run test` | Run Vitest suite |
| `npm run preview` | Preview production build |

---

## Roadmap

### ✅ Completed

- Frontend foundation (React + Vite + Tailwind)
- Supabase auth + database + RLS
- Binance crypto data integration
- Core technical indicators
- 8 strategy implementations
- Basic ML prediction (logistic regression edge function)
- Live market data via WebSocket
- AI Coach (Gemini integration)
- Paper trading positions
- Backtest scaffolding

### 🚧 In Progress / Next Up

- [ ] Backend API stabilization (controllers → services → repositories)
- [ ] Per-market, per-timeframe ML model persistence
- [ ] Honest backtest validation (fees, slippage, walk-forward, buy-and-hold baseline)
- [ ] Test coverage for core engines and backtester
- [ ] Rate limiting on edge functions
- [ ] CI/CD pipeline (typecheck → lint → test)

### 📋 Planned (not yet started)

- [ ] Multi-market data (Forex via Twelve Data, stocks)
- [ ] Advanced ML models (XGBoost / LightGBM baseline)
- [ ] Reinforcement learning experiments
- [ ] Full explainable-AI trade cards
- [ ] Docker containerization
- [ ] Production monitoring & alerting

---

## Honest Notes

- The current ML model is a **baseline logistic regression** trained on 14 engineered features. It is intentionally simple and serves as a starting point, not a production-grade predictor.
- The backend (`backend/src/`) is in **Phase 0** — structure exists, but many routes are stubs or lightly wired.
- **No real money trading.** This is a paper-trading / research platform only.

---

## License

MIT
