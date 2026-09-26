# Quantum — Chief Engineer Build Specification
## Opinionated Architecture for an Evidence-Based Trading Intelligence Platform

---

## 1. Executive Vision

Quantum is an **event-driven, multi-engine quantitative trading intelligence platform**. It is not a dashboard with indicators. It is a **decision system** that ingests market data, runs parallel analytical engines, synthesizes weighted evidence, applies risk gates, and produces auditable trade decisions for paper trading.

### Core Architectural Principles

1. **Event-Driven, Not Request-Driven** — The system reacts to market events (new candles), not user clicks. This makes backtesting, real-time analysis, and paper trading the same pipeline.
2. **Engine Plugin Architecture** — Every analytical domain is a self-contained plugin. Add a new engine without touching the decision core.
3. **Server-Side Intelligence, Client-Side Presentation** — All computation, ML, and backtesting happen on the server. The frontend is a thin, reactive shell.
4. **Point-in-Time Correctness** — Every feature, pattern, and decision is computable only with data available at that exact moment. Look-ahead bias is architecturally impossible.
5. **Explainability by Contract** — No engine can emit a signal without a human-readable explanation. This is enforced at the type level.

---

## 2. Technology Stack (With Justification)

### Frontend
- **Next.js 14 (App Router)** — Server Components for data-heavy dashboards, streaming SSR for decision panels, API Routes for proxying secrets. React 18 + Vite is fine for SPAs; Next.js is the right choice for a data platform.
- **TypeScript 5.5** — Strict mode, no exceptions.
- **Tailwind CSS + shadcn/ui** — Rapid UI development with accessible, composable primitives.
- **Zustand** — Minimal global state. Only UI state (sidebar, theme, alerts). No server state here.
- **TanStack Query v5** — Server state, caching, background refetching. The frontend does not own data; it subscribes to it.
- **Lightweight Charts** — Financial charting. Fast, canvas-based, no dependencies.
- **tRPC** — End-to-end typesafe API calls from Next.js to the API service. No REST contract drift.

### Backend Services
- **Node.js 20 + Fastify** — The trading API and orchestration layer. Fastify is faster than Express, has built-in schema validation, and excellent WebSocket support.
- **Python 3.11 + FastAPI** — ML service only. Feature engineering, model training, inference. Kept separate because Python is non-negotiable for ML, but TypeScript is better for trading logic.
- **Deno Edge Functions (Supabase)** — Only for auth hooks, simple CRUD, and lightweight data transformations. Not for ML, not for backtesting, not for real-time streaming.

### Data & Messaging
- **PostgreSQL 15 (Supabase)** — User data, decisions, positions, backtest metadata. Row Level Security enforced.
- **TimescaleDB** — Time-series extension for PostgreSQL. Stores OHLCV candles, feature vectors, and historical evidence. Native compression, continuous aggregates, time-based partitioning.
- **Redis 7** — Hot cache for latest candles, active decisions, session state, rate limiting, and pub/sub for real-time events.
- **Apache Kafka (or Redpanda)** — Event bus. Decouples market data ingestion from analysis engines from decision engine from paper trading. Every service publishes and consumes events. This is the backbone.

### Machine Learning
- **LightGBM** — Primary model. Gradient boosting on tabular features. Fast to train, interpretable, and hard to beat on structured data.
- **PyTorch** — Only for sequence models (LSTM) if LightGBM proves profitable first.
- **MLflow** — Model registry, experiment tracking, artifact storage.
- **Feast** — Feature store. Point-in-time correct feature retrieval. This is non-negotiable for trading ML.

### Infrastructure
- **Docker + Docker Compose** — Local development.
- **Kubernetes (or Railway/Render for MVP)** — Production orchestration.
- **GitHub Actions** — CI/CD.
- **Turborepo + pnpm** — Monorepo management.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Quantum PLATFORM                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐     ┌──────────────┐     ┌─────────────────────────┐   │
│   │   Next.js    │     │   Node.js    │     │      Python/FastAPI     │   │
│   │    (Web)     │◄───►│   (API)      │◄───►│       (ML Service)      │   │
│   │  App Router  │tRPC  │   Fastify    │HTTP  │    LightGBM/PyTorch     │   │
│   │   Zustand    │     │  Orchestrator│     │    Feast / MLflow       │   │
│   └──────────────┘     └──────┬───────┘     └─────────────────────────┘   │
│                               │                                             │
│   ┌──────────────┐           │           ┌─────────────────────────┐       │
│   │  WebSocket   │◄──────────┘           │    Kafka Event Bus      │       │
│   │   Server     │                       │  (Market/Decision/Trade │       │
│   │  (Node.js)   │                       │        Events)          │       │
│   └──────────────┘                       └─────────────────────────┘       │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        DATA LAYER                                    │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  │   │
│   │  │  Supabase   │  │  TimescaleDB│  │    Redis    │  │  MLflow  │  │   │
│   │  │  PostgreSQL │  │   (Candles) │  │   (Cache)   │  │ (Models) │  │   │
│   │  │  (Users)    │  │  (Features) │  │  (Pub/Sub)  │  │          │  │   │
│   │  └─────────────┘  └─────────────┘  └─────────────┘  └──────────┘  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     EXTERNAL INTEGRATIONS                            │   │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │   │
│   │  │   EODHD  │  │  Binance │  │  News API│  │  (Future: Broker)│   │   │
│   │  │ (Primary)│  │ (Crypto) │  │          │  │                  │   │   │
│   │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Service Boundaries

| Service | Responsibility | Runtime | Why |
|---------|---------------|---------|-----|
| `web` | Next.js frontend, Server Components, API Routes | Node.js 20 | SSR, streaming, secret proxying |
| `api` | Trading orchestration, engine management, paper trading, backtesting | Node.js 20 + Fastify | TypeScript is superior for financial logic |
| `ml` | Feature engineering, model training, inference, drift detection | Python 3.11 + FastAPI | Python ecosystem for ML is unmatched |
| `ws` | WebSocket server for real-time market data push | Node.js 20 + ws | Low-latency, stateful connections |
| `ingest` | Market data ingestion from EODHD/Binance | Node.js 20 | Normalizes and stores candles |

---

## 4. Monorepo Structure

```
Quantum/
├── apps/
│   ├── web/                    # Next.js 14 frontend
│   │   ├── src/
│   │   │   ├── app/            # App Router (dashboard, terminal, backtest, etc.)
│   │   │   ├── components/     # shadcn/ui + custom components
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── lib/
│   │   │   │   ├── trpc.ts     # tRPC client setup
│   │   │   │   └── utils.ts    # Utilities
│   │   │   └── stores/         # Zustand stores
│   │   ├── package.json
│   │   └── next.config.js
│   │
│   ├── api/                    # Node.js trading API (Fastify)
│   │   ├── src/
│   │   │   ├── engines/        # Analysis engine plugins
│   │   │   ├── decisions/      # Master Decision Engine
│   │   │   ├── paper/          # Paper trading engine
│   │   │   ├── backtest/       # Backtesting engine
│   │   │   ├── risk/           # Risk engine
│   │   │   ├── portfolio/      # Portfolio engine
│   │   │   ├── market/         # Market data service
│   │   │   ├── events/         # Kafka producer/consumer
│   │   │   ├── plugins/        # Fastify plugins (auth, logging, etc.)
│   │   │   └── server.ts       # Fastify server bootstrap
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   ├── ml/                     # Python ML service (FastAPI)
│   │   ├── src/
│   │   │   ├── features/       # Feature engineering
│   │   │   ├── models/         # Model definitions
│   │   │   ├── training/       # Training pipelines
│   │   │   ├── inference/      # Inference endpoints
│   │   │   ├── registry/       # MLflow integration
│   │   │   └── main.py         # FastAPI app
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   ├── ws/                     # WebSocket server
│   │   ├── src/
│   │   │   ├── server.ts       # ws server
│   │   │   ├── broadcaster.ts  # Broadcast to connected clients
│   │   │   └── subscribers.ts  # Subscribe to Kafka topics
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   └── ingest/                 # Market data ingestion worker
│       ├── src/
│       │   ├── providers/      # EODHD, Binance adapters
│       │   ├── normalizer.ts   # Candle normalization
│       │   ├── store.ts        # TimescaleDB writer
│       │   └── worker.ts       # Ingestion loop
│       ├── package.json
│       └── Dockerfile
│
├── packages/
│   ├── shared/                 # Shared types, schemas, utilities
│   │   ├── src/
│   │   │   ├── types/          # TypeScript types (Candle, Evidence, Decision, etc.)
│   │   │   ├── schemas/        # Zod schemas for validation
│   │   │   └── constants/      # Shared constants
│   │   └── package.json
│   │
│   ├── ts-config/              # Shared TypeScript configs
│   └── eslint-config/          # Shared ESLint configs
│
├── supabase/
│   ├── migrations/             # Database migrations
│   └── functions/              # Edge Functions (auth hooks only)
│
├── docker-compose.yml          # Local development stack
├── turbo.json                  # Turborepo pipeline config
└── pnpm-workspace.yaml
```

---

## 5. Event-Driven Architecture (The Core)

Quantum is built around an event bus. This is the single most important architectural decision.

### Why Events?
- **Backtesting = Real-time**: The same pipeline that runs live also runs historically. Just replay events from Kafka.
- **Decoupling**: The ingest service doesn't know about the decision engine. The decision engine doesn't know about paper trading.
- **Observability**: Every step is logged as an event. Audit trails are free.
- **Scaling**: Add more consumers without changing producers.

### Event Types

```typescript
// packages/shared/src/types/events.ts

interface MarketEvent {
  type: 'candle.closed';
  payload: {
    symbol: string;
    timeframe: Timeframe;
    candle: Candle;
    timestamp: number;
  };
  metadata: {
    source: 'eodhd' | 'binance';
    ingestionLatencyMs: number;
  };
}

interface AnalysisEvent {
  type: 'evidence.generated';
  payload: {
    symbol: string;
    timeframe: Timeframe;
    evidence: Evidence[];
    engine: string;
    engineVersion: string;
  };
}

interface DecisionEvent {
  type: 'decision.generated';
  payload: {
    decision: TradeDecision;
    pipelineLatencyMs: number;
  };
}

interface TradeEvent {
  type: 'paper.order.created' | 'paper.position.opened' | 'paper.position.closed';
  payload: {
    order?: PaperOrder;
    position?: PaperPosition;
    pnl?: number;
  };
}

interface BacktestEvent {
  type: 'backtest.started' | 'backtest.progress' | 'backtest.completed';
  payload: {
    backtestId: string;
    progress?: number;
    result?: BacktestResult;
  };
}
```

### Event Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Ingest    │────►│   Kafka     │────►│  Analysis API   │
│  (EODHD)    │     │  (candle.   │     │  (runs engines) │
└─────────────┘     │   closed)   │     └────────┬────────┘
                    └─────────────┘              │
                                                 │
                    ┌─────────────┐              │
                    │   Kafka     │◄─────────────┘
                    │ (evidence.  │
                    │  generated) │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Decision API  │
                    │ (Master       │
                    │  Decision)    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐     ┌─────────────┐
                    │   Kafka     │────►│  Paper API  │
                    │ (decision.  │     │  (execution)│
                    │  generated) │     └─────────────┘
                    └─────────────┘
```

### Consumer Groups
- `analysis-consumers` — One group per engine. Parallel processing.
- `decision-consumer` — Single consumer (decisions must be sequential per symbol).
- `paper-trading-consumer` — Executes orders, manages positions.
- `web-socket-consumer` — Pushes events to connected frontend clients.
- `persistence-consumer` — Writes events to TimescaleDB/PostgreSQL.

---

## 6. The Engine Plugin Architecture

Every analytical engine is a plugin. This is how you scale from 3 engines to 20 without chaos.

### Engine Interface

```typescript
// packages/shared/src/types/engine.ts

interface IAnalysisEngine {
  readonly name: string;
  readonly version: string;
  readonly supportedTimeframes: Timeframe[];
  readonly requiredCandles: number;        // Lookback required
  readonly outputType: 'evidence' | 'regime' | 'signal';

  // Core method: given candles up to index i, return evidence
  analyze(params: {
    symbol: string;
    timeframe: Timeframe;
    candles: Candle[];                    // [0..i], never [0..end]
    context: MarketContext;               // Current regime, structure, etc.
  }): Promise<Evidence[]>;

  // Explain a specific piece of evidence
  explain(evidence: Evidence): string;

  // Validate configuration
  validateConfig(config: unknown): boolean;
}
```

### Engine Registry

```typescript
// apps/api/src/engines/registry.ts

class EngineRegistry {
  private engines = new Map<string, IAnalysisEngine>();

  register(engine: IAnalysisEngine): void {
    this.engines.set(engine.name, engine);
  }

  async runAll(params: AnalyzeParams): Promise<Evidence[]> {
    const results = await Promise.all(
      Array.from(this.engines.values()).map(engine => 
        engine.analyze(params).catch(err => {
          logger.error(`Engine ${engine.name} failed`, err);
          return [];
        })
      )
    );
    return results.flat();
  }
}
```

### Built-in Engines (MVP)

| Engine | Type | Weight (default) | Description |
|--------|------|------------------|-------------|
| `indicator` | Evidence | 0.20 | RSI, MACD, EMA crossovers, Bollinger |
| `structure` | Evidence | 0.25 | Swing highs/lows, BOS/CHoCH, trend |
| `regime` | Context | — | Classifies market as trending/ranging/volatile |
| `ml-lightgbm` | Evidence | 0.30 | Gradient boosting prediction |
| `risk` | Gate | — | Veto power. Can reject any decision. |
| `portfolio` | Constraint | — | Adjusts size based on current exposure. |

**Deferred engines** (post-MVP): liquidity, patterns, historical similarity, institutional, news sentiment.

---

## 7. Master Decision Engine

The decision engine is a state machine, not a function. It consumes evidence events and emits decision events.

### State Machine

```
IDLE ──► COLLECTING_EVIDENCE ──► EVALUATING ──► RISK_CHECK ──► PORTFOLIO_CHECK ──► DECIDED
                                      │                │                │
                                      ▼                ▼                ▼
                                  REJECTED         REJECTED         REJECTED
```

### Pipeline (Per Symbol/Timeframe)

```typescript
// apps/api/src/decisions/pipeline.ts

async function runDecisionPipeline(
  symbol: string,
  timeframe: Timeframe,
  candle: Candle
): Promise<TradeDecision | null> {

  // 1. Data Quality Gate
  const quality = await dataQualityCheck(symbol, timeframe, candle);
  if (!quality.passed) return null;

  // 2. Market Context
  const context = await buildMarketContext(symbol, timeframe, candle);

  // 3. Collect Evidence (parallel)
  const evidence = await engineRegistry.runAll({
    symbol, timeframe, 
    candles: await getCandlesUpTo(symbol, timeframe, candle.timestamp),
    context
  });

  // 4. Regime-Aware Weighting
  const weightedEvidence = applyRegimeWeights(evidence, context.regime);

  // 5. Contradiction Detection
  const contradictions = detectContradictions(weightedEvidence);

  // 6. Confidence Calculation
  const confidence = calculateConfidence(weightedEvidence, contradictions, quality);

  // 7. Strategy Match
  const strategyMatch = evaluateStrategies(weightedEvidence, context);

  // 8. ML Prediction (if available)
  const mlPrediction = await getMLPrediction(symbol, timeframe, context);

  // 9. Synthesize
  const rawDecision = synthesize({
    evidence: weightedEvidence,
    contradictions,
    confidence,
    strategyMatch,
    mlPrediction,
    context
  });

  // 10. Risk Gate (VETO POWER)
  const riskAssessment = await riskEngine.assess(rawDecision);
  if (riskAssessment.veto) {
    return createNoTradeDecision(symbol, timeframe, 'Risk veto: ' + riskAssessment.reason);
  }

  // 11. Portfolio Gate
  const portfolioImpact = await portfolioEngine.assess(rawDecision);
  if (portfolioImpact.veto) {
    return createNoTradeDecision(symbol, timeframe, 'Portfolio veto: ' + portfolioImpact.reason);
  }

  // 12. Final Decision
  const decision = buildDecision({
    ...rawDecision,
    riskAssessment,
    portfolioImpact,
    entryZone: calculateEntryZone(context),
    stopLoss: riskAssessment.recommendedStopLoss,
    targets: riskAssessment.recommendedTargets,
    positionSize: portfolioImpact.recommendedSize
  });

  // 13. Explain
  decision.explanation = explainabilityEngine.explain(decision);

  // 14. Persist & Emit
  await persistDecision(decision);
  await kafkaProducer.send('decision.generated', decision);

  return decision;
}
```

### Confidence Formula (Calibrated)

```
baseScore = Σ(evidence.confidence * evidence.weight) / Σ(evidence.weight)
contradictionPenalty = 1 - (0.25 * contradictionSeverity)  // 0-1 scale
regimeBonus = context.regime.stability * 0.05               // Max +5%
qualityMultiplier = dataQuality.score                       // 0.5 - 1.0
mlBoost = mlPrediction.confidence * 0.1 * mlCalibration   // Only if model is calibrated

confidence = (baseScore * contradictionPenalty * qualityMultiplier) + regimeBonus + mlBoost
confidence = clamp(confidence, 0, 1)
```

**Thresholds**:
- `≥ 0.75` → Generate BUY/SELL with full sizing
- `0.60 - 0.74` → Generate observation (reduced size or no trade)
- `< 0.60` → NO_TRADE

---

## 8. Point-in-Time Correctness System

This is the most critical subsystem. Look-ahead bias must be architecturally impossible.

### The Rule
**At candle index `i`, no engine may access data from index `i+1` or beyond.**

### Enforcement

1. **Candle Slicing**: The API always passes `candles[0..i]` to engines. Never the full array.
2. **Feature Store (Feast)**: Features are pre-computed and stored with a `event_timestamp`. The feature store enforces point-in-time retrieval.
3. **Pattern Confirmation**: Patterns are only valid after the confirming candle closes. A "head and shoulders" is not detected at the right shoulder — it's detected one candle after the neckline break.
4. **Lag Indicators**: All indicators have explicit `lookback` and `lag` properties. SMA(20) at candle `i` uses candles `i-19` to `i`. Never `i` to `i+19`.
5. **Backtest Simulation**: The backtest engine runs the exact same pipeline as live, but replays historical events. It cannot cheat because it uses the same candle-slicing logic.

### Feature Store Schema (Feast)

```yaml
# feature_store.yaml
entity: candle
features:
  - name: returns_1d
    dtype: FLOAT
    ttl: 86400s
  - name: rsi_14
    dtype: FLOAT
    ttl: 86400s
  - name: atr_14
    dtype: FLOAT
    ttl: 86400s
  - name: volume_ratio
    dtype: FLOAT
    ttl: 86400s
  - name: regime
    dtype: STRING
    ttl: 86400s
```

Every feature is computed at candle close and stored with `event_timestamp = candle.timestamp`. When the ML service requests features for time `T`, Feast returns only features where `event_timestamp <= T`.

---

## 9. Paper Trading Engine

Paper trading is not a frontend feature. It is a server-side state machine.

### Position State Machine

```
PENDING ──► OPEN ──► [SL_HIT | TP_HIT | TRAILING_HIT | MANUAL_CLOSE] ──► CLOSED
```

### Execution Logic

```typescript
// apps/api/src/paper/engine.ts

class PaperTradingEngine {
  async onNewCandle(candle: Candle): Promise<void> {
    // 1. Check open positions for this symbol
    const positions = await this.getOpenPositions(candle.symbol);

    for (const position of positions) {
      // 2. Check stop loss
      if (this.isStopLossHit(position, candle)) {
        await this.closePosition(position, candle, 'stop_loss');
        continue;
      }

      // 3. Check take profits
      const hitTarget = position.takeProfits.find(tp => this.isTargetHit(position, tp, candle));
      if (hitTarget) {
        await this.partialClose(position, candle, hitTarget);
        continue;
      }

      // 4. Update trailing stop
      if (position.trailingStop) {
        await this.updateTrailingStop(position, candle);
      }

      // 5. Update unrealized P&L
      await this.updateUnrealizedPnl(position, candle);
    }

    // 6. Check pending orders
    const pendingOrders = await this.getPendingOrders(candle.symbol);
    for (const order of pendingOrders) {
      if (this.isOrderFillable(order, candle)) {
        await this.fillOrder(order, candle);
      }
    }
  }

  async executeDecision(decision: TradeDecision): Promise<PaperPosition> {
    // Risk validation already passed in decision pipeline
    const order: PaperOrder = {
      type: 'market',
      side: decision.side,
      symbol: decision.symbol,
      quantity: this.calculateQuantity(decision),
      entryPrice: decision.entryZone.max, // Worst-case fill
      stopLoss: decision.stopLoss,
      takeProfits: decision.targets,
      trailingStop: null, // MVP: no trailing stops
      decisionId: decision.id
    };

    return this.createPosition(order);
  }
}
```

### P&L Calculation
- **Unrealized P&L**: Updated on every new candle
- **Realized P&L**: Calculated at close, including commission
- **Commission**: 0.1% per side (configurable)
- **Slippage**: Random 0.02% - 0.05% on entry/exit (configurable)

---

## 10. Backtesting Engine

The backtest engine is a **time-traveling event replayer**. It runs the exact same code as production.

### Architecture

```typescript
// apps/api/src/backtest/engine.ts

class BacktestEngine {
  async run(config: BacktestConfig): Promise<BacktestResult> {
    // 1. Load historical candles
    const candles = await this.loadCandles(config.symbol, config.timeframe, config.startDate, config.endDate);

    // 2. Validate no gaps
    this.validateDataQuality(candles);

    // 3. Reset paper trading state
    const paperState = new PaperTradingState({
      initialCapital: config.initialCapital,
      commission: config.commission,
      slippage: config.slippage
    });

    // 4. Bar-by-bar simulation
    const equityCurve: EquityPoint[] = [];
    const trades: PaperPosition[] = [];

    for (let i = config.lookback; i < candles.length; i++) {
      const currentCandle = candles[i];
      const availableCandles = candles.slice(0, i + 1); // [0..i] ONLY

      // Run the EXACT same pipeline as live
      const decision = await runDecisionPipeline(
        config.symbol,
        config.timeframe,
        currentCandle,
        { candles: availableCandles } // Enforced slicing
      );

      if (decision && decision.decisionType !== 'NO_TRADE') {
        const position = await paperState.executeDecision(decision, currentCandle);
        if (position) trades.push(position);
      }

      // Update open positions
      await paperState.onNewCandle(currentCandle);

      // Record equity
      equityCurve.push({
        timestamp: currentCandle.timestamp,
        equity: paperState.totalEquity
      });
    }

    // 5. Calculate metrics
    return this.calculateMetrics(trades, equityCurve, config);
  }
}
```

### Look-Ahead Bias Detection (Automated)

Every backtest result must include a `lookAheadBiasCheck` field. This is validated by:

1. **Feature Audit**: Verify all features used were computable at candle close.
2. **Pattern Audit**: Verify pattern detection uses confirmation candles only.
3. **Execution Audit**: Verify fill prices are realistic (not intra-candle optimal).
4. **Injected Bias Test**: Run a backtest where future returns are injected as a feature. The system MUST detect this and reject the result.

If any check fails, the backtest is marked `INVALID` and cannot be used for strategy validation.

### Metrics
- Total trades, win rate, profit factor
- Sharpe ratio, Sortino ratio, Calmar ratio
- Max drawdown (absolute and %)
- Average win/loss, expectancy
- Equity curve, underwater chart
- Win/loss streak distribution

---

## 11. Machine Learning Architecture

### Layer 1: Feature Engineering (Python)
- **Point-in-time features** computed from raw candles
- **Feature store (Feast)** for retrieval consistency
- **Feature versioning** — every feature schema change is versioned

### Layer 2: Model Training (Python)
- **Baseline**: LightGBM classifier (direction: up/down/neutral)
- **Advanced**: LSTM (only if LightGBM is profitable)
- **Training pipeline**: 
  ```
  Load Data → Compute Features → Time-Series Split → Train → Validate → Calibrate → Register
  ```
- **Validation**: Walk-forward validation (not random train/test split)
- **Calibration**: Platt scaling or isotonic regression so predicted probabilities match actual frequencies

### Layer 3: Model Registry (MLflow)
- Every trained model is an artifact with:
  - Model binary
  - Feature schema
  - Training config (hyperparameters, random seed)
  - Validation metrics
  - Calibration curve
  - Feature importance
- **Staging**: `development` → `staging` → `production`
- **A/B testing**: Two production models can run simultaneously

### Layer 4: Inference (Python API)
- **Endpoint**: `POST /predict`
- **Latency**: < 200ms for feature retrieval + inference
- **Input**: Raw candles (features computed on-the-fly or retrieved from store)
- **Output**: Direction, confidence, calibrated probabilities, feature importance

### Layer 5: Drift Detection
- **Feature drift**: PSI (Population Stability Index) between training and live feature distributions
- **Prediction drift**: Distribution shift in model outputs
- **Performance drift**: Rolling accuracy window. If accuracy drops below threshold, alert and trigger retraining.

### Client-Side ML (TensorFlow.js)
- **Purpose Only**: Lightweight pre-trained models for offline inference or quick checks
- **Models**: Tiny dense networks (< 1MB)
- **Training**: Never in browser. Loaded from ML service
- **Fallback**: If client model fails, defer to server-side prediction

---

## 12. Database Schema

### PostgreSQL (Supabase) — Application Data

```sql
-- Users & Auth (managed by Supabase Auth)
-- profiles table syncs with auth.users
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'trader' CHECK (role IN ('trader', 'analyst', 'admin')),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own profile"
  ON profiles FOR ALL USING (auth.uid() = id);

-- Decisions
CREATE TABLE decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  decision_type TEXT NOT NULL CHECK (decision_type IN ('BUY', 'SELL', 'NO_TRADE')),
  confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  side TEXT CHECK (side IN ('long', 'short', 'neutral')),
  entry_zone JSONB,
  stop_loss NUMERIC,
  targets JSONB,
  risk_reward_ratio NUMERIC,
  position_size_percent NUMERIC,
  strategy TEXT,
  evidence JSONB NOT NULL DEFAULT '[]',
  contradictions JSONB NOT NULL DEFAULT '[]',
  reasoning TEXT NOT NULL,
  explanation TEXT NOT NULL,
  risk_assessment JSONB,
  portfolio_impact JSONB,
  market_context JSONB,
  engine_versions JSONB,
  ml_prediction JSONB,
  execution_status TEXT DEFAULT 'pending' CHECK (execution_status IN ('pending', 'executed', 'rejected', 'expired'))
);

CREATE INDEX idx_decisions_user_time ON decisions(user_id, timestamp DESC);
CREATE INDEX idx_decisions_symbol ON decisions(symbol, timeframe, timestamp DESC);

ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own decisions"
  ON decisions FOR ALL USING (auth.uid() = user_id);

-- Paper Positions
CREATE TABLE paper_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_id UUID REFERENCES decisions(id),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  entry_price NUMERIC NOT NULL,
  entry_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quantity NUMERIC NOT NULL,
  stop_loss NUMERIC,
  take_profits JSONB,
  trailing_stop JSONB,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'pending')),
  unrealized_pnl NUMERIC DEFAULT 0,
  realized_pnl NUMERIC,
  close_price NUMERIC,
  close_timestamp TIMESTAMPTZ,
  close_reason TEXT CHECK (close_reason IN ('stop_loss', 'take_profit', 'manual', 'trailing_stop', 'expired')),
  commission_paid NUMERIC DEFAULT 0,
  slippage_paid NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_positions_user_status ON paper_positions(user_id, status);
CREATE INDEX idx_positions_symbol ON paper_positions(symbol, status);

ALTER TABLE paper_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own positions"
  ON paper_positions FOR ALL USING (auth.uid() = user_id);

-- Backtest Results
CREATE TABLE backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  initial_capital NUMERIC NOT NULL,
  commission NUMERIC NOT NULL,
  slippage NUMERIC NOT NULL,
  total_trades INTEGER,
  win_rate NUMERIC,
  profit_factor NUMERIC,
  sharpe_ratio NUMERIC,
  sortino_ratio NUMERIC,
  calmar_ratio NUMERIC,
  max_drawdown NUMERIC,
  max_drawdown_percent NUMERIC,
  average_win NUMERIC,
  average_loss NUMERIC,
  expectancy NUMERIC,
  total_return NUMERIC,
  annualized_return NUMERIC,
  equity_curve JSONB,
  trades JSONB,
  parameters JSONB,
  look_ahead_bias_check BOOLEAN NOT NULL DEFAULT FALSE,
  is_valid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE backtest_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own backtests"
  ON backtest_results FOR ALL USING (auth.uid() = user_id);

-- Alerts
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('price', 'pattern', 'decision', 'risk', 'market_condition', 'drift')),
  symbol TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  is_read BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_user_unread ON alerts(user_id, is_read, created_at DESC);
```

### TimescaleDB — Market Data & Features

```sql
-- Candles (hypertable)
CREATE TABLE candles (
  timestamp TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  source TEXT NOT NULL,
  UNIQUE(symbol, timeframe, timestamp)
);

-- Convert to hypertable (time-series optimized)
SELECT create_hypertable('candles', 'timestamp');
CREATE INDEX idx_candles_lookup ON candles(symbol, timeframe, timestamp DESC);

-- Features (hypertable)
CREATE TABLE features (
  timestamp TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  returns_1d NUMERIC,
  returns_5d NUMERIC,
  volatility_14d NUMERIC,
  rsi_14 NUMERIC,
  macd_line NUMERIC,
  macd_signal NUMERIC,
  macd_histogram NUMERIC,
  atr_14 NUMERIC,
  adx_14 NUMERIC,
  obv NUMERIC,
  bb_upper NUMERIC,
  bb_middle NUMERIC,
  bb_lower NUMERIC,
  volume_ma_20 NUMERIC,
  volume_ratio NUMERIC,
  regime TEXT
);

SELECT create_hypertable('features', 'timestamp');
CREATE INDEX idx_features_lookup ON features(symbol, timeframe, timestamp DESC);

-- Evidence log (hypertable) — audit trail of every engine output
CREATE TABLE evidence_log (
  timestamp TIMESTAMPTZ NOT NULL,
  decision_id UUID,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  engine TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  direction TEXT NOT NULL,
  confidence NUMERIC NOT NULL,
  weight NUMERIC NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB
);

SELECT create_hypertable('evidence_log', 'timestamp');
```

---

## 13. API Design (tRPC + Fastify)

### tRPC Router (Next.js ↔ API)

```typescript
// apps/api/src/trpc/router.ts

export const appRouter = router({
  // Market data
  market: router({
    getCandles: protectedProcedure
      .input(z.object({ symbol: z.string(), timeframe: z.string(), limit: z.number().max(5000) }))
      .query(async ({ input }) => marketService.getCandles(input)),
    getLatest: protectedProcedure
      .input(z.object({ symbol: z.string(), timeframe: z.string() }))
      .query(async ({ input }) => marketService.getLatest(input)),
    subscribe: protectedProcedure
      .input(z.object({ symbol: z.string(), timeframe: z.string() }))
      .subscription(async function* ({ input }) {
        // Server-sent events or WebSocket push
        for await (const candle of marketStream.subscribe(input)) {
          yield candle;
        }
      })
  }),

  // Decisions
  decision: router({
    list: protectedProcedure
      .input(z.object({ cursor: z.string().optional(), limit: z.number().default(20) }))
      .query(async ({ ctx, input }) => decisionService.list(ctx.user.id, input)),
    get: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => decisionService.get(ctx.user.id, input.id)),
    latest: protectedProcedure
      .input(z.object({ symbol: z.string().optional() }))
      .query(async ({ ctx, input }) => decisionService.latest(ctx.user.id, input.symbol))
  }),

  // Paper trading
  paper: router({
    positions: protectedProcedure
      .query(async ({ ctx }) => paperService.getPositions(ctx.user.id)),
    history: protectedProcedure
      .input(z.object({ limit: z.number().default(50) }))
      .query(async ({ ctx, input }) => paperService.getHistory(ctx.user.id, input.limit)),
    closePosition: protectedProcedure
      .input(z.object({ positionId: z.string().uuid(), reason: z.string() }))
      .mutation(async ({ ctx, input }) => paperService.closePosition(ctx.user.id, input))
  }),

  // Backtesting
  backtest: router({
    run: protectedProcedure
      .input(BacktestConfigSchema)
      .mutation(async ({ ctx, input }) => {
        const jobId = await backtestService.start(ctx.user.id, input);
        return { jobId };
      }),
    status: protectedProcedure
      .input(z.object({ jobId: z.string() }))
      .query(async ({ input }) => backtestService.getStatus(input.jobId)),
    results: protectedProcedure
      .input(z.object({ cursor: z.string().optional(), limit: z.number().default(10) }))
      .query(async ({ ctx, input }) => backtestService.listResults(ctx.user.id, input)),
    get: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => backtestService.getResult(ctx.user.id, input.id))
  }),

  // ML
  ml: router({
    status: protectedProcedure
      .query(async () => mlClient.getModelStatus()),
    predict: protectedProcedure
      .input(z.object({ symbol: z.string(), timeframe: z.string() }))
      .query(async ({ input }) => mlClient.predict(input))
  }),

  // Alerts
  alert: router({
    list: protectedProcedure
      .input(z.object({ unreadOnly: z.boolean().default(false), limit: z.number().default(20) }))
      .query(async ({ ctx, input }) => alertService.list(ctx.user.id, input)),
    markRead: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => alertService.markRead(ctx.user.id, input.id))
  })
});
```

### Fastify Routes (API Internal)

```typescript
// Health, metrics, webhook endpoints
app.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }));
app.get('/metrics', async () => metricsService.getPrometheusMetrics());

// Webhook from ML service when training completes
app.post('/webhooks/ml/training-complete', async (request, reply) => {
  await handleTrainingComplete(request.body);
  return { received: true };
});
```

---

## 14. Frontend Architecture

### Next.js App Router Structure

```
app/
├── layout.tsx              # Root layout with providers
├── page.tsx                # Dashboard (default route)
├── globals.css
│
├── (dashboard)/            # Dashboard layout group
│   ├── layout.tsx          # Dashboard shell (sidebar + header)
│   ├── page.tsx            # Dashboard overview
│   ├── terminal/
│   │   └── page.tsx        # Trading terminal
│   ├── backtest/
│   │   └── page.tsx        # Backtesting interface
│   ├── portfolio/
│   │   └── page.tsx        # Portfolio management
│   ├── risk/
│   │   └── page.tsx        # Risk dashboard
│   ├── ai-center/
│   │   └── page.tsx        # ML model status & controls
│   └── settings/
│       └── page.tsx        # User settings
│
├── auth/
│   └── page.tsx            # Authentication page
│
└── api/
    └── trpc/
        └── [trpc]/
            └── route.ts    # tRPC API handler
```

### Component Architecture

```
components/
├── ui/                     # shadcn/ui components (button, card, dialog, etc.)
├── layout/
│   ├── AppShell.tsx        # Dashboard layout wrapper
│   ├── Sidebar.tsx         # Navigation sidebar
│   ├── Header.tsx          # Top bar
│   └── Breadcrumbs.tsx
├── charts/
│   └── CandlestickChart.tsx  # Lightweight Charts wrapper
├── trading/
│   ├── DecisionCard.tsx    # Display a trade decision
│   ├── ExplanationPanel.tsx # Human-readable explanation
│   ├── EvidenceList.tsx    # List of evidence items
│   ├── PositionTable.tsx   # Open positions
│   └── OrderForm.tsx       # Paper order entry
├── backtest/
│   ├── BacktestConfigForm.tsx
│   ├── EquityCurveChart.tsx
│   ├── MetricsGrid.tsx
│   └── TradeList.tsx
└── common/
    ├── LoadingState.tsx
    ├── ErrorBoundary.tsx
    └── EmptyState.tsx
```

### State Management

**Zustand (UI State Only)**:
```typescript
// stores/uiStore.ts
interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  activeSymbol: string;
  activeTimeframe: Timeframe;
  toggleSidebar: () => void;
  setTheme: (theme: UIState['theme']) => void;
}
```

**TanStack Query (Server State)**:
- Candles, decisions, positions, backtests — all fetched via tRPC + React Query
- Real-time updates via tRPC subscriptions (push from WebSocket server through API)

---

## 15. Real-Time Architecture

### WebSocket Server (`apps/ws`)

```typescript
// WebSocket server maintains connections and broadcasts
class MarketWebSocketServer {
  private clients = new Map<string, WebSocket>();
  private subscriptions = new Map<string, Set<string>>(); // symbol -> clientIds

  async start(): Promise<void> {
    // Subscribe to Kafka topic 'candle.closed'
    kafkaConsumer.subscribe('candle.closed', (event) => {
      this.broadcast(event.payload.symbol, event.payload.candle);
    });

    // Subscribe to Kafka topic 'decision.generated'
    kafkaConsumer.subscribe('decision.generated', (event) => {
      this.broadcastDecision(event.payload.decision);
    });
  }

  private broadcast(symbol: string, candle: Candle): void {
    const clients = this.subscriptions.get(symbol);
    if (!clients) return;

    const message = JSON.stringify({ type: 'candle', symbol, candle });
    for (const clientId of clients) {
      const ws = this.clients.get(clientId);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }
}
```

### Frontend Connection

```typescript
// hooks/useMarketStream.ts
export function useMarketStream(symbol: string, timeframe: Timeframe) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'candle' && data.symbol === symbol) {
        // Update React Query cache
        queryClient.setQueryData(
          ['market', 'candles', symbol, timeframe],
          (old: Candle[]) => [...old.slice(-999), data.candle]
        );
      }
    };

    return () => ws.close();
  }, [symbol, timeframe, queryClient]);
}
```

---

## 16. Security Architecture

### Authentication
- Supabase Auth with email/password
- JWT tokens, refreshed automatically
- Protected tRPC procedures verify JWT on every request

### Authorization
- Row Level Security on all PostgreSQL tables
- User can only access their own data
- API validates `user_id` matches authenticated user

### Secrets Management
- API keys (EODHD, etc.) stored in environment variables, never in code
- Frontend never sees API keys — all external API calls proxy through Next.js API routes or the API service
- ML service API key shared only between API service and ML service

### Input Validation
- Zod schemas on all tRPC inputs
- Fastify schema validation on all HTTP endpoints
- SQL injection impossible via parameterized queries (Prisma or Drizzle)

### Rate Limiting
- Redis-based rate limiting on API
- Market data ingestion rate-limited per provider
- WebSocket connection limits per user

---

## 17. Development & Deployment

### Local Development (Docker Compose)

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: timescale/timescaledb:latest-pg15
    environment:
      POSTGRES_USER: Quantum
      POSTGRES_PASSWORD: Quantum
      POSTGRES_DB: Quantum
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  kafka:
    image: confluentinc/cp-kafka:latest
    # ... Kafka config

  api:
    build: ./apps/api
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgres://Quantum:Quantum@postgres:5432/Quantum
      REDIS_URL: redis://redis:6379
      KAFKA_BROKERS: kafka:9092
    depends_on:
      - postgres
      - redis
      - kafka

  ml:
    build: ./apps/ml
    ports:
      - "3002:3002"
    environment:
      DATABASE_URL: postgres://Quantum:Quantum@postgres:5432/Quantum
    depends_on:
      - postgres

  ws:
    build: ./apps/ws
    ports:
      - "3003:3003"
    environment:
      REDIS_URL: redis://redis:6379
      KAFKA_BROKERS: kafka:9092
    depends_on:
      - redis
      - kafka

  web:
    build: ./apps/web
    ports:
      - "3000:3000"
    environment:
      API_URL: http://api:3001
      WS_URL: ws://ws:3003
    depends_on:
      - api
      - ws

volumes:
  postgres_data:
```

### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - name: Install dependencies
        run: pnpm install
      - name: Type check
        run: pnpm typecheck
      - name: Lint
        run: pnpm lint
      - name: Test
        run: pnpm test
      - name: Build
        run: pnpm build
```

### Production Deployment

**Option A: Kubernetes (Recommended for scale)**
- `web` → Vercel or Kubernetes ingress
- `api`, `ws`, `ingest` → Kubernetes deployments
- `ml` → Kubernetes deployment with GPU nodes for training
- `postgres` → Managed PostgreSQL (Supabase or AWS RDS)
- `redis` → Managed Redis (Upstash or AWS ElastiCache)
- `kafka` → Managed Kafka (Confluent Cloud or AWS MSK)

**Option B: Simplified (MVP)**
- `web` → Vercel
- `api`, `ws`, `ingest` → Railway or Render
- `ml` → Railway (CPU only, training runs overnight)
- `postgres` → Supabase
- `redis` → Upstash
- `kafka` → Redpanda Cloud (lightweight Kafka alternative)

---

## 18. MVP Scope (Hard Cuts)

### IN (Must Have for MVP)
- [ ] Next.js frontend with Dashboard + Terminal + Backtest + Portfolio + Risk + AI Center + Settings
- [ ] Supabase Auth + PostgreSQL + RLS
- [ ] TimescaleDB for candles
- [ ] Redis for caching
- [ ] Kafka for events
- [ ] Node.js API service (Fastify) with tRPC
- [ ] WebSocket server for real-time data
- [ ] Market data ingestion from EODHD
- [ ] 3 analysis engines: Indicators, Structure, ML (LightGBM)
- [ ] Regime engine
- [ ] Master Decision Engine with evidence synthesis
- [ ] Risk engine with veto power
- [ ] Portfolio engine with basic constraints
- [ ] Paper trading engine (market orders, SL, TP)
- [ ] Bar-by-bar backtesting with look-ahead bias detection
- [ ] Python ML service with FastAPI + LightGBM + Feast
- [ ] Explainability panel
- [ ] Alert system

### OUT (Post-MVP)
- [ ] Binance integration (crypto-only features)
- [ ] Pattern engine (candlestick/chart patterns)
- [ ] Liquidity engine
- [ ] Historical similarity engine
- [ ] Institutional analysis engine
- [ ] News feed + sentiment
- [ ] Scanner page
- [ ] Learning/Research/Journal pages
- [ ] Watchlist page
- [ ] Kinetic Coach
- [ ] Walk-forward testing
- [ ] Monte Carlo simulation
- [ ] LSTM/Transformer models
- [ ] Multi-timeframe analysis
- [ ] Trailing stops
- [ ] Limit/stop orders (MVP: market only)
- [ ] Mobile app

---

## 19. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)
- [ ] Monorepo setup (Turborepo, pnpm, shared packages)
- [ ] Docker Compose local stack (Postgres, Redis, Kafka)
- [ ] Next.js scaffold with shadcn/ui, tRPC client
- [ ] Supabase project setup, Auth, initial migrations
- [ ] Fastify API service scaffold with tRPC server
- [ ] WebSocket server scaffold
- [ ] Market data ingestion worker (EODHD)
- [ ] TimescaleDB candle storage
- [ ] Dashboard page (market overview)

### Phase 2: Core Engines (Weeks 4-5)
- [ ] Engine plugin architecture
- [ ] Indicator engine (RSI, MACD, EMA, Bollinger, ATR)
- [ ] Market structure engine (swing highs/lows, trend)
- [ ] Regime engine
- [ ] Evidence interface + registry
- [ ] Master Decision Engine (simplified pipeline)
- [ ] Terminal page with candlestick chart
- [ ] Decision display panel

### Phase 3: Risk & Portfolio (Weeks 6-7)
- [ ] Risk engine (position sizing, SL, TP, veto)
- [ ] Portfolio engine (exposure, correlation, constraints)
- [ ] Paper trading engine (market orders, position lifecycle)
- [ ] Portfolio page
- [ ] Risk page
- [ ] Order execution flow

### Phase 4: Backtesting (Weeks 8-9)
- [ ] Bar-by-bar backtest engine
- [ ] Look-ahead bias detection system
- [ ] Backtest metrics calculation
- [ ] Backtest page (config, results, equity curve)
- [ ] Trade history view

### Phase 5: ML Integration (Weeks 10-11)
- [ ] Python FastAPI ML service scaffold
- [ ] Feature engineering pipeline
- [ ] Feast feature store setup
- [ ] LightGBM model training pipeline
- [ ] MLflow model registry
- [ ] Inference endpoint
- [ ] Client-side integration (AI Center page)
- [ ] Drift detection basics

### Phase 6: Polish & Real-Time (Weeks 12-13)
- [ ] WebSocket real-time candle streaming
- [ ] Decision pipeline runs on schedule (every 1h/4h/1d)
- [ ] Alert system (decisions, risk, drift)
- [ ] Settings page
- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] Documentation

### Phase 7: Validation (Week 14+)
- [ ] Run backtests over 2+ years of data
- [ ] Validate positive expectancy
- [ ] Paper trade for 1 month minimum
- [ ] Compare paper results to backtest
- [ ] Fix discrepancies
- [ ] Prepare for expansion

---

## 20. Quality Gates

### Before Any Commit
- [ ] TypeScript strict mode passes (`tsc --noEmit`)
- [ ] ESLint passes
- [ ] Unit tests pass
- [ ] No `console.log` in production code

### Before Merge
- [ ] Integration tests pass (decision pipeline end-to-end)
- [ ] Backtest look-ahead bias test passes (injected bias must be caught)
- [ ] All new code has tests
- [ ] Performance benchmarks met (decision < 2s, chart render < 100ms)

### Before Release
- [ ] Security audit (no secrets, RLS enabled, input validated)
- [ ] Load test (100 concurrent users, 1000 candles/sec ingestion)
- [ ] Backtest validation: 2 years of data, positive expectancy, no look-ahead bias
- [ ] Paper trading alignment: 30 days of paper trades within 10% of backtest expectations
- [ ] Documentation complete (API docs, deployment guide, engine developer guide)

---

## 21. Anti-Patterns (Non-Negotiable)

1. **No Look-Ahead Bias** — Architecturally enforced via candle slicing and feature store point-in-time retrieval.
2. **No Training in Browser** — ML training is server-side only. Browser inference is pre-trained models only.
3. **No Hardcoded Secrets** — Environment variables only. Frontend never sees API keys.
4. **No Direct API Calls from Engines** — All market data via `MarketDataProvider` abstraction.
5. **No Unvalidated Backtests** — Every backtest must pass automated look-ahead bias detection.
6. **No Black-Box Decisions** — Every decision has a mandatory explanation field.
7. **No Ignoring Contradictions** — Conflicting evidence reduces confidence and is surfaced to the user.
8. **No Risk as Afterthought** — Risk engine has veto power. Period.
9. **No Overfitting** — Optimize on in-sample, validate on out-of-sample. Walk-forward required.
10. **No Scope Creep in MVP** — 7 pages, 3 engines, 1 symbol class. Everything else is Phase 7.

---

*Quantum is built on the principle that trading intelligence is not about having the most indicators — it is about having the most rigorous process. Every architectural decision in this specification serves that principle.*
