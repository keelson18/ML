# TRADING PLATFORM RE-AUDIT, RESTRUCTURE AND INSTRUMENT CORRECTION

## IMPORTANT

The strategy-library specification has already been provided separately.

**Do NOT repeat, recreate, or redesign the strategy list from that previous specification.**

This instruction is for the next stage:

> **Deeply re-audit the existing repository, understand what is already implemented, identify architectural problems, restructure the existing system around Trading Research + Decision Intelligence, and correct the market-instrument/data-source architecture.**

This is NOT a greenfield project.

Do not blindly rebuild existing systems.

Do not create duplicate engines.

Do not replace working functionality simply because a new architecture is being introduced.

First understand the existing implementation.

---

# 1. ACT AS A SENIOR TRADING-SYSTEMS RESEARCHER

Before modifying code, approach the repository as a researcher and systems auditor.

Analyze the project from these perspectives:

* Quantitative Trading Research
* Market Data Engineering
* Strategy Research
* Backtesting
* Market Intelligence
* Decision Intelligence
* AI/ML
* Risk Management
* Portfolio Intelligence
* Paper Trading
* Trade Analysis
* Software Architecture
* Security
* Data Integrity

Do not evaluate the project only as a normal web application.

The primary question is:

> "Does this system actually have the architecture and data integrity required to perform reliable trading research and produce explainable paper-trading decisions?"

---

# 2. FIRST: READ THE EXISTING PROJECT

Before making changes, inspect the actual repository.

Read and understand:

* Root README
* package.json
* TypeScript configuration
* Vite configuration
* frontend architecture
* backend architecture
* backend engines
* backend services
* market-data providers
* indicator system
* strategy system
* ML system
* research system
* backtesting system
* risk system
* portfolio system
* market-structure system
* liquidity system
* regime system
* confidence system
* contradiction system
* historical-similarity system
* knowledge system
* AI reasoning system
* paper-execution system
* trade-review system
* learning system
* Supabase functions
* database schema/migrations
* API endpoints
* authentication/authorization

Search the repository rather than relying only on filenames.

---

# 3. DO NOT BUILD A SECOND DECISION ENGINE

The repository already contains a Master Decision Engine.

Audit and improve the existing:

`backend/src/engines/decision-engine.ts`

Do NOT create another independent decision engine.

Determine exactly:

* What inputs it receives.
* Which engines it calls.
* Which evidence it uses.
* How strategies influence it.
* How ML influences it.
* How risk influences it.
* How portfolio state influences it.
* How historical similarity influences it.
* How contradictions influence it.
* How confidence influences it.
* How knowledge influences it.
* How AI reasoning influences its explanation.
* How the final decision is produced.
* How entry/invalidation/target information is produced.

Then identify:

* Correct functionality.
* Weak functionality.
* Hardcoded assumptions.
* Missing evidence.
* Duplicate logic.
* Poorly separated responsibilities.
* Research information that is not reaching the decision layer.

The goal is to evolve the existing engine into the canonical Decision Intelligence layer.

---

# 4. CONNECT TRADING RESEARCH TO DECISION INTELLIGENCE

One of the major architectural goals is:

```text
MARKET DATA
    ↓
DATA QUALITY
    ↓
MARKET INTELLIGENCE
    ↓
STRATEGY INTELLIGENCE
    ↓
TRADING RESEARCH
    ↓
DECISION INTELLIGENCE
    ↓
PAPER TRADING
    ↓
TRADE REVIEW
    ↓
LEARNING / RESEARCH
```

The existing project already contains many pieces of this architecture.

Determine which pieces are already connected and which are isolated.

In particular, verify whether the existing research engine actually contributes evidence to the Master Decision Engine.

If research currently exists separately from decision-making, create a clean integration rather than duplicating research functionality.

---

# 5. CRITICAL MARKET-INSTRUMENT CORRECTION

## THIS IS A HIGH-PRIORITY ISSUE

Audit every market-data provider, symbol mapper, instrument definition, strategy asset definition, chart symbol, database record, API request, websocket subscription, and backtesting dataset.

There is an important distinction between:

```text
BTCUSD
```

and:

```text
BTCUSDT
```

They are NOT the same instrument.

`BTCUSDT` means:

> Bitcoin quoted against USDT.

`BTCUSD` means:

> Bitcoin quoted against USD.

The same issue applies to the other crypto assets.

For example:

```text
BTCUSDT
ETHUSDT
```

must not silently be represented internally as:

```text
BTCUSD
ETHUSD
```

without an explicit conversion/normalization policy.

---

# 6. TARGET ASSET UNIVERSE

The intended research universe is:

```text
BTCUSD
ETHUSD
XAUUSD
XAGUSD
```

This must be reflected consistently across the system.

Do NOT silently replace the intended instruments with:

```text
BTCUSDT
ETHUSDT
```

simply because a particular crypto provider supplies USDT pairs.

If a provider only supplies USDT-quoted crypto markets, the system must explicitly identify that source instrument as:

```text
BTCUSDT
ETHUSDT
```

and must NOT label it as BTCUSD/ETHUSD.

---

# 7. CREATE A PROPER INSTRUMENT MODEL

Do not use raw strings throughout the application.

Create or refactor toward a canonical instrument definition containing concepts such as:

```text
Instrument
├── id
├── baseAsset
├── quoteAsset
├── assetClass
├── canonicalSymbol
├── sourceSymbol
├── provider
├── marketType
├── priceCurrency
├── tradingAvailability
└── dataSourceMetadata
```

Example:

```text
Canonical instrument:
BTCUSD

Base:
BTC

Quote:
USD

Asset class:
Crypto
```

If the source provider supplies:

```text
BTCUSDT
```

the system must explicitly represent:

```text
Canonical:
BTCUSD

Source:
BTCUSDT

Quote:
USDT
```

ONLY if the system has a documented and mathematically valid conversion/normalization method.

Otherwise, do not pretend BTCUSDT is BTCUSD.

---

# 8. DO NOT FABRICATE USD DATA FROM USDT DATA

Do not simply rename:

```text
BTCUSDT → BTCUSD
```

That is data corruption.

If conversion between USDT and USD is required, it must be explicit.

The system should determine whether the research requires:

### Option A

A true USD-quoted BTC/USD data source.

### Option B

USDT-quoted crypto research treated as a separate instrument:

```text
BTCUSDT
ETHUSDT
```

### Option C

A documented USDT/USD conversion layer.

The architecture must make this distinction visible.

Do not silently mix these approaches.

---

# 9. AUDIT ALL CRYPTO DATA PROVIDERS

Inspect every crypto provider.

For each provider determine:

* Provider name
* REST API
* WebSocket API
* Supported symbols
* Symbol format
* Quote currency
* Timeframes
* Historical depth
* Real-time capability
* Rate limits
* Data timestamp behavior
* Candle completeness
* Price precision
* Volume semantics
* Whether the data is actually USD or USDT quoted

Do the same for gold and silver.

The system must never claim that a provider supplies BTCUSD if it actually supplies BTCUSDT.

---

# 10. AUDIT SYMBOL NORMALIZATION

Search the entire repository for:

```text
BTC
BTCUSD
BTCUSDT
ETH
ETHUSD
ETHUSDT
XAUUSD
XAGUSD
USDT
USD
```

Find every place where symbols are:

* Hardcoded
* Transformed
* Stored
* Displayed
* Sent to APIs
* Sent to WebSockets
* Used in database queries
* Used in backtests
* Used in strategy logic
* Used in charts
* Used in research
* Used in paper execution

There must be one canonical instrument model.

---

# 11. PREVENT CROSS-INSTRUMENT CONTAMINATION

The system must never accidentally combine:

```text
BTCUSD
```

research with:

```text
BTCUSDT
```

research and label them as the same dataset.

Dataset metadata must identify:

* Canonical instrument
* Source instrument
* Provider
* Quote currency
* Timeframe
* Start timestamp
* End timestamp
* Data version

Backtests must preserve this information.

Research results must preserve this information.

Paper trades must preserve this information.

---

# 12. MARKET DATA MUST BECOME A TRUSTED FOUNDATION

The architecture should follow:

```text
External Data Provider
        ↓
Raw Market Data
        ↓
Normalization
        ↓
Validation
        ↓
Data Quality Engine
        ↓
Canonical Market Data
        ↓
Indicators / Features
        ↓
Market Intelligence
```

Strategies, ML, backtesting and Decision Intelligence should consume canonical validated data.

They should not independently fetch and interpret raw provider data.

---

# 13. RE-AUDIT THE EXISTING STRATEGY SYSTEM

The strategy specification was already supplied separately.

Do not duplicate that specification.

Instead:

1. Inspect every existing strategy.
2. Map existing strategies to the previously supplied strategy library.
3. Identify duplicates.
4. Identify partial implementations.
5. Identify missing strategies.
6. Identify strategies that use incorrect indicators.
7. Identify strategies with hardcoded parameters.
8. Identify strategies that are not backtest compatible.
9. Identify strategies that may leak future information.
10. Refactor them into the canonical strategy architecture.

Do not delete valid existing strategy logic unnecessarily.

---

# 14. BACKTESTING AUDIT

Determine whether the existing backtesting system can genuinely test strategies.

A proper research run must include:

```text
Strategy
+
Strategy Version
+
Instrument
+
Dataset
+
Timeframe
+
Date Range
+
Parameter Set
+
Risk Policy
+
Fee Model
+
Slippage Model
+
Execution Rules
```

The system must calculate real results from historical data.

Do not fabricate metrics.

---

# 15. RESEARCH MUST BE SEPARATE FROM PRESENTATION

The UI must not contain independent trading calculations that disagree with backend research.

Research calculations belong in the research/domain layer.

The frontend should visualize results.

---

# 16. MARKET INTELLIGENCE

Audit and unify the existing:

* Indicators
* Market Structure
* Liquidity
* Volume
* Momentum
* Volatility
* Patterns
* Regime
* Trend
* Data Quality

These should become structured evidence.

Example:

```text
Market Intelligence
├── Trend
├── Momentum
├── Structure
├── Liquidity
├── Volume
├── Volatility
├── Regime
├── Patterns
└── Data Quality
```

---

# 17. DECISION INTELLIGENCE

The existing Master Decision Engine should become the central decision layer.

It should consume structured evidence from:

```text
Market Intelligence
Strategy Intelligence
Trading Research
ML
Historical Similarity
Risk
Portfolio
Contradictions
Confidence
Knowledge
AI Reasoning
```

The engine should produce an explainable paper-trading decision.

The system must be able to answer:

> Why did the system reach this decision?

and:

> What evidence supported it?

and:

> What evidence contradicted it?

and:

> What would invalidate the thesis?

and:

> How has similar strategy behavior performed historically?

---

# 18. AI/ML ROLE

ML should support the decision system rather than replace deterministic trading logic.

Audit the current ML system.

Determine:

* What features are used.
* What models exist.
* How models are trained.
* How models are evaluated.
* Whether training/test leakage exists.
* Whether predictions are reproducible.
* Whether models are actually used by the decision engine.
* Whether model outputs are calibrated.
* Whether model outputs have sufficient historical validation.

Do not create fake ML predictions.

Do not label heuristics as machine learning.

---

# 19. RISK MUST BE AN EXPLICIT POLICY

Audit all risk logic.

Find hardcoded:

* Position sizing
* Stop loss
* Take profit
* Risk/reward
* Daily loss
* Drawdown
* Exposure
* Concentration
* Leverage
* Correlation
* Capital
* Fees
* Slippage

Convert appropriate assumptions into explicit versioned configuration/policies.

---

# 20. PAPER TRADING ONLY

The project remains:

**Paper / Simulation only.**

Do NOT implement real-money broker execution.

Do NOT add real trading buttons.

Do NOT add real-money order submission.

Paper execution must simulate realistic:

* Entry
* Exit
* Position sizing
* Fees
* Slippage
* Stop loss
* Take profit
* Partial fills where supported by the simulation model
* Portfolio accounting

---

# 21. TRADE REVIEW + LEARNING

After paper trades, the system should capture:

* Original thesis
* Decision
* Strategy
* Evidence
* Confidence
* Risk state
* Entry
* Exit
* Outcome
* Maximum favorable excursion
* Maximum adverse excursion
* Reason for exit
* Whether the thesis was correct
* Whether execution was poor
* Whether risk failed
* Whether the strategy was mismatched to regime
* Whether data quality contributed to the failure

This information should feed future research.

---

# 22. ARCHITECTURAL TARGET

The target system should evolve toward:

```text
                MARKET DATA
                     ↓
          DATA QUALITY + NORMALIZATION
                     ↓
             MARKET INTELLIGENCE
                     ↓
             STRATEGY INTELLIGENCE
                     ↓
              TRADING RESEARCH
                     ↓
              ML / AI EVIDENCE
                     ↓
          HISTORICAL SIMILARITY
                     ↓
              RISK INTELLIGENCE
                     ↓
          CONTRADICTION ANALYSIS
                     ↓
               CONFIDENCE
                     ↓
             MASTER DECISION
                     ↓
              EXPLAINABILITY
                     ↓
              PAPER TRADING
                     ↓
               TRADE REVIEW
                     ↓
             LEARNING / RESEARCH
                     ↺
```

This is an evolution of the existing architecture, not a completely separate application.

---

# 23. EXISTING CODE CLASSIFICATION

Before major modifications, classify existing components as:

### KEEP

Correct and reusable.

### REFACTOR

Useful but needs architectural improvement.

### REPLACE

Concept is useful but implementation is inadequate.

### REMOVE

Duplicate, obsolete, unsafe, misleading, or unnecessary.

### BUILD

Genuinely missing.

---

# 24. NO DUPLICATE SYSTEMS

Before creating any new:

* Decision Engine
* Research Engine
* Strategy Engine
* ML Engine
* Risk Engine
* Market Intelligence Engine
* Backtesting Engine

search the repository first.

If one already exists, improve it unless there is a documented architectural reason to replace it.

---

# 25. NO HARDCODED BUSINESS LOGIC

Do not bury:

* Instruments
* Provider symbols
* Strategy parameters
* Risk parameters
* Fees
* Slippage
* Timeframes
* Capital
* Thresholds

inside arbitrary functions.

Use strongly typed configuration and versioned policies where appropriate.

---

# 26. FINAL AUDIT REPORT

Before implementation, produce a structured audit covering:

## A. Existing Architecture

## B. Existing Decision Engine

## C. Existing Research Engine

## D. Existing Strategy System

## E. Existing ML System

## F. Existing Risk System

## G. Existing Market Intelligence

## H. Existing Data Providers

## I. BTCUSD/BTCUSDT and ETHUSD/ETHUSDT Instrument Audit

## J. Backtesting Audit

## K. Data Integrity Audit

## L. Security Audit

## M. Duplication Audit

## N. Hardcoded-Logic Audit

## O. KEEP / REFACTOR / REPLACE / REMOVE / BUILD

## P. Migration Plan

---

# 27. IMPLEMENTATION ORDER

Do NOT implement everything simultaneously.

Use this order:

### Phase 1

Repository audit.

### Phase 2

Instrument and market-data architecture correction.

### Phase 3

Canonical data normalization and validation.

### Phase 4

Existing architecture consolidation.

### Phase 5

Strategy-library integration using the previously supplied strategy specification.

### Phase 6

Research/backtesting improvements.

### Phase 7

Research → Decision Intelligence integration.

### Phase 8

Risk/configuration restructuring.

### Phase 9

Paper-trading integration.

### Phase 10

Trade review and learning integration.

### Phase 11

UI/UX improvements.

### Phase 12

Testing, security, performance and production hardening.

---

# 28. FINAL RULE

Do not tell me that a feature exists merely because a file with a similar name exists.

Verify the implementation.

Do not tell me a strategy is implemented merely because a strategy object exists.

Verify the actual trading logic.

Do not tell me BTCUSD is supported merely because the UI displays "BTCUSD".

Verify the actual provider symbol and quote currency.

Do not tell me backtesting works merely because a backtest page exists.

Verify the actual historical execution and metrics.

Do not tell me AI is working merely because an AI service exists.

Verify how its output enters the decision pipeline.

The repository must be treated as a real trading-research codebase.

**Inspect first. Verify second. Design third. Modify fourth.**
