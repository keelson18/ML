# Quantum — Chief Engineer's Build Specification
## Architecture, UI, Roles & Roadmap

---

> *This is the technical build specification. It assumes you have read "How I Would Build Quantum" (the trading philosophy and vision document) and are now ready to architect the actual system.*

---

## 1. System Architecture

### 1.1 High-Level Design

Quantum is a **distributed full-stack trading intelligence platform** with a clear separation between presentation, orchestration, intelligence, and data.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Quantum PLATFORM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         FRONTEND LAYER                               │   │
│   │  React 18 + Vite + TypeScript + Tailwind + Lightweight Charts       │   │
│   │  Custom Canvas Overlay (drawings) | Zustand | TanStack Query       │   │
│   └─────────────────────────────┬───────────────────────────────────────┘   │
│                                 │ HTTPS / WebSocket                         │
│                                 ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         API GATEWAY                                  │   │
│   │  Fastify + TypeScript | Auth | Rate Limit | Validation | Logging    │   │
│   └─────────────────────────────┬───────────────────────────────────────┘   │
│                                 │                                           │
│           ┌─────────────────────┼─────────────────────┐                     │
│           ▼                     ▼                     ▼                     │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│   │  WS Server   │    │  API Service │    │  Ingestion   │               │
│   │  (Node.js)   │    │  (Fastify)   │    │  Worker      │               │
│   │  Real-time   │    │  Business    │    │  (Node.js)   │               │
│   │  push        │    │  logic       │    │  EODHD poll  │               │
│   └──────────────┘    └──────┬───────┘    └──────────────┘               │
│                              │                                            │
│                              ▼                                            │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     INTELLIGENCE ORCHESTRATION                       │   │
│   │  Engine Registry | Master Decision | Risk Gate | Explainability     │   │
│   └─────────────────────────────┬───────────────────────────────────────┘   │
│                                 │                                           │
│     ┌──────────┬──────────┬─────┴─────┬──────────┬──────────┐             │
│     ▼          ▼          ▼           ▼          ▼          ▼             │
│  ┌──────┐  ┌──────┐  ┌──────┐    ┌──────┐  ┌──────┐  ┌──────┐          │
│  │Market│  │Strat-│  │ Risk │    │Port- │  │  ML  │  │Know- │          │
│  │Intel.│  │egy   │  │Intel.│    │folio │  │Serv.│  │ledge │          │
│  └──────┘  └──────┘  └──────┘    └──────┘  └──────┘  └──────┘          │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         DATA LAYER                                   │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │   │
│   │  │  Supabase   │  │    Redis    │  │  ML Artifacts│               │   │
│   │  │ PostgreSQL  │  │   (Cache)   │  │  (S3/Local)  │               │   │
│   │  │  (Auth/DB)  │  │  (Pub/Sub)  │  │              │               │   │
│   │  └─────────────┘  └─────────────┘  └─────────────┘               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     EXTERNAL INTEGRATIONS                            │   │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐                        │   │
│   │  │   EODHD  │  │  Binance │  │  News API│  (Future: Brokers)    │   │
│   │  │ (Primary)│  │ (Crypto) │  │          │                        │   │
│   │  └──────────┘  └──────────┘  └──────────┘                        │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Service Boundaries

| Service | Runtime | Responsibility | Why |
|---------|---------|---------------|-----|
| `web` | React + Vite | Trading terminal, dashboards, research UI, admin panels | Thin presentation layer. All state is server source of truth. |
| `api` | Node.js + Fastify | Auth, business logic, engine orchestration, paper trading, backtesting | TypeScript is superior for financial logic, type safety across stack. |
| `ws` | Node.js + ws library | WebSocket connections, real-time broadcast, heartbeat management | Dedicated WS service prevents blocking API requests. |
| `ingest` | Node.js worker | EODHD REST polling, WebSocket streaming, normalization, quality checks, DB writes | Isolated from user-facing services. Can be scaled independently. |
| `ml` | Node.js/Deno | Feature engineering, model inference, lightweight training, drift detection | Stays in TypeScript ecosystem per Master Prompt. ONNX runtime for LightGBM. |

### 1.3 Data Flow

**Real-Time Market Data:**
```
EODHD WebSocket → Ingest Worker → Normalizer → Quality Check → Redis Pub/Sub → WS Server → Frontend Chart
                                    ↓
                              PostgreSQL (TimescaleDB extension)
```

**Decision Pipeline:**
```
New Candle → Ingest Worker publishes event → API Service triggers engine pipeline → Evidence collected → Decision generated → Risk Gate → If approved: Paper Order created + Drawing commands emitted → WS Server pushes to frontend
                                    ↓
                              Decision persisted to PostgreSQL
```

**Backtesting:**
```
User configures backtest → API Service loads historical candles from PostgreSQL → Bar-by-bar simulation (same engine code as live) → Results calculated → Metrics stored → Equity curve returned
```

---

## 2. Technology Stack (With Justification)

### 2.1 Frontend
- **React 18** — Component model, ecosystem, team familiarity.
- **TypeScript 5.5** — Strict mode. Zero `any` types in trading logic.
- **Vite 5** — Fast HMR, native ESM, simpler config than webpack.
- **Tailwind CSS 3** — Utility-first, rapid UI iteration, dark mode support.
- **Lightweight Charts** — Financial charting. 60fps, no dependencies, perfect for candlesticks.
- **Custom HTML5 Canvas Overlay** — Sits on top of Lightweight Charts. Draws structure, liquidity, OBs, FVGs, entry zones, SL, targets. Full control over rendering.
- **Zustand** — UI state only (sidebar, theme, chart settings, alert visibility). No server state.
- **TanStack Query v5** — Server state, caching, background refetch, optimistic updates.
- **React Router 6** — Client-side routing, protected routes by role.
- **Lucide React** — Consistent iconography.
- **Recharts / Visx** — For dashboard metrics, equity curves, pie charts (not for candlesticks).

### 2.2 Backend
- **Node.js 20 LTS** — Runtime.
- **Fastify 4** — Faster than Express, built-in JSON schema validation, excellent plugin architecture, native WebSocket support.
- **TypeScript 5.5** — Same language as frontend. Shared types package.
- **Prisma ORM** — Type-safe database access, migration management, query optimization.
- **Zod** — Runtime schema validation for all API inputs.
- **JWT (jsonwebtoken)** — Auth tokens, role claims.
- **bcrypt** — Password hashing.
- **Helmet** — Security headers.
- **Rate-limiter-flexible** — Redis-backed rate limiting.

### 2.3 Data & Messaging
- **Supabase PostgreSQL 15** — Primary database. Auth, user data, decisions, positions, backtests.
- **TimescaleDB Extension** — For candle storage. Native compression, continuous aggregates, time-based partitioning. Critical for 5+ years of 1m data.
- **Redis 7** — Hot cache (latest candles, active decisions, sessions), rate limiting, pub/sub for real-time events.
- **Supabase Auth** — Email/password auth, JWT sessions, RLS integration.

### 2.4 Machine Learning
- **ONNX Runtime Node.js** — Run exported LightGBM/XGBoost models in Node.js. No Python required.
- **TensorFlow.js** — Client-side inference only (pre-trained lightweight models). No training in browser.
- **Simple Statistics / MLJS** — TypeScript statistical libraries for baseline models (logistic regression, k-means for regimes).
- **Custom Feature Pipeline** — TypeScript feature engineering, point-in-time correct.

### 2.5 DevOps
- **Docker + Docker Compose** — Local development stack.
- **Turborepo + pnpm** — Monorepo management, task pipelining, caching.
- **GitHub Actions** — CI/CD: typecheck, lint, test, build, deploy.
- **Vercel** — Frontend hosting.
- **Railway / Render** — Backend services (API, WS, Ingest, ML).
- **Supabase** — Managed PostgreSQL + Auth.
- **Upstash** — Managed Redis.

---

## 3. Monorepo File Structure

```
Quantum/
├── apps/
│   ├── web/                          # React + Vite frontend
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── routes/             # React Router route definitions
│   │   │   │   ├── index.tsx       # Dashboard
│   │   │   │   ├── terminal.tsx    # Trading terminal (main interface)
│   │   │   │   ├── backtest.tsx
│   │   │   │   ├── portfolio.tsx
│   │   │   │   ├── risk.tsx
│   │   │   │   ├── ai-center.tsx
│   │   │   │   ├── research.tsx
│   │   │   │   ├── journal.tsx
│   │   │   │   ├── settings.tsx
│   │   │   │   ├── admin/          # Admin routes (protected)
│   │   │   │   │   ├── dashboard.tsx
│   │   │   │   │   ├── users.tsx
│   │   │   │   │   ├── strategies.tsx
│   │   │   │   │   ├── models.tsx
│   │   │   │   │   ├── audit.tsx
│   │   │   │   │   └── system.tsx
│   │   │   │   └── auth.tsx        # Login / Register
│   │   │   ├── components/
│   │   │   │   ├── layout/
│   │   │   │   │   ├── AppShell.tsx          # Main layout wrapper
│   │   │   │   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   │   │   │   ├── TopBar.tsx            # Session clock, account, heat
│   │   │   │   │   ├── BottomBar.tsx         # Decision bar
│   │   │   │   │   └── Breadcrumbs.tsx
│   │   │   │   ├── charts/
│   │   │   │   │   ├── CandlestickChart.tsx  # Lightweight Charts wrapper
│   │   │   │   │   ├── DrawingOverlay.tsx    # HTML5 Canvas overlay
│   │   │   │   │   ├── TimeframeChart.tsx    # Single timeframe chart component
│   │   │   │   │   ├── MultiTimeframeLayout.tsx # HTF + Execution + LTF
│   │   │   │   │   ├── DrawingLegend.tsx     # Toggle visibility of drawings
│   │   │   │   │   └── SessionMarkers.tsx    # Kill zone highlights
│   │   │   │   ├── trading/
│   │   │   │   │   ├── DecisionBar.tsx       # BUY/SELL/WATCH/NO_TRADE bar
│   │   │   │   │   ├── EvidencePanel.tsx     # Confluence meters
│   │   │   │   │   ├── ExplanationOverlay.tsx # Hover explanations
│   │   │   │   │   ├── PositionLine.tsx      # Open position visualization
│   │   │   │   │   ├── OrderConfirmation.tsx # Execute paper trade modal
│   │   │   │   │   └── TradeReviewCard.tsx   # Post-trade review
│   │   │   │   ├── dashboard/
│   │   │   │   │   ├── MarketOverview.tsx
│   │   │   │   │   ├── ActiveDecisions.tsx
│   │   │   │   │   ├── OpenPositions.tsx
│   │   │   │   │   ├── PortfolioHeat.tsx
│   │   │   │   │   ├── PatienceScore.tsx
│   │   │   │   │   └── AlertFeed.tsx
│   │   │   │   ├── backtest/
│   │   │   │   │   ├── BacktestConfigForm.tsx
│   │   │   │   │   ├── EquityCurveChart.tsx
│   │   │   │   │   ├── MetricsGrid.tsx
│   │   │   │   │   ├── TradeList.tsx
│   │   │   │   │   └── ComparisonView.tsx
│   │   │   │   ├── portfolio/
│   │   │   │   │   ├── PositionTable.tsx
│   │   │   │   │   ├── AllocationChart.tsx
│   │   │   │   │   ├── DrawdownChart.tsx
│   │   │   │   │   └── PerformanceStats.tsx
│   │   │   │   ├── risk/
│   │   │   │   │   ├── RiskDashboard.tsx
│   │   │   │   │   ├── RiskJournal.tsx
│   │   │   │   │   ├── CircuitBreakerStatus.tsx
│   │   │   │   │   └── CorrelationMatrix.tsx
│   │   │   │   ├── ai/
│   │   │   │   │   ├── ModelStatusCards.tsx
│   │   │   │   │   ├── FeatureImportanceChart.tsx
│   │   │   │   │   ├── TrainingControls.tsx
│   │   │   │   │   └── DriftAlertPanel.tsx
│   │   │   │   ├── admin/
│   │   │   │   │   ├── UserManagementTable.tsx
│   │   │   │   │   ├── SystemAnalytics.tsx
│   │   │   │   │   ├── StrategyApprovalPanel.tsx
│   │   │   │   │   ├── ModelDeploymentPanel.tsx
│   │   │   │   │   ├── AuditLogViewer.tsx
│   │   │   │   │   └── RoleAssignment.tsx
│   │   │   │   ├── journal/
│   │   │   │   │   ├── DailyJournalEntry.tsx
│   │   │   │   │   ├── TradeReviewList.tsx
│   │   │   │   │   └── KnowledgeGraphViz.tsx
│   │   │   │   └── common/
│   │   │   │       ├── Button.tsx
│   │   │   │       ├── Card.tsx
│   │   │   │       ├── Modal.tsx
│   │   │   │       ├── Tooltip.tsx
│   │   │   │       ├── Badge.tsx
│   │   │   │       ├── ProgressBar.tsx
│   │   │   │       ├── LoadingSpinner.tsx
│   │   │   │       ├── EmptyState.tsx
│   │   │   │       └── ErrorBoundary.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useAuth.ts
│   │   │   │   ├── useMarketStream.ts      # WebSocket subscription
│   │   │   │   ├── useDecisionEngine.ts
│   │   │   │   ├── usePaperTrading.ts
│   │   │   │   ├── useBacktest.ts
│   │   │   │   ├── usePortfolio.ts
│   │   │   │   ├── useRisk.ts
│   │   │   │   ├── useDrawings.ts          # Chart drawing state
│   │   │   │   ├── useSessionClock.ts
│   │   │   │   └── useRole.ts              # Role-based access hook
│   │   │   ├── stores/
│   │   │   │   ├── uiStore.ts              # Sidebar, theme, chart settings
│   │   │   │   ├── chartStore.ts           # Drawing visibility, zoom, pan
│   │   │   │   └── alertStore.ts           # Alert queue, unread count
│   │   │   ├── lib/
│   │   │   │   ├── api.ts                  # Axios/fetch client with auth
│   │   │   │   ├── ws.ts                   # WebSocket client
│   │   │   │   ├── constants.ts
│   │   │   │   └── utils.ts
│   │   │   ├── types/
│   │   │   │   └── index.ts                # Re-exports from @Quantum/shared
│   │   │   └── styles/
│   │   │       └── index.css
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── api/                          # Fastify API service
│   │   ├── src/
│   │   │   ├── server.ts             # Fastify bootstrap
│   │   │   ├── plugins/
│   │   │   │   ├── auth.ts           # JWT verification
│   │   │   │   ├── rbac.ts           # Role-based access control
│   │   │   │   ├── rateLimit.ts      # Redis-backed rate limiting
│   │   │   │   ├── logger.ts         # Structured logging (Pino)
│   │   │   │   ├── cors.ts
│   │   │   │   └── errorHandler.ts
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts           # Login, register, refresh, logout
│   │   │   │   ├── market.ts         # Candles, latest, symbols
│   │   │   │   ├── decisions.ts      # Decision history, latest, explain
│   │   │   │   ├── paper.ts          # Positions, orders, execute, close
│   │   │   │   ├── backtest.ts       # Run, status, results
│   │   │   │   ├── portfolio.ts      # Exposure, P&L, analytics
│   │   │   │   ├── risk.ts           # Profile, checks, events, journal
│   │   │   │   ├── ml.ts             # Status, predict, trigger training
│   │   │   │   ├── knowledge.ts      # Nodes, relationships, search
│   │   │   │   ├── research.ts       # Experiments, results, approval
│   │   │   │   ├── journal.ts        # Reviews, daily entries
│   │   │   │   ├── alerts.ts         # List, mark read, subscribe
│   │   │   │   └── admin.ts          # User mgmt, analytics, audit (protected)
│   │   │   ├── services/
│   │   │   │   ├── authService.ts
│   │   │   │   ├── marketDataService.ts
│   │   │   │   ├── decisionService.ts
│   │   │   │   ├── paperTradingService.ts
│   │   │   │   ├── backtestService.ts
│   │   │   │   ├── portfolioService.ts
│   │   │   │   ├── riskService.ts
│   │   │   │   ├── mlService.ts
│   │   │   │   ├── knowledgeService.ts
│   │   │   │   ├── researchService.ts
│   │   │   │   └── adminService.ts
│   │   │   ├── engines/
│   │   │   │   ├── registry.ts       # Engine plugin registry
│   │   │   │   ├── types.ts          # IAnalysisEngine interface
│   │   │   │   ├── dataQualityEngine.ts
│   │   │   │   ├── marketContextEngine.ts
│   │   │   │   ├── structureEngine.ts
│   │   │   │   ├── liquidityEngine.ts
│   │   │   │   ├── patternEngine.ts
│   │   │   │   ├── indicatorEngine.ts
│   │   │   │   ├── regimeEngine.ts
│   │   │   │   ├── strategyEngine.ts
│   │   │   │   ├── historicalSimilarityEngine.ts
│   │   │   │   ├── knowledgeEngine.ts
│   │   │   │   ├── mlEngine.ts
│   │   │   │   ├── aiReasoningEngine.ts
│   │   │   │   ├── riskEngine.ts
│   │   │   │   ├── portfolioEngine.ts
│   │   │   │   ├── masterDecisionEngine.ts
│   │   │   │   ├── explainabilityEngine.ts
│   │   │   │   └── tradeReviewEngine.ts
│   │   │   ├── domain/
│   │   │   │   ├── candle.ts
│   │   │   │   ├── evidence.ts
│   │   │   │   ├── decision.ts
│   │   │   │   ├── position.ts
│   │   │   │   ├── risk.ts
│   │   │   │   └── portfolio.ts
│   │   │   ├── infrastructure/
│   │   │   │   ├── prisma.ts         # Prisma client
│   │   │   │   ├── redis.ts          # Redis client
│   │   │   │   ├── supabase.ts       # Supabase admin client
│   │   │   │   ├── eodhdClient.ts    # EODHD REST client
│   │   │   │   └── wsPublisher.ts    # Publish to WS server via Redis
│   │   │   └── config/
│   │   │       └── index.ts          # Environment validation
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # Full database schema
│   │   │   └── migrations/           # Versioned migrations
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── ws/                           # WebSocket server
│   │   ├── src/
│   │   │   ├── server.ts             # ws server bootstrap
│   │   │   ├── auth.ts               # WS connection auth (JWT from query param)
│   │   │   ├── broadcaster.ts        # Broadcast to rooms (symbol-based)
│   │   │   ├── rooms.ts              # Room management (symbol:timeframe)
│   │   │   └── subscriber.ts         # Subscribe to Redis pub/sub
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── ingest/                       # Market data ingestion worker
│   │   ├── src/
│   │   │   ├── worker.ts             # Main loop
│   │   │   ├── providers/
│   │   │   │   ├── eodhdRest.ts      # EODHD REST adapter
│   │   │   │   ├── eodhdWs.ts        # EODHD WebSocket adapter
│   │   │   │   └── binanceAdapter.ts # Binance adapter (secondary)
│   │   │   ├── normalizer.ts         # Candle normalization
│   │   │   ├── quality.ts            # Data quality checks
│   │   │   ├── store.ts              # Prisma/DB writer
│   │   │   └── publisher.ts          # Redis pub/sub publisher
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── ml/                           # ML service (TypeScript)
│       ├── src/
│       │   ├── main.ts               # Fastify or Express server
│       │   ├── features/
│       │   │   ├── pipeline.ts       # Feature engineering
│       │   │   └── store.ts          # Feature storage/retrieval
│       │   ├── models/
│       │   │   ├── registry.ts       # Model version registry
│       │   │   ├── lightgbm.ts       # LightGBM via ONNX
│   │   │   │   └── tfjs.ts           # TensorFlow.js models
│   │   │   ├── training/
│   │   │   │   └── scheduler.ts      # Training job scheduler
│   │   │   ├── inference/
│   │   │   │   └── predictor.ts      # Prediction endpoint
│   │   │   └── monitoring/
│   │   │       └── drift.ts          # Drift detection
│   │   ├── Dockerfile
│   │   └── package.json
│
├── packages/
│   ├── shared/                       # Shared types, schemas, constants
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── auth.ts           # User, Role, Session types
│   │   │   │   ├── market.ts         # Candle, Symbol, Timeframe
│   │   │   │   ├── evidence.ts       # Evidence, EngineResult
│   │   │   │   ├── decision.ts       # TradeDecision, DecisionType
│   │   │   │   ├── position.ts       # PaperPosition, PaperOrder
│   │   │   │   ├── risk.ts           # RiskProfile, RiskCheck
│   │   │   │   ├── backtest.ts       # BacktestConfig, BacktestResult
│   │   │   │   ├── drawing.ts        # DrawingCommand, DrawingType
│   │   │   │   └── index.ts
│   │   │   ├── schemas/
│   │   │   │   └── index.ts          # Zod schemas for validation
│   │   │   └── constants/
│   │   │       └── index.ts          # Timeframes, sessions, limits
│   │   └── package.json
│   │
│   ├── ts-config/                    # Shared TypeScript configs
│   └── eslint-config/                # Shared ESLint + Prettier configs
│
├── supabase/
│   ├── migrations/                   # Supabase CLI migrations
│   └── functions/                    # Edge Functions (auth hooks only)
│       └── auth-hooks/
│           └── index.ts
│
├── docker-compose.yml                # Local dev stack
├── turbo.json                        # Turborepo pipeline
├── pnpm-workspace.yaml
└── README.md
```

---

## 4. UI/UX Design Specification

### 4.1 Design Philosophy
- **Dark mode default** — Traders operate in low-light environments. Dark reduces eye strain.
- **Information density** — Professional terminals show maximum relevant data. No wasted space.
- **Color semantics** — Green = bullish/profit/approved. Red = bearish/loss/rejected. Yellow = warning/watch. Blue = structure/information. Orange = order blocks. Purple = breaker blocks. Cyan = FVGs.
- **Motion** — Subtle animations for state changes (decision bar slide-in, evidence meter fill, alert pulse). No distracting motion.
- **Accessibility** — All drawings must have ARIA labels. Color is not the only indicator (patterns, labels, icons).

### 4.2 The Terminal (Primary Interface)

**Layout Grid:**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Logo] Dashboard  Terminal  Backtest  Portfolio  Risk  AI  Research  Journal│
│ [Symbol: EUR/USD] [TF: 15m] [Session: 🔵 NY Open] [Heat: 4.2/6%] [Alerts: 3]│
├──────────┬──────────────────────────────────────────────┬───────────────────┤
│          │                                              │                   │
│  HTF     │           EXECUTION CHART                  │   EVIDENCE        │
│  (4H)    │           (15m Primary)                    │   PANEL           │
│          │                                              │                   │
│  [Bias   │  ┌────────────────────────────────────┐    │  Structure  [████│
│   Arrow] │  │ Trend Line ────────────────        │    │  Liquidity  [████│
│  BOS: 3c │  │ OB ████████████████                │    │  Pattern    [██░░│
│  ago     │  │ FVG ░░░░░░░░░░░░░░                 │    │  Indicator  [████│
│  Key     │  │ Liquidity ─ ─ ─ ─ ─ ─              │    │  Regime     [████│
│  Levels  │  │ Entry ╔═══════════════             │    │  ML         [██░░│
│          │  │ SL    ║                            │    │                   │
│  [Bullish│  │ TP1   ║ 1:2.5                      │    │  Confidence [████│
│   Bias]  │  │ TP2   ║ 1:3.5                      │    │  78%              │
│          │  │ TP3   ║ 1:4.5                      │    │                   │
│          │  └────────────────────────────────────┘    │  [Explain]        │
│          │                                              │  [View Evidence]  │
├──────────┼──────────────────────────────────────────────┼───────────────────┤
│          │                                              │                   │
│  LTF     │           DECISION BAR                     │   POSITIONS       │
│  (5m)    │                                              │   (if any)        │
│          │  [BUY]  Confidence: 78%  R:R 1:2.5         │   EUR/USD +$45    │
│  [Entry  │  Risk: 1.2%  Size: 2.4 units              │   GBP/USD -$12    │
│   Conf.  │                                              │                   │
│   Formed]│  [Execute Paper Trade]  [Skip]  [Explain]  │  [Portfolio]      │
│          │                                              │                   │
│          │  ⚠️ Risk Gate: APPROVED | Portfolio: 2/5   │                   │
│          │                                              │                   │
└──────────┴──────────────────────────────────────────────┴───────────────────┘
```

**Panel Specifications:**

| Panel | Width | Height | Content |
|-------|-------|--------|---------|
| HTF Chart | 20% | 55% | 4H/1D candlesticks, bias arrow, key levels, BOS/MSS markers |
| Execution Chart | 55% | 55% | 15m/1H candlesticks, ALL drawings, entry zone, SL, targets, position lines |
| Evidence Panel | 25% | 55% | Confluence meters, confidence score, explanation buttons |
| LTF Chart | 20% | 35% | 5m/15m candlesticks, entry confirmation, micro-structure |
| Decision Bar | 55% | 35% | Decision type, confidence, R:R, risk, size, execute/skip/explain buttons, risk gate status |
| Positions Panel | 25% | 35% | Open positions list with live P&L, quick links to portfolio |

**Responsive Behavior:**
- On screens < 1440px: HTF and LTF collapse to tabs above the execution chart
- On screens < 1024px: Switch to single-chart mobile view with bottom sheet for evidence
- On ultra-wide (> 2560px): Add a fourth panel for order book or news feed

### 4.3 Chart Drawing System

**Drawing Layer Architecture:**
- **Layer 0**: Lightweight Charts renders candlesticks, volume, grid, crosshair
- **Layer 1 (Canvas Overlay)**: Custom HTML5 Canvas element absolutely positioned over Layer 0. Draws all annotations.
- **Layer 2 (HTML Overlay)**: DOM elements for tooltips, labels, and interactive buttons on drawings
- **Synchronization**: Canvas overlay must precisely match Lightweight Charts coordinate system via the chart's `timeToCoordinate()` and `coordinateToPrice()` APIs

**Drawing Types & Visual Properties:**

| Drawing | Type | Color | Opacity | Line Style | Interactive |
|---------|------|-------|---------|------------|-------------|
| Trend Line | Line | #3b82f6 (blue) | 100% | Solid, 2px | Hover: highlight, show swing points |
| BOS Marker | Marker | #22c55e (green up) / #ef4444 (red down) | 100% | Arrow, 16px | Click: scroll to BOS candle, show context |
| MSS Marker | Marker | #eab308 (yellow) | 100% | Warning triangle, 16px | Click: show shift details |
| Order Block | Zone | #f97316 (orange) | 50% fill | Rectangle, 1px border | Hover: show OB details, mitigation status |
| Mitigated OB | Zone | #f97316 (orange) | 15% fill | Dashed border | Hover: show mitigation timestamp |
| Breaker Block | Zone | #a855f7 (purple) | 50% fill | Rectangle, 1px border | Hover: show original OB details |
| FVG | Zone | #06b6d4 (cyan) | 30% fill | Rectangle, no border | Hover: show fill status, displacement context |
| Liquidity Pool | Line | #ef4444 (red) | 100% | Dashed, 1px | Hover: show pool type (equal highs, session high, etc.) |
| Liquidity Sweep | Marker | #ef4444 (red) | 100% | X marker, 12px | Click: show sweep candle, displacement after |
| Entry Zone | Zone | #22c55e (green) | 25% fill | Rectangle, 2px solid border | Hover: show entry rationale, strategy name |
| Stop Loss | Line | #ef4444 (red) | 100% | Solid, 2px | Hover: show risk amount, distance in pips, ATR multiple |
| Target 1 (1:2) | Line | #22c55e (green) | 100% | Dashed, 1.5px | Hover: show R:R, probability if available |
| Target 2 (1:3) | Line | #22c55e (green) | 100% | Dashed, 1.5px | Hover: show R:R |
| Target 3 (1:4) | Line | #22c55e (green) | 100% | Dashed, 1.5px | Hover: show R:R |
| Session Marker | Line | #6b7280 (grey) | 40% | Vertical line, 1px | Hover: show session name, open/close time |
| Kill Zone | Background | #22c55e (green) | 5% | Full height vertical band | Label at top: "London Kill Zone" |
| Position Line | Line | Dynamic (green if profit, red if loss) | 100% | Solid, 2px, label with P&L | Hover: show position details, entry time, current R:R |
| Inducement | Line | #f59e0b (amber) | 60% | Dotted, 1px | Hover: show inducement target |

**Drawing Legend (Top-right of execution chart):**
A toggle panel where users can show/hide drawing categories:
- [✓] Structure (Trend lines, BOS, MSS)
- [✓] Liquidity (Pools, Sweeps)
- [✓] Order Flow (OBs, Breakers, FVGs)
- [✓] Entry/Exit (Entry zone, SL, Targets)
- [✓] Sessions (Markers, Kill zones)
- [✓] Positions (Open position lines)
- [✓] Inducements

### 4.4 The Decision Bar (Bottom Center)

**States:**

1. **BUY (Active)**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [🟢 BUY]  Confidence: 78%  |  R:R 1:2.5  |  Risk: 1.2%  |  Size: 2.4u  │
│                                                                             │
│  [🚀 Execute Paper Trade]    [⏭ Skip]    [❓ Explain]                      │
│                                                                             │
│  ✅ Risk Gate: APPROVED    |    Portfolio: 2/5 positions    |    Heat: 4.2%│
└─────────────────────────────────────────────────────────────────────────────┘
```

2. **WATCH (Forming)**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [🟡 WATCH]  Confidence: 68%  |  R:R 1:2.0  |  Setup forming...           │
│                                                                             │
│  [⏳ Wait for Confirmation]    [❓ Explain]                                 │
│                                                                             │
│  ⚠️  Waiting for: Lower timeframe confirmation (5m bullish candle close)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

3. **NO_TRADE (Conditions Not Met)**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [⚪ NO_TRADE]  Capital preserved. No valid setup detected.                 │
│                                                                             │
│  Reason: Higher timeframe (4H) is bearish. Counter-trend setup rejected.   │
│                                                                             │
│  💡 Tip: Wait for 4H structure shift or a bearish setup in direction of HTF │
└─────────────────────────────────────────────────────────────────────────────┘
```

4. **SESSION PAUSE**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [🔵 SESSION PAUSE]  Asian Session — Low volume, wide spreads.              │
│                                                                             │
│  ⏰ London Kill Zone starts in 4h 32m. Observation mode active.            │
│                                                                             │
│  [View Asian Session Setups (reduced confidence)]                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

5. **COOLING OFF (After Losses)**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [🔴 COOLING OFF]  System paused after 3 consecutive losses.                │
│                                                                             │
│  ⏳ Resume in: 2h 15m. Use this time to review your last trades.           │
│                                                                             │
│  [📓 Review Last 3 Trades]    [🧘 Take a Break]                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

6. **RISK VETO**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [🔴 VETOED]  Risk Gate rejected this trade.                                │
│                                                                             │
│  Reason: Portfolio heat would reach 7.2% (limit: 6%).                      │
│                                                                             │
│  Suggestion: Close an existing position or wait for one to hit target.      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.5 Evidence Panel (Right Side)

**Confluence Meter Design:**
Each meter is a horizontal bar, 8px height, rounded corners, filled based on confidence.

```
Structure     ████████░░ 80%  [Bullish BOS confirmed on 4H + 15m]
Liquidity     ██████████ 100% [Sweep completed below Asian low]
Pattern       ██████░░░░ 60%  [Bullish engulfing on 15m (confirmation only)]
Indicators    ████████░░ 80%  [RSI 52, MACD histogram turning positive]
Regime        ████████░░ 80%  [Trending — strategy fit: 85%]
ML            ██████░░░░ 60%  [LightGBM bullish, 62% confidence]

Overall       ████████░░ 78%
```

**Clicking a meter expands it:**
```
Structure [▼]
  ├─ Engine: market-structure v2.1.0
  ├─ Timestamp: 2026-09-03T14:32:00Z
  ├─ 4H Bias: Bullish (Higher highs, higher lows)
  ├─ 15m BOS: 3 candles ago at 1.0845
  ├─ 15m CHoCH: Bullish shift after liquidity sweep
  └─ Confidence: 80% (strong structure, clear BOS)
```

**Contradictions Section:**
```
⚠️ Contradictions Detected (1)
  ├─ ATR is 2.3x normal (elevated volatility)
  └─ Impact: Position size reduced by 20%
```

### 4.6 Dashboard Page

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Quantum DASHBOARD                                    [Account] [⚙] [🔔] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐         │
│  │  Portfolio  │ │   Today's   │ │   Win Rate  │ │  Patience   │         │
│  │    Heat     │ │    P&L      │ │   (7d)      │ │    Score    │         │
│  │   [████░░]  │ │   +$124     │ │    62%      │ │    85/100   │         │
│  │   4.2/6%    │ │   +1.2%     │ │   8W 5L     │ │   Great     │         │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘         │
│                                                                             │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │      MARKET OVERVIEW        │  │        ACTIVE DECISIONS             │  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐  │  │  [BUY] EUR/USD 78% — 14:32        │  │
│  │  │EUR  │ │GBP  │ │BTC  │  │  │  [WATCH] GBP/USD 68% — 14:28      │  │
│  │  │+0.2%│ │-0.1%│ │+1.5%│  │  │  [NO_TRADE] USD/JPY — HTF mismatch │  │
│  │  └─────┘ └─────┘ └─────┘  │  │                                     │  │
│  │  [View All Markets →]       │  │  [Go to Terminal →]               │  │
│  └─────────────────────────────┘  └─────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │      OPEN POSITIONS         │  │           ALERT FEED                │  │
│  │  EUR/USD  Long  +$45  [▶]  │  │  🔴 Risk: Daily loss limit 80%     │  │
│  │  GBP/USD  Long  -$12  [▶]  │  │  🟡 Pattern: Head & shoulders on   │  │
│  │                             │  │      GBP/USD 4H                    │  │
│  │  [View Portfolio →]         │  │  🟢 Decision: EUR/USD BUY executed │  │
│  └─────────────────────────────┘  └─────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  SESSION CLOCK:  🌍 London: OPEN  |  🌎 New York: 1h 23m          │   │
│  │  Next Kill Zone: NY Open at 14:30 GMT                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.7 Admin Dashboard (Role: Admin / Super Admin)

**Admin Layout:**
- Sidebar: Users | Strategies | Models | System Health | Audit Logs | Analytics
- Top bar: "Admin Panel" badge, current admin name, back to terminal button

**Users Management:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER MANAGEMENT                                    [+ Invite User]        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Search: [________________]  Filter: [All ▼]  Role: [All ▼]               │
│                                                                             │
│  Name          Email              Role      Status    Trades    Joined     │
│  ─────────────────────────────────────────────────────────────────────────  │
│  John Doe      john@email.com     User      Active    142       Sep 2026   │
│  Jane Smith    jane@email.com     Admin     Active    89        Aug 2026   │
│  Mike Ross     mike@email.com     User      Paused    34        Sep 2026   │
│  [Edit] [View Activity] [Reset Password] [Change Role] [Suspend]          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Super Admin Only Features:**
- Database query console (read-only for safety)
- Secret rotation panel
- Deployment controls (restart services, rollback)
- System-wide circuit breaker (emergency stop all trading)
- Migration management (run pending migrations)
- Role assignment (can assign super_admin)
- Cannot be deleted by anyone (including other super_admins — requires manual DB intervention)

---

## 5. Role-Based Access Control (RBAC)

### 5.1 Role Hierarchy

```
Super Admin
    └── Admin
            └── User (Trader)
```

### 5.2 Permission Matrix

| Resource | Action | User | Admin | Super Admin |
|----------|--------|------|-------|-------------|
| **Own Profile** | Read/Write | ✅ | ✅ | ✅ |
| **Own Risk Profile** | Read/Write | ✅ | ✅ | ✅ |
| **Own Decisions** | Read | ✅ | ✅ | ✅ |
| **Own Positions** | Read/Write | ✅ | ✅ | ✅ |
| **Own Trades** | Read | ✅ | ✅ | ✅ |
| **Own Backtests** | Read/Write | ✅ | ✅ | ✅ |
| **Own Journal** | Read/Write | ✅ | ✅ | ✅ |
| **Own Settings** | Read/Write | ✅ | ✅ | ✅ |
| **Other Users' Data** | Read | ❌ | ✅ (read-only) | ✅ |
| **Other Users' Trades** | Read | ❌ | ✅ (read-only) | ✅ |
| **User Management** | List/View | ❌ | ✅ | ✅ |
| **User Roles** | Assign user/admin | ❌ | ✅ | ✅ |
| **User Roles** | Assign super_admin | ❌ | ❌ | ✅ |
| **Strategies** | Create (personal) | ✅ | ✅ | ✅ |
| **Strategies** | Approve/validate | ❌ | ✅ | ✅ |
| **Strategies** | System-wide edit | ❌ | ❌ | ✅ |
| **Models** | View status | ✅ | ✅ | ✅ |
| **Models** | Deploy/rollback | ❌ | ✅ | ✅ |
| **Models** | Train new (personal) | ✅ | ✅ | ✅ |
| **Models** | System-wide train | ❌ | ❌ | ✅ |
| **System Analytics** | View | ❌ | ✅ | ✅ |
| **Audit Logs** | View own | ✅ | ✅ | ✅ |
| **Audit Logs** | View all | ❌ | ✅ | ✅ |
| **System Health** | View | ❌ | ✅ | ✅ |
| **Circuit Breaker** | Trigger own | ✅ | ✅ | ✅ |
| **Circuit Breaker** | Trigger system-wide | ❌ | ❌ | ✅ |
| **Secrets** | Rotate | ❌ | ❌ | ✅ |
| **Database** | Query | ❌ | ❌ | ✅ (read-only UI) |
| **Migrations** | Run | ❌ | ❌ | ✅ |
| **Deployment** | Manage | ❌ | ❌ | ✅ |

### 5.3 Database Schema for RBAC

```sql
-- Supabase Auth handles auth.users
-- We extend with profiles and roles

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'UTC',
  base_currency TEXT DEFAULT 'USD',
  risk_profile_id UUID,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Role assignments (many-to-many: user can have multiple roles)
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin', 'super_admin')),
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Role change audit
CREATE TABLE role_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  old_role TEXT,
  new_role TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin settings (system-wide config)
CREATE TABLE system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own profile
CREATE POLICY "Users can access own profile"
  ON profiles FOR ALL USING (auth.uid() = id);

-- Admins can view all profiles (read-only via API layer, not direct DB)
-- Super admins bypass RLS via service_role

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Users can see their own roles
CREATE POLICY "Users can view own roles"
  ON user_roles FOR SELECT USING (auth.uid() = user_id);

-- Super admin role cannot be deleted via API (enforced in application layer)
```

### 5.4 API Authorization Guards

```typescript
// apps/api/src/plugins/rbac.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      roles: string[];
    };
  }
}

export async function rbacPlugin(fastify: FastifyInstance) {
  fastify.decorate('requireRole', (roles: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const hasRole = roles.some(role => request.user.roles.includes(role));
      if (!hasRole) {
        return reply.status(403).send({ error: 'Forbidden: insufficient privileges' });
      }
    };
  });
}

// Usage in routes:
// fastify.get('/admin/users', { preHandler: [fastify.requireRole(['admin', 'super_admin'])] }, handler);
// fastify.post('/admin/secrets/rotate', { preHandler: [fastify.requireRole(['super_admin'])] }, handler);
```

### 5.5 Frontend Route Guards

```typescript
// apps/web/src/hooks/useRole.ts

import { useAuth } from './useAuth';

export function useRole() {
  const { user } = useAuth();

  const roles = user?.roles || [];
  const isUser = roles.includes('user');
  const isAdmin = roles.includes('admin');
  const isSuperAdmin = roles.includes('super_admin');

  const canAccessAdmin = isAdmin || isSuperAdmin;
  const canAccessSuperAdmin = isSuperAdmin;

  return { roles, isUser, isAdmin, isSuperAdmin, canAccessAdmin, canAccessSuperAdmin };
}

// Route protection:
// <Route path="/admin/*" element={canAccessAdmin ? <AdminLayout /> : <Navigate to="/" />} />
// <Route path="/admin/system" element={canAccessSuperAdmin ? <SystemPanel /> : <Navigate to="/admin" />} />
```

---

## 6. Implementation Roadmap

### Phase 0: Audit & Baseline (Week 1)
**Goal**: Know exactly what we have before touching anything.
- [ ] Inventory every file in existing codebase
- [ ] Classify each module: KEEP / REFACTOR / REPLACE / REMOVE
- [ ] Map all frontend→Supabase direct calls (architectural violations)
- [ ] Find all hardcoded secrets, API keys, Binance references
- [ ] Document current decision pipeline end-to-end
- [ ] Identify duplicate implementations (indicators, engines, paper trading)
- [ ] List all pages, routes, components
- [ ] Export current database schema
- [ ] **Deliverable**: Audit Report with classification matrix

### Phase 1: Foundation & Extraction (Weeks 2-3)
**Goal**: Clean monorepo, working backend API, auth with roles.
- [ ] Set up Turborepo + pnpm monorepo
- [ ] Create `apps/web`, `apps/api`, `apps/ws`, `apps/ingest`, `packages/shared`
- [ ] Move existing React code into `apps/web` (preserve functionality)
- [ ] Set up Fastify API with health check endpoint
- [ ] Configure Supabase Auth + profiles table + user_roles table
- [ ] Implement JWT auth plugin for Fastify
- [ ] Implement RBAC plugin (requireRole decorator)
- [ ] Move all Supabase client calls from frontend to API routes
- [ ] Create `.env.example` with all required variables
- [ ] Set up Docker Compose for local dev (Postgres, Redis)
- [ ] **Deliverable**: `npm run dev` starts web + api. Auth works. No frontend direct DB calls.

### Phase 2: Market Data Architecture (Weeks 4-5)
**Goal**: EODHD integration, candle storage, real-time pipeline.
- [ ] Build EODHD REST client (historical data)
- [ ] Build EODHD WebSocket client (real-time streams)
- [ ] Implement candle normalizer (UTC, OHLCV standardization)
- [ ] Implement data quality engine (stale, missing, invalid OHLC)
- [ ] Set up TimescaleDB extension for candle hypertable
- [ ] Build ingestion worker (poll + stream to DB)
- [ ] Build Redis pub/sub for real-time candle distribution
- [ ] Connect WS server to Redis pub/sub
- [ ] Frontend subscribes to WS for live candles
- [ ] **Deliverable**: Terminal shows live EUR/USD 15m candles from EODHD.

### Phase 3: The Chart & Drawings (Weeks 6-7)
**Goal**: Multi-timeframe terminal with drawing overlay.
- [ ] Implement three-timeframe layout (HTF, Execution, LTF)
- [ ] Integrate Lightweight Charts with custom Canvas overlay
- [ ] Build drawing system: trend lines, zones, markers
- [ ] Implement color-coded drawing styles
- [ ] Build drawing legend with toggle visibility
- [ ] Implement hover-to-explain on drawings
- [ ] Implement chart synchronization (crosshair sync across timeframes)
- [ ] Build session markers and kill zone highlights
- [ ] **Deliverable**: Terminal renders clean multi-timeframe charts with drawing overlay.

### Phase 4: Market Intelligence Engines (Weeks 8-10)
**Goal**: Structure, liquidity, patterns, indicators, regime.
- [ ] Implement engine plugin architecture (registry + interface)
- [ ] Structure Engine: swing highs/lows, BOS, MSS, CHoCH
- [ ] Liquidity Engine: equal highs/lows, session levels, sweep detection
- [ ] Order Block detection + FVG detection
- [ ] Indicator Engine: RSI, MACD, ATR, Volume
- [ ] Regime Engine: trending, ranging, volatile, transition
- [ ] Session awareness (kill zones, Asian downgrade)
- [ ] Every engine emits Evidence + DrawingCommand
- [ ] **Deliverable**: Terminal auto-draws structure, liquidity, OBs, FVGs on chart.

### Phase 5: Strategy & Decision (Weeks 11-12)
**Goal**: Strategy selection, Master Decision Engine, explainability.
- [ ] Implement strategy registry with versioning
- [ ] Implement strategy selection (regime + structure + time compatibility)
- [ ] Build Master Decision Engine with 12-point confluence checklist
- [ ] Implement contradiction detection
- [ ] Implement confidence calculation (not naive average)
- [ ] Build explainability engine (trade thesis generation)
- [ ] Decision emits DrawingCommand for entry zone, SL, targets
- [ ] **Deliverable**: System generates BUY/SELL/WATCH/NO_TRADE with full explanation.

### Phase 6: Risk & Portfolio (Weeks 13-14)
**Goal**: Risk gate with veto power, portfolio context.
- [ ] Implement risk engine (position sizing, SL calculation, heat tracking)
- [ ] Implement portfolio engine (exposure, correlation, drawdown)
- [ ] Build circuit breakers (daily loss, consecutive losses, drawdown limit)
- [ ] Risk dashboard with gauges
- [ ] Risk journal (all risk events logged)
- [ ] **Deliverable**: Risk gate rejects trades that violate limits. Dashboard shows risk state.

### Phase 7: Paper Trading (Weeks 15-16)
**Goal**: Simulated execution, position lifecycle, P&L tracking.
- [ ] Implement paper account management
- [ ] Implement order simulation (market orders with slippage/fees)
- [ ] Implement position lifecycle (open → partial close → full close)
- [ ] Real-time unrealized P&L on chart (position line)
- [ ] Trade review generation (automatic after close)
- [ ] **Deliverable**: User can execute paper trade from terminal. Position tracked on chart.

### Phase 8: Backtesting (Weeks 17-18)
**Goal**: Bar-by-bar backtest with look-ahead bias detection.
- [ ] Implement bar-by-bar backtest engine (same code as live)
- [ ] Implement look-ahead bias detection (injected bias test)
- [ ] Metrics calculation (Sharpe, drawdown, win rate, expectancy)
- [ ] Equity curve visualization
- [ ] Strategy comparison view
- [ ] **Deliverable**: User can backtest a strategy over 2 years and see equity curve.

### Phase 9: Knowledge & Learning (Weeks 19-20)
**Goal**: Institutional memory, trade reviews, controlled learning.
- [ ] Implement knowledge graph (nodes + relationships)
- [ ] Implement trade review storage and retrieval
- [ ] Implement historical similarity search
- [ ] Implement learning event tracking
- [ ] Daily auto-generated journal entries
- [ ] **Deliverable**: Journal page shows trade reviews and knowledge graph.

### Phase 10: ML Integration (Weeks 21-22)
**Goal**: LightGBM/ONNX models, feature pipeline, drift detection.
- [ ] Implement feature engineering pipeline (point-in-time correct)
- [ ] Set up ONNX Runtime for LightGBM inference
- [ ] Build model registry (simple, in PostgreSQL)
- [ ] Implement inference endpoint
- [ ] Implement drift detection (rolling accuracy window)
- [ ] Integrate ML evidence into decision engine
- [ ] **Deliverable**: AI Center shows model status, feature importance, drift alerts.

### Phase 11: Roles & Admin (Weeks 23-24)
**Goal**: Role-based access, admin panels, super admin controls.
- [ ] Implement user management table (admin)
- [ ] Implement strategy approval workflow (admin)
- [ ] Implement model deployment panel (admin)
- [ ] Implement audit log viewer (admin)
- [ ] Implement system analytics dashboard (admin)
- [ ] Implement super admin panel (secrets, deployment, circuit breaker)
- [ ] **Deliverable**: Admin can manage users. Super admin can rotate secrets and emergency stop.

### Phase 12: Polish & Validation (Week 25+)
**Goal**: Production-ready, validated, documented.
- [ ] End-to-end testing (market data → decision → paper trade → review)
- [ ] Security audit (no secrets, RLS enforced, input validated)
- [ ] Performance optimization (caching, query optimization)
- [ ] Mobile responsiveness (basic)
- [ ] Onboarding flow for new users
- [ ] Documentation (API docs, deployment guide, engine developer guide)
- [ ] 2-year backtest validation
- [ ] 1-month paper trading validation
- [ ] **Deliverable**: Platform runs continuously in paper-trading mode. Measurable results.

---

## 7. Security Model

### 7.1 Authentication
- Supabase Auth with email/password
- JWT access tokens (15-minute expiry)
- Refresh tokens (7-day expiry, stored in httpOnly cookie)
- Password requirements: min 12 chars, 1 uppercase, 1 number, 1 symbol
- Account lockout after 5 failed attempts (15-minute cooldown)

### 7.2 Authorization
- RBAC with three roles: user, admin, super_admin
- RLS on all PostgreSQL tables
- API layer validates role on every protected endpoint
- Frontend route guards prevent UI access to unauthorized routes
- Admin actions are audited (who did what, when, why)

### 7.3 Secrets Management
- All API keys in environment variables
- Frontend never sees provider API keys (EODHD, Binance, etc.)
- `.env.example` only — real `.env` in `.gitignore`
- Secret rotation via super admin panel (updates env, restarts services)
- Database credentials only in API/ingest/ML services

### 7.4 Input Validation
- Zod schemas on all API inputs
- SQL injection prevention via Prisma (parameterized queries)
- XSS prevention via React escaping + Content Security Policy
- Rate limiting: 100 requests/minute per user, 10 requests/minute per IP for auth endpoints

### 7.5 Audit Logging
Every sensitive action is logged:
- Login/logout
- Role changes
- Strategy approvals
- Model deployments
- Circuit breaker triggers
- Secret rotations
- Paper trade executions
- Risk gate vetoes

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  actor_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  before_state JSONB,
  after_state JSONB,
  ip_address INET,
  user_agent TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 8. Deployment Architecture

### 8.1 Local Development
```bash
# One command starts everything
docker-compose up

# Services:
# - web: localhost:3000
# - api: localhost:3001
# - ws: localhost:3002
# - ingest: localhost:3003
# - postgres: localhost:5432
# - redis: localhost:6379
```

### 8.2 Production (MVP)
- **Frontend (web)**: Vercel — automatic deploys from main branch
- **API (api)**: Railway — Docker deploy, auto-restart, health checks
- **WebSocket (ws)**: Railway — dedicated service for WS connections
- **Ingestion (ingest)**: Railway — background worker, auto-restart
- **ML (ml)**: Railway — CPU-only, training runs overnight
- **Database**: Supabase PostgreSQL — managed, backups, RLS
- **Cache**: Upstash Redis — managed, persistence
- **Monitoring**: Logtail (structured logs) + UptimeRobot (health checks)

### 8.3 Production (Scale)
- **Frontend**: Vercel Pro with edge caching
- **API**: Kubernetes (EKS/GKE) with horizontal pod autoscaling
- **WS**: Kubernetes with sticky sessions (session affinity)
- **Ingest**: Kubernetes CronJobs + dedicated streaming pods
- **ML**: Kubernetes with GPU nodes for training
- **Database**: Managed PostgreSQL (RDS/Cloud SQL) with read replicas
- **Cache**: Redis Cluster (ElastiCache)
- **Monitoring**: Datadog or Grafana Cloud (metrics, logs, traces, APM)
- **CDN**: Cloudflare for static assets

---

## 9. Key Architectural Decisions

### 9.1 Why Fastify over Express?
- 2x faster request handling
- Built-in JSON schema validation (Zod integration)
- Native async/await support
- Excellent plugin architecture for auth, RBAC, rate limiting
- Better WebSocket support

### 9.2 Why Custom Canvas Overlay instead of TradingView Charting Library?
- TradingView Library is heavy (MBs of JS), proprietary, and licensing is complex
- Lightweight Charts + Canvas overlay gives us full control over drawing logic
- We can render ICT/SMC-specific drawings (OBs, FVGs, liquidity sweeps) that TradingView doesn't natively support
- Performance is better — we only render what we need
- No external dependency on TradingView's rendering engine

### 9.3 Why TimescaleDB over standard PostgreSQL for candles?
- 90% compression on OHLCV data
- Automatic time-based partitioning (hypertables)
- Continuous aggregates for pre-computed indicators
- Querying 5 years of 1m candles is fast without manual sharding
- It's a PostgreSQL extension — no separate database to manage

### 9.4 Why ONNX Runtime instead of Python for ML?
- Master Prompt explicitly discourages Python unless justified
- LightGBM models can be exported to ONNX and run in Node.js
- Latency is comparable (< 10ms difference)
- No separate Python service to deploy, monitor, and secure
- Same TypeScript types shared between feature engineering and inference

### 9.5 Why Redis Pub/Sub instead of Kafka for real-time?
- Kafka is overkill for MVP-scale real-time (we're pushing to maybe 100 concurrent users)
- Redis Pub/Sub is simpler, lower latency, and already required for caching
- Can migrate to Kafka later if we need persistence, replay, or consumer groups
- Current event volume: ~1 event per second per symbol. Redis handles 100k+ messages/sec.

### 9.6 Why three roles instead of two?
- **User**: Trades, views own data. Cannot break others.
- **Admin**: Manages community strategies, views analytics. Cannot break infrastructure.
- **Super Admin**: Infrastructure control. Can emergency stop. Separation of concerns prevents accidents.

---

## 10. Definition of Done (Platform)

Quantum v1.0 is complete when:

1. [ ] User can register, login, and manage profile
2. [ ] Terminal shows live multi-timeframe charts with EODHD data
3. [ ] System auto-draws structure, liquidity, OBs, FVGs
4. [ ] System generates BUY/SELL/WATCH/NO_TRADE with explanation
5. [ ] Risk gate vetoes trades that violate limits
6. [ ] User can execute paper trades with one click
7. [ ] Open positions are tracked on chart with live P&L
8. [ ] Backtesting works with 2+ years of data and equity curve
9. [ ] Look-ahead bias detection passes injected bias test
10. [ ] Knowledge graph stores validated lessons
11. [ ] Trade reviews are auto-generated
12. [ ] ML model shows predictions with confidence and drift alerts
13. [ ] Admin can manage users and strategies
14. [ ] Super admin can rotate secrets and emergency stop
15. [ ] No hardcoded secrets anywhere
16. [ ] RLS on all tables
17. [ ] All API endpoints validated with Zod
18. [ ] Audit logs capture all sensitive actions
19. [ ] Platform runs continuously in paper-trading mode for 30 days
20. [ ] Documentation is complete (API, deployment, engine dev guide)

---

*This specification is the build order. Phase 0 first. No skipping. No shortcuts. Every phase must be validated before the next begins.*
