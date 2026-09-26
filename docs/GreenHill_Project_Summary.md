# Quantuam trade — Project Summary

## 1. What Is Quantuam trade?

Quantuam trade is an **institutional-grade AI Trading Intelligence Platform for paper trading**.

Its goal is to analyze financial markets like an experienced trader, identify opportunities, manage risk, execute simulated trades autonomously, explain its decisions, and continuously improve from validated historical and paper-trading evidence.

Core philosophy:

**Analyze → Reason → Validate → Manage Risk → Paper Trade → Review → Learn**

Quantuam trade is designed for **paper trading only** at this stage. It is not a real-money trading system.

---

## 2. What Makes Quantuam trade Different?

Quantuam trade is not designed as a simple system that sends a chart to an AI and asks whether to buy or sell.

It is designed as a collection of specialized intelligence systems.

```text
Market Data
    ↓
Market Intelligence
    ↓
Strategy Intelligence
    ↓
Risk Intelligence
    ↓
Knowledge Intelligence
    ↓
Master Decision Engine
    ↓
BUY / SELL / HOLD / WATCH / NO TRADE
    ↓
Paper Trading
    ↓
Trade Review
    ↓
Learning Intelligence
    ↓
Research Intelligence
    ↓
Validated Knowledge
```

No single indicator, pattern, model, or AI response should control a trading decision.

---

## 3. Major Intelligence Engines

### Market Intelligence

Understands current market conditions, including:

- Market structure
- Trend
- Multi-timeframe context
- Liquidity
- Volume
- Volatility
- Trading sessions
- Support and resistance
- Supply and demand
- Market regimes
- News and economic events

### Strategy Intelligence

Determines which strategy is appropriate for the current market environment.

Potential strategy categories include:

- Trend following
- Momentum
- Breakouts
- Pullbacks
- Mean reversion
- Range trading
- Liquidity-based strategies
- ICT-style concepts
- Wyckoff concepts
- Scalping
- Swing trading
- Adaptive/hybrid strategies

Quantuam trade should not force one strategy onto every market condition.

### Risk Intelligence

Acts as the platform's risk department.

It evaluates:

- Position sizing
- Risk/reward
- Portfolio exposure
- Correlation
- Drawdown
- Volatility
- Concentration
- Circuit breakers
- Stress scenarios

Risk Intelligence has authority to veto a trade.

### Master Decision Engine

Combines evidence from the intelligence engines.

It evaluates:

- Market regime
- Higher-timeframe context
- Liquidity
- Strategy suitability
- Supporting evidence
- Conflicting evidence
- Historical similarity
- Risk
- Portfolio exposure
- Invalidation conditions

Possible decisions:

- BUY
- SELL
- HOLD
- WATCH
- NO TRADE

---

## 4. Knowledge Intelligence

Quantuam trade is designed to have persistent institutional memory.

It should maintain validated knowledge about:

- Assets
- Patterns
- Strategies
- Market regimes
- Historical situations
- Paper trades
- Strategy performance
- Failures
- Successful setups

The system should be able to ask:

> "Have we seen a situation similar to this before?"

Knowledge should include:

- Semantic memory
- Episodic memory
- Procedural memory
- Strategic memory
- Knowledge relationships
- Historical similarity

Knowledge is a first-class platform asset.

---

## 5. Learning Intelligence

Quantuam trade should improve over time, but learning must be governed.

A single winning or losing trade must not automatically rewrite strategy logic.

### Learning Pipeline

```text
Trade / Observation
    ↓
Review
    ↓
Evidence
    ↓
Statistical Validation
    ↓
Knowledge Update
    ↓
Controlled Improvement
```

Learning sources can include:

- Historical backtests
- Paper trades
- Forward testing
- Market evolution
- Research experiments
- Strategy performance
- Pattern reliability
- Risk events

The system must avoid learning blindly from random noise or isolated outcomes.

---

## 6. Research Intelligence

Quantuam trade includes a research environment for safely exploring improvements.

Research can investigate:

- New strategies
- Indicators
- Features
- Models
- Patterns
- Market relationships
- Trading hypotheses

### Research Lifecycle

```text
Hypothesis
    ↓
Research Design
    ↓
Historical Validation
    ↓
Backtesting
    ↓
Forward Simulation
    ↓
Statistical Review
    ↓
Risk Review
    ↓
Production Candidate
```

Research must remain separated from production decision-making until validated and approved.

---

## 7. Paper Trading

Quantuam trade's execution environment is paper trading only.

Every simulated trade should preserve its full context, including:

- Entry
- Stop loss
- Take profit
- Position size
- Risk
- Strategy
- Confidence
- Market state
- Evidence
- Model version
- Knowledge state
- Reasoning
- Portfolio state

This creates a valuable dataset for later analysis and controlled learning.

---

## 8. Explainability

Every important trading decision should be explainable.

Quantuam trade should answer:

- Why this trade?
- Why now?
- Why this strategy?
- Why this timeframe?
- What evidence supports it?
- What evidence conflicts with it?
- What risks exist?
- What could invalidate the trade?
- Why was another strategy rejected?
- Have similar situations occurred historically?

Quantuam trade should not simply output:

`BUY — 87% confidence`

without explaining the evidence behind that conclusion.

---

## 9. Existing Project

The current unfinished project is **not a blank project** and should not be discarded unnecessarily.

It already contains substantial foundations around:

- React
- TypeScript
- Vite
- Tailwind CSS
- Supabase/PostgreSQL
- Trading charts
- Paper trading
- Backtesting
- Risk
- Portfolio
- Patterns
- Indicators
- Strategies
- Explainability
- AI/model-related modules
- Institutional trading logic

The correct approach is to evolve the existing codebase toward the Quantuam trade target architecture.

---

## 10. Current Architecture Problem

The main weakness is not the UI.

The project has a significant amount of frontend-side intelligence and centralized trading logic.

The target architecture should move toward:

```text
Frontend
    ↓
API Layer
    ↓
Application Services
    ↓
Intelligence Orchestration
    ↓
Specialized Intelligence Engines
    ↓
Knowledge / Learning / Research
    ↓
Database + Data Infrastructure
```

The frontend should primarily present information and interact with backend services rather than acting as the core trading brain.

---

## 11. What We Keep

The existing project should preserve and improve:

- React frontend
- TypeScript
- UI components
- Trading terminal
- Charts
- Existing pages
- Paper trading concepts
- Indicators
- Patterns
- Strategies
- Risk calculations
- Backtesting
- Explainability
- Existing database foundation

---

## 12. What We Refactor

Major areas requiring architectural refactoring include:

- `institutionalEngine`
- Decision logic
- AI/model integration
- Database structure
- Supabase functions
- Frontend/backend boundaries
- Intelligence orchestration

Large centralized intelligence modules should be split into specialized engines.

---

## 13. What We Add

Major missing capabilities include:

- Proper backend architecture
- Market Intelligence Engine
- Strategy Intelligence Engine
- Risk Intelligence Engine
- Master Decision Engine
- Knowledge Intelligence
- Learning Intelligence
- Research Intelligence
- Model governance
- Portfolio intelligence
- Institutional risk controls
- Event-driven processing
- Improved observability
- Security architecture
- Auditability

---

## 14. Technology Philosophy

Quantuam trade should not depend entirely on external AI chatbot APIs for core trading intelligence.

The intended architecture combines:

```text
Deterministic Trading Logic
        +
Statistical Models
        +
Machine Learning
        +
Specialized AI Models
        +
Historical Knowledge
        +
Market Data
```

External AI APIs may be used where they provide value, but the core platform should remain robust, controllable, testable, and explainable without depending on a single external AI provider.

---

## 15. Master Architecture

The long-term Quantuam trade architecture is:

```text
                         Quantuam trade
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
       MARKET           KNOWLEDGE          RESEARCH
    INTELLIGENCE       INTELLIGENCE      INTELLIGENCE
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                     STRATEGY ENGINE
                            │
                       RISK ENGINE
                            │
                  MASTER DECISION ENGINE
                            │
                     PAPER TRADING
                            │
                     TRADE JOURNAL
                            │
                  LEARNING INTELLIGENCE
                            │
                            └──────→ KNOWLEDGE
```

Surrounding the entire platform:

- Security
- Observability
- Governance
- Model Management
- Data Infrastructure
- Testing
- Audit
- Deployment
- Disaster Recovery

---

## 16. Master Prompt and Supporting Documents

The Quantuam trade Master Prompt defines the platform's engineering constitution, architecture principles, trading philosophy, security standards, AI reasoning protocol, risk governance, and long-term engineering rules.

The following documents provide the detailed implementation specifications:

1. **Quantuam trade Architecture Bible**
   - Complete system architecture
   - Module boundaries
   - Service boundaries
   - Data flow
   - Infrastructure

2. **Quantuam trade Database Bible**
   - Schemas
   - Tables
   - Relationships
   - Constraints
   - Indexes
   - Migrations
   - Data retention

3. **Quantuam trade AI Engine Specification**
   - Every intelligence engine
   - Inputs
   - Outputs
   - Algorithms
   - Data requirements
   - APIs
   - Events
   - Testing

4. **Quantuam trade Backend Implementation Prompt**
   - Backend architecture
   - Service implementation
   - API implementation
   - Intelligence integration
   - Security
   - Testing
   - Acceptance criteria

5. **Quantuam trade Frontend Implementation Prompt**
   - UI architecture
   - Components
   - Dashboard
   - Trading terminal
   - Charts
   - State management
   - API integration

6. **Quantuam trade Module-by-Module Build Roadmap**
   - Correct implementation order
   - Dependencies
   - Milestones
   - Acceptance criteria
   - Definition of done

---

## 17. Planned Build Sequence

### Phase 0 — Stabilization

- Existing code audit
- Architecture cleanup
- Dependency cleanup
- Development standards
- Foundation setup

### Phase 1 — Backend Extraction

- Backend/API layer
- Application services
- Repositories
- Intelligence service boundaries

### Phase 2 — Market Intelligence

- Market data pipeline
- Multi-timeframe analysis
- Market regime detection
- Liquidity intelligence
- Structure intelligence

### Phase 3 — Decision Intelligence

- Evidence aggregation
- Confidence engine
- Explainability
- Master Decision Engine

### Phase 4 — Risk Intelligence

- Portfolio risk
- Exposure
- Correlation
- Position sizing
- Circuit breakers
- Stress testing

### Phase 5 — Knowledge Intelligence

- Knowledge graph
- Memory
- Historical similarity
- Strategy memory
- Pattern memory

### Phase 6 — Learning Intelligence

- Trade review
- Learning pipeline
- Performance analysis
- Controlled knowledge updates

### Phase 7 — Research Intelligence

- Experiment framework
- Backtesting
- Forward testing
- Model evaluation
- Strategy research

### Phase 8+ — Advanced Optimization

- Advanced machine learning
- Model governance
- Performance optimization
- Infrastructure scaling
- Advanced research capabilities

---

## 18. Current Project Status

The project is best classified as:

**Partially built AI Trading Intelligence Prototype**

It has a meaningful foundation but requires architectural transformation before it can meet the full Quantuam trade institutional vision.

The current project should be treated as the starting codebase.

### Strategic decision

**Do not throw it away.**

Instead:

```text
Existing Quantuam trade
        +
Master Prompt
        +
Architecture Bible
        +
Database Bible
        +
AI Engine Specification
        +
Implementation Roadmap
        ↓
Quantuam trade Institutional Platform
```

---

## 19. Quantuam trade Philosophy

Quantuam trade should operate according to these core principles:

1. Architecture before implementation.
2. Evidence before decisions.
3. Risk before reward.
4. Security before convenience.
5. Explainability before automation.
6. Quality before speed.
7. Simple systems before unnecessary complexity.
8. Every trade creates knowledge.
9. Every failure creates learning.
10. Every important line of code must serve a documented purpose.

---

## 20. Final Project Definition

> **Quantuam trade is an institutional-grade AI Trading Intelligence Platform that analyzes markets using multiple specialized intelligence engines, makes risk-aware autonomous paper-trading decisions, explains its reasoning, learns from validated evidence, and continuously improves through controlled research and knowledge accumulation.**

The ultimate goal is not simply to build an AI that predicts prices.

The goal is to build a **complete trading intelligence organization in software**: one that observes markets, reasons across multiple domains, challenges its own conclusions, protects capital, executes only in a controlled paper-trading environment, studies its results, preserves validated knowledge, and evolves through disciplined research.
