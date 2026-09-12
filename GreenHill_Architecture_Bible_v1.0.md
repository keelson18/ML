# Quantuam trade Architecture Bible v1.0

**Status:** Engineering Baseline  
**Purpose:** Define exactly how every major Quantuam trade subsystem connects.  
**Scope:** Existing Quantuam trade codebase transformation into an institutional-grade AI trading intelligence platform for paper trading only.

---

## 1. System Mission

Quantuam trade is a multi-layer trading intelligence platform that:

1. Ingests and normalizes market data.
2. Builds multi-timeframe market context.
3. Detects structure, liquidity, patterns, regimes, and opportunities.
4. Selects and evaluates strategies.
5. Performs independent risk and portfolio checks.
6. Aggregates evidence through a Master Decision Engine.
7. Explains every material decision.
8. Executes only simulated/paper trades.
9. Reviews outcomes.
10. Stores validated knowledge.
11. Learns through controlled research and validation.

**No real-money order execution is part of v1.0.**

---

## 2. Architectural Principles

### 2.1 Separation of concerns
Frontend presentation, application orchestration, intelligence, data access, and infrastructure must remain separate.

### 2.2 Backend owns intelligence
Trading decisions must not depend on browser-side business logic.

### 2.3 Risk is independent
Risk validation must be capable of vetoing a trade regardless of strategy confidence.

### 2.4 Evidence before automation
A decision requires traceable evidence and a reproducible context snapshot.

### 2.5 Deterministic first
Deterministic market/risk logic should remain authoritative where rules are explicit. ML/AI provides evidence, ranking, interpretation, or adaptation rather than uncontrolled authority.

### 2.6 Research is isolated
Experimental models and strategies cannot silently modify production behavior.

### 2.7 Explainability is first-class
Every decision must retain the evidence, model/strategy versions, context, and reasons used to produce it.

### 2.8 No hardcoded secrets or market assumptions
Configuration belongs in validated configuration/environment systems. Market thresholds must be versioned and data-driven where appropriate.

---

## 3. Target System Architecture

```text
                    ┌─────────────────────┐
                    │      FRONTEND       │
                    │ React + TypeScript  │
                    └──────────┬──────────┘
                               │ HTTPS/WebSocket
                               ▼
                    ┌─────────────────────┐
                    │      API LAYER      │
                    │ Auth / REST / WS    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ APPLICATION LAYER   │
                    │ Use Cases / Jobs     │
                    └──────────┬──────────┘
                               │
                               ▼
                 ┌─────────────────────────────┐
                 │ INTELLIGENCE ORCHESTRATION  │
                 └──────────────┬──────────────┘
                                │
       ┌────────────┬───────────┼───────────┬──────────────┐
       ▼            ▼           ▼           ▼              ▼
   Market       Strategy      Risk       Portfolio      Knowledge
 Intelligence  Intelligence Intelligence Intelligence Intelligence
       │            │           │           │              │
       └────────────┴───────────┼───────────┴──────────────┘
                                ▼
                     ┌────────────────────┐
                     │ MASTER DECISION    │
                     │ ENGINE              │
                     └─────────┬──────────┘
                               │
                     ┌─────────┴─────────┐
                     ▼                   ▼
              Explainability       Risk Gate
                     │                   │
                     └─────────┬─────────┘
                               ▼
                    ┌────────────────────┐
                    │ PAPER EXECUTION    │
                    └─────────┬──────────┘
                              ▼
                    ┌────────────────────┐
                    │ REVIEW / LEARNING  │
                    └─────────┬──────────┘
                              ▼
                    ┌────────────────────┐
                    │ KNOWLEDGE /        │
                    │ RESEARCH           │
                    └────────────────────┘

Cross-cutting:
Security | Observability | Audit | Model Governance | Configuration
```

---

## 4. Major Layers

### 4.1 Presentation Layer
Responsible for:

- Dashboards
- Trading terminal
- Charts
- Portfolio views
- Research UI
- Backtesting UI
- Journal
- Learning views
- Alerts
- Settings

It must not own authoritative trading decisions.

### 4.2 API Layer
Responsible for:

- Authentication/authorization enforcement
- Request validation
- Rate limiting
- REST endpoints
- WebSocket streams
- API versioning
- Serialization
- Error contracts

### 4.3 Application Layer
Contains use cases such as:

- Analyze market
- Generate trade proposal
- Validate trade
- Execute paper trade
- Close position
- Review trade
- Run backtest
- Start research experiment
- Retrieve knowledge
- Register model

### 4.4 Intelligence Layer
Contains specialized domain engines.

No engine should silently mutate another engine's state.

### 4.5 Domain Layer
Contains domain entities, value objects, policies, and contracts.

### 4.6 Data Layer
Responsible for PostgreSQL access, repositories, migrations, caching, historical data, and persistence.

### 4.7 Infrastructure Layer
Responsible for:

- External market-data adapters
- Workers
- Queues
- Cache
- Logging
- Monitoring
- Deployment
- Secrets/configuration

---

## 5. Existing Codebase Transformation

The current project contains useful frontend and trading-intelligence foundations.

### Preserve

- React frontend
- TypeScript
- Tailwind
- Trading UI
- Charts
- Paper trading concepts
- Indicators
- Patterns
- Strategies
- Risk calculations
- Backtesting
- Explainability
- Existing database foundation

### Refactor

- `institutionalEngine`
- Decision logic
- AI/model integration
- Supabase functions
- Intelligence orchestration
- Frontend/backend boundary

### Add

- Backend/API boundary
- Specialized intelligence services
- Knowledge layer
- Learning layer
- Research layer
- Model governance
- Event processing
- Auditability
- Observability

The transformation must reuse sound logic rather than perform an unnecessary rewrite.

---

## 6. Core Data Flow

```text
External Market Data
        ↓
Provider Adapter
        ↓
Normalizer
        ↓
Data Validation
        ↓
Storage + Cache
        ↓
Feature / Context Builder
        ↓
Market Intelligence
        ↓
Strategy + Risk + Portfolio
        ↓
Evidence Aggregation
        ↓
Master Decision Engine
        ↓
Risk Gate
        ↓
Paper Execution
        ↓
Position / Trade Lifecycle
        ↓
Review
        ↓
Knowledge + Learning
```

---

## 7. Event-Driven Flow

Important events should be explicit and auditable.

Examples:

- `MarketDataReceived`
- `MarketContextUpdated`
- `PatternDetected`
- `LiquidityEventDetected`
- `StrategyEvaluated`
- `TradeDecisionCreated`
- `RiskCheckCompleted`
- `PaperOrderSubmitted`
- `PaperOrderFilled`
- `PositionClosed`
- `TradeReviewed`
- `LearningEventCreated`
- `ResearchExperimentCompleted`

Events must contain IDs, timestamps, versions, correlation IDs, and relevant context references.

---

## 8. Master Decision Engine Boundary

The Master Decision Engine receives:

- Market context
- Structure
- Liquidity
- Patterns
- Indicators
- Strategy candidates
- Historical similarity
- Model outputs
- Portfolio state
- Risk state

It produces a versioned `TradeDecision`.

It must not directly bypass the risk gate.

---

## 9. Risk Gate

The final execution path is:

```text
Decision
  ↓
Risk Validation
  ↓
Approved? ── No → Reject / Record
  │
 Yes
  ↓
Paper Execution
```

A high-confidence decision cannot override a hard risk rule.

---

## 10. Knowledge and Learning Boundary

Learning may propose changes, but production systems only consume approved artifacts.

```text
Observation
 → Review
 → Experiment
 → Validation
 → Approval
 → Versioned Knowledge/Model
 → Production
```

No uncontrolled self-modifying trading logic.

---

## 11. API Design

Use versioned APIs:

`/api/v1/...`

Core groups:

- `/auth`
- `/markets`
- `/assets`
- `/analysis`
- `/decisions`
- `/strategies`
- `/risk`
- `/portfolio`
- `/paper-trading`
- `/backtests`
- `/research`
- `/knowledge`
- `/learning`
- `/models`
- `/audit`

REST is used for commands/queries. WebSockets are used for live market and decision updates where required.

---

## 12. Security Architecture

Required:

- Secure authentication
- Authorization/RBAC
- Server-side secrets
- Input validation
- Rate limiting
- Audit logs
- RLS/database authorization where applicable
- Secure WebSocket authentication
- Dependency scanning
- No sensitive data in logs
- No client-side privileged credentials
- Safe error responses

---

## 13. Observability

Every production service should provide:

- Structured logs
- Metrics
- Health checks
- Traces/correlation IDs
- Error tracking
- Decision latency
- Data freshness
- Model latency
- Paper execution latency
- Queue health

Trading decisions must be reconstructable from logs + persisted evidence.

---

## 14. Testing Architecture

Required layers:

- Unit tests
- Integration tests
- Contract/API tests
- Database tests
- Intelligence engine tests
- Backtest correctness tests
- Risk invariant tests
- End-to-end tests
- Security tests
- Regression tests
- Load/performance tests

Trading logic requires deterministic fixtures and reproducible historical datasets.

---

## 15. Deployment Boundary

Recommended production shape:

```text
Frontend
   +
API Service
   +
Worker Services
   +
Scheduler
   +
PostgreSQL
   +
Redis/Cache
   +
Monitoring
```

Dockerized services should be independently deployable where justified.

---

## 16. Architectural Rules

1. Do not put trading rules in React components.
2. Do not allow the UI to directly execute trades.
3. Do not let AI output bypass deterministic risk controls.
4. Do not mix experimental models with production versions.
5. Do not hide decisions inside generic utility functions.
6. Do not duplicate domain logic across frontend and backend.
7. Do not introduce a new service without a clear boundary.
8. Do not delete existing working functionality without migration evidence.
9. Do not use real-money broker execution in v1.0.
10. Every major architectural decision must be documented.

---

## 17. Definition of Done

Architecture is accepted when:

- Boundaries are documented.
- Data flows are traceable.
- Dependencies are explicit.
- Security boundaries are defined.
- Failure paths are documented.
- Observability exists.
- Tests cover critical paths.
- Existing functionality has a migration strategy.
