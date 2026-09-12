# QUANTUM INTELLIGENCE — ARCHITECTURE TRANSFORMATION & IMPLEMENTATION DIRECTIVE

> **Role:** Lead Software Architect, Senior Full-Stack Engineer, Quantitative Systems Engineer, AI/ML Engineer, Data Engineer, Cybersecurity Engineer, DevOps Engineer, and Technical Product Architect.

## 1. Mission

Transform the existing Quantum Intelligence repository into a clean, production-grade quantitative AI market-intelligence and paper-trading research platform.

This is an **existing codebase**.

- Do not rebuild from scratch.
- Do not replace the existing technology stack with Python.
- Keep the existing TypeScript/JavaScript architecture unless repository inspection proves a specific existing technology must change.
- Do not add complexity merely to make the project appear advanced.
- Preserve useful functionality.
- Remove genuinely unnecessary functionality.
- Merge duplicated functionality.
- Rebuild weak architecture where justified.
- Add only architecturally justified capabilities.

The target is a **cleaner Quantum Intelligence, not a larger Quantum Intelligence**.

---

# 2. Audit Before Modification

Before writing or deleting code, inspect the entire repository.

Understand:

- frontend architecture
- backend architecture, if present
- authentication
- authorization
- database
- API layer
- AI layer
- AI models
- model training
- inference
- indicators
- market data
- Master Decision
- backtesting
- paper trading
- prediction
- explanations
- dashboards
- admin functionality
- roles
- state management
- services
- utilities
- workers
- scheduled jobs
- dependencies
- environment configuration
- security
- tests
- build configuration
- deployment configuration

Trace the real data flow.

The target conceptual flow is:

```text
Market Data
    ↓
Data Processing / Validation
    ↓
Indicators / Features
    ↓
AI Models
    ↓
Signals
    ↓
Master Decision
    ↓
Risk
    ↓
Paper Trading
    ↓
Positions / Trades
    ↓
Analytics
```

Determine how the current repository actually differs from this.

Do not delete modules until their dependencies and current behavior are understood.

---

# 3. Module Classification

Classify every meaningful existing module as exactly one of:

- KEEP
- KEEP + IMPROVE
- MERGE
- REBUILD
- REPLACE
- DELETE
- NEW

For each classification document:

- current purpose
- dependencies
- reason for classification
- replacement, if applicable
- database impact
- API impact
- UI impact
- risk of removal

Do not delete something simply because it is imperfect.

---

# 4. Product Identity

Quantum Intelligence is a:

> **Quantitative AI market-intelligence and paper-trading research platform.**

It is not merely:

- an indicator dashboard
- a prediction website
- a backtesting website
- an AI chatbot
- a collection of unrelated models

It combines:

```text
Market Data
+
Mathematical / Statistical Analysis
+
Indicators
+
Market Structure
+
Market Regime
+
AI Models
+
Signal Analysis
+
Risk Analysis
+
Master Decision
+
Paper Trading
+
Research
```

into one coherent system.

---

# 5. Initial Market Universe

The initial supported markets are strictly:

```text
BTCUSD
ETHUSD
XAUUSD
XAGUSD
EURUSD
```

Do not expand the market universe unless explicitly instructed.

The architecture must remain extensible.

Do not create separate software engines for each market.

Do not create:

```text
BTCEngine
ETHEngine
GoldEngine
SilverEngine
EURUSDEngine
```

Instead use shared engines with asset-specific configuration.

Create an Asset Registry concept:

```text
Asset Registry
    ↓
BTCUSD
ETHUSD
XAUUSD
XAGUSD
EURUSD
```

Each asset should be able to define:

- symbol
- asset class
- market type
- data provider
- supported timeframes
- session information where applicable
- precision
- minimum price increment where applicable
- data schema
- feature configuration
- model configuration
- risk configuration

---

# 6. Per-Asset Data Isolation

The engines are shared, but datasets must remain logically separated.

Conceptually:

```text
data/
├── BTCUSD/
│   ├── raw/
│   ├── validated/
│   ├── processed/
│   ├── features/
│   ├── metadata/
│   └── experiments/
├── ETHUSD/
│   ├── raw/
│   ├── validated/
│   ├── processed/
│   ├── features/
│   ├── metadata/
│   └── experiments/
├── XAUUSD/
│   ├── raw/
│   ├── validated/
│   ├── processed/
│   ├── features/
│   ├── metadata/
│   └── experiments/
├── XAGUSD/
│   ├── raw/
│   ├── validated/
│   ├── processed/
│   ├── features/
│   ├── metadata/
│   └── experiments/
└── EURUSD/
    ├── raw/
    ├── validated/
    ├── processed/
    ├── features/
    ├── metadata/
    └── experiments/
```

This is a logical organization.

Do not duplicate software engines merely because assets have separate data.

---

# 7. Raw Market Data Architecture

The user will personally provide the initial historical datasets.

Therefore:

- Do not fabricate historical market data.
- Do not fill missing data with random/fake values.
- Do not use mock market data as if it were real.
- Support user-provided historical datasets.

Build:

```text
Raw Dataset
    ↓
Schema Detection
    ↓
Schema Validation
    ↓
Timestamp Validation
    ↓
Duplicate Detection
    ↓
Missing Data Detection
    ↓
Price Integrity Checks
    ↓
Outlier Detection
    ↓
Normalization
    ↓
Dataset Version
    ↓
Dataset Fingerprint
    ↓
Validated Dataset
```

Record at minimum:

```text
asset
source
provider
timeframe
symbol
date range
timezone
timestamp convention
row count
column schema
ingestion timestamp
dataset version
schema version
quality status
validation results
fingerprint/hash
```

Raw data must remain immutable.

Never silently modify the original raw dataset.

---

# 8. Data Source Architecture

Every asset must have explicit source configuration.

Conceptually:

```text
Data Source Registry
        │
        ├── BTCUSD → Provider
        ├── ETHUSD → Provider
        ├── XAUUSD → Provider
        ├── XAGUSD → Provider
        └── EURUSD → Provider
```

Do not hardcode providers into business logic.

Use a provider abstraction such as:

```text
MarketDataProvider
```

with provider-specific implementations.

The system must know:

```text
which provider
→ provides which asset
→ at which timeframe
→ using which schema
```

Do not assume one provider supplies every asset.

---

# 9. Historical and Live Data Separation

Historical research and live market data are different pipelines.

Use:

```text
Historical Data Pipeline
```

and:

```text
Live Market Data Pipeline
```

They may share canonical schemas but must not be mixed carelessly.

Historical:

```text
Historical Provider
        ↓
Historical Ingestion
        ↓
Research Dataset
```

Live:

```text
Live Provider
        ↓
Live Ingestion
        ↓
Real-Time Market State
        ↓
AI Inference
```

---

# 10. Timeframe Architecture

Support multi-timeframe analysis.

Do not create isolated intelligence systems for every timeframe.

Use a hierarchy:

```text
Higher Timeframe
       ↓
Market Context
       ↓
Intermediate Timeframe
       ↓
Structure / Setup
       ↓
Lower Timeframe
       ↓
Entry Context
```

Create timestamp-safe timeframe alignment.

For historical analysis:

> At time T, a timeframe may only use information that was actually available at or before T.

Never allow future higher-timeframe candle information to leak into lower-timeframe predictions.

---

# 11. Data Leakage Prevention

This is mandatory.

Prevent:

- look-ahead bias
- future candle leakage
- future indicator values
- future normalization
- future scaling information
- future labels entering features
- test-set contamination
- training on future data
- shuffled time-series leakage

The fundamental rule is:

```text
At time T
→ only information available at or before T
```

This applies to:

- features
- indicators
- AI training
- AI inference
- backtesting
- validation
- evaluation

---

# 12. Indicator Architecture

Keep the existing indicator system.

**Do not remove all indicators.**

At this stage, remove only:

```text
Bollinger / Bollinger Bands Engine
```

Trace all dependencies before removal.

Remove:

- Bollinger calculation code
- Bollinger-specific signal logic
- Bollinger UI
- Bollinger configuration
- Bollinger tests
- unused imports
- unused dependencies
- any code existing solely for Bollinger

Do not remove unrelated indicators.

Existing indicators may include things such as:

```text
RSI
MACD
Moving Averages
ATR
ADX
Stochastic
```

but only treat an indicator as present after repository inspection.

---

# 13. Indicators Are Evidence, Not Final Decisions

Indicators must not independently execute trades.

Bad:

```text
RSI < threshold
    ↓
BUY
```

Target:

```text
RSI
MACD
ATR
Market Structure
Market Regime
AI Models
Liquidity
Volatility
       ↓
Signal Evidence
       ↓
Master Decision
```

Indicators provide evidence.

The Master Decision remains authoritative.

---

# 14. AI Model Architecture

Do not remove existing AI models simply because the project should be smaller.

Multiple AI models are intentional.

First inspect every existing model.

For every model document:

```text
Model Name
Purpose
Inputs
Features
Output
Training Method
Inference Method
Training Dataset
Validation Method
Version
Dependencies
Current Status
```

Do not make every model independently pretend to be the final trader.

Where appropriate, models may have specialized responsibilities such as:

```text
Directional Model
Regime Model
Setup Model
Timing Model
Risk / Outcome Model
```

These are conceptual responsibilities.

Do not create new models just because these categories exist.

Reuse existing models where possible.

---

# 15. Model Ensemble

Support multiple models contributing evidence.

Conceptually:

```text
              Market State
                   ↓
        ┌──────────┼──────────┐
        ↓          ↓          ↓
     Model A    Model B    Model C
        ↓          ↓          ↓
        └──────────┼──────────┘
                   ↓
              Model Fusion
                   ↓
            Master Decision
```

Preserve model identity.

The system should be able to explain, where applicable:

```text
Model A → bullish
Model B → bullish
Model C → neutral
Agreement → 2/3
```

Do not hide all model outputs behind an unexplained number.

---

# 16. Master Decision Engine

Keep the Master Decision system.

It becomes the single authoritative decision aggregation layer.

Potential inputs:

```text
AI model outputs
Indicator signals
Market structure
Market regime
Volatility
Liquidity
Momentum
Multi-timeframe context
Risk analysis
```

Conceptually:

```text
AI Models
     │
Indicators
     │
Structure
     │
Regime
     │
Liquidity
     │
Volatility
     │
Multi-Timeframe Context
     │
     ▼
MASTER DECISION ENGINE
     │
     ├── BUY
     ├── SELL
     └── WAIT
```

Structured output should include where supported:

```text
decision
confidence
supporting evidence
model agreement
market state
risk state
entry context
exit context
reasoning
timestamp
asset
timeframe
```

No model should bypass Master Decision.

No indicator should bypass Master Decision.

---

# 17. Keep Master Decision Focused

Master Decision is an aggregator, not a giant god module.

Do not place inside it:

- raw market-data ingestion
- indicator calculation
- model training
- feature engineering
- backtesting
- database management
- provider API code
- complete risk implementation

Target:

```text
Data Engine
     ↓
Feature Engine
     ↓
Indicator Engine
     ↓
AI Engine
     ↓
Market State Engine
     ↓
Risk Engine
     ↓
Master Decision
```

Master Decision consumes specialized outputs.

---

# 18. Market State Engine

Create or refactor toward a Market State Engine.

It describes the market environment.

Potential dimensions:

```text
Trend
Range
Volatility
Momentum
Market Regime
Structure
Liquidity
Session
Multi-Timeframe Context
```

Example:

```text
BTCUSD

Trend: Bullish
Regime: Trending
Volatility: Elevated
Structure: Bullish
Momentum: Positive
Liquidity State: Normal
```

The Market State Engine provides context to AI and Master Decision.

Do not create unnecessary micro-services for every state dimension.

Keep related calculations together where appropriate.

---

# 19. Research Engine

Create a dedicated research architecture.

Research must not be mixed into normal user functionality.

Support:

```text
Hypothesis
    ↓
Dataset
    ↓
Feature Configuration
    ↓
Experiment
    ↓
Backtest
    ↓
Validation
    ↓
Evaluation
    ↓
Conclusion
```

Every experiment must be reproducible.

Record:

```text
dataset version
feature version
model version
parameters
asset
timeframe
training period
validation period
test period
metrics
results
conclusion
```

---

# 20. Backtesting Architecture

Backtesting is a research capability, not a normal user feature.

Do NOT delete the backtesting engine merely because its current UI exposure is being changed.

Move its architecture toward:

```text
Historical Dataset
        ↓
Research Configuration
        ↓
Backtest Engine
        ↓
Validation
        ↓
Performance Metrics
        ↓
Research Result
```

The backtest engine belongs in the backend/research infrastructure.

---

# 21. Backtesting UI and Roles

The current backtesting interface must NOT remain a normal dashboard feature.

Backtesting should be accessible only to authorized roles.

Use the project's existing role system.

Do not invent new roles unless repository inspection proves one is necessary.

At minimum:

```text
Normal User
    → No research/backtesting access

Privileged roles
    → Only explicitly permitted research capabilities

Super Admin
    → Full research/backtesting access
```

Backtesting must be protected by backend authorization.

Do not rely only on hiding navigation.

An unauthorized user must not be able to call privileged endpoints directly.

Conceptually:

```text
Frontend hides Backtesting
        +
Backend rejects unauthorized request
```

Both are mandatory.

Privileged research capabilities include, where applicable:

```text
Dataset Management
Experiment Management
Backtesting
Model Training
Model Evaluation
Model Registry
Model Promotion
```

---

# 22. Research Console

Convert the existing backtesting UI into a privileged research/admin interface where appropriate.

Conceptually:

```text
Super Admin
    ↓
Research Console
    ├── Datasets
    ├── Experiments
    ├── Backtesting
    ├── Validation
    ├── Models
    └── Model Promotion
```

Potential backtesting controls:

```text
Dataset
Asset
Timeframe
Date Range
Research Configuration
Model Version
Feature Version
Transaction Costs
Slippage
Validation Method
Run Experiment
Results
Metrics
Equity Curve
Drawdown
Trade Statistics
```

Do not expose these controls to ordinary users.

---

# 23. Backtesting Must Be Real

Backtests must use actual historical datasets.

Do not fabricate results.

Where supported, account for:

```text
spread
fees
slippage
execution assumptions
position sizing
risk limits
```

Do not use unrealistic fills to make results look better.

Do not allow future information into a historical backtest.

---

# 24. Validation Architecture

Do not evaluate models only using training accuracy.

Support:

```text
Training
    ↓
Validation
    ↓
Out-of-Sample Test
    ↓
Walk-Forward Evaluation
```

Where justified, support:

- chronological splits
- walk-forward testing
- statistical validation
- bootstrap analysis
- feature stability
- model stability
- drawdown analysis
- risk-adjusted performance

Do not add advanced validation merely as decoration.

Every method must have a purpose and correct implementation.

---

# 25. Model Registry

Create or refactor toward a model registry.

Every model version should identify:

```text
model ID
version
asset
timeframe
dataset version
feature version
training configuration
validation results
performance metrics
status
created timestamp
```

Possible statuses:

```text
EXPERIMENTAL
VALIDATED
PAPER_CANDIDATE
ACTIVE
RETIRED
REJECTED
```

Training completion must not automatically make a model active.

---

# 26. Model Promotion

Use:

```text
Experimental
      ↓
Validation
      ↓
Out-of-Sample Evaluation
      ↓
Research Review
      ↓
Paper Candidate
      ↓
Paper Trading
```

A model may be rejected at any stage.

Do not force weak models into paper trading.

---

# 27. Paper Trading

Quantum Intelligence remains **paper-trading only**.

No real-money execution.

Target:

```text
Master Decision
      ↓
Risk Engine
      ↓
Paper Execution
      ↓
Order
      ↓
Position
      ↓
Trade
      ↓
Performance
```

Every paper trade must be traceable to its decision.

---

# 28. Risk Engine

Keep risk separate from prediction.

AI may say:

```text
BUY
```

Risk determines whether the trade is acceptable.

```text
AI Decision
     ↓
Risk Assessment
     ↓
Allowed?
   /     \
 YES      NO
  ↓        ↓
Paper    WAIT
Trade
```

Potential risk inputs:

```text
position size
risk per trade
drawdown
exposure
correlation
volatility
stop distance
portfolio exposure
```

Do not hardcode arbitrary risk values.

Use configuration.

---

# 29. Frontend Architecture

The frontend is the product interface.

It is not the authoritative source of:

- trading decisions
- model results
- backtest results
- market prices
- risk calculations

Backend/API services provide authoritative results.

Target:

```text
Frontend
   ↓
API
   ↓
Authoritative Backend Services
```

not:

```text
Frontend
   ↓
Invent calculation
   ↓
Display result
```

---

# 30. Existing UI Audit

Inspect existing components such as:

```text
Dashboard
AI Training Panel
Backtest Panel
Explanation Panel
Institutional Panel
Master Decision Panel
Model Metrics
Prediction Display
Price Chart
```

Do not automatically delete them.

Classify each:

```text
KEEP
KEEP + IMPROVE
MOVE TO PRIVILEGED UI
MERGE
REBUILD
DELETE
```

Specific decisions:

- Backtesting → privileged research/admin area
- Master Decision → keep
- Model Metrics → keep where useful
- Prediction Display → keep where useful
- Price Chart → keep
- Explanation → keep if backed by real evidence
- Duplicate/placeholder panels → merge or delete

---

# 31. Explanation System

Keep the explanation capability.

Explanations must be based on actual evidence.

Example:

```text
Decision: BUY

Supporting evidence:
- Model A: bullish
- Model B: bullish
- RSI: supportive
- MACD: supportive
- Market Structure: bullish
- Regime: trending
- Risk: acceptable
```

Do not generate explanations claiming that the system used information it did not use.

No fake reasoning.

---

# 32. Remove Duplication

Identify duplicated responsibilities.

For example, if several modules perform decision aggregation:

```text
Signal Engine
Decision Engine
Master Decision
Prediction Aggregator
```

determine the correct hierarchy.

Target:

```text
Models
 ↓
Signal Aggregation
 ↓
Master Decision
```

There must not be several competing authoritative decision systems.

If two services calculate the same market state, merge them unless there is a strong architectural reason to keep both.

---

# 33. Do Not Create Unnecessary AI Agents

Do not create an AI agent for every subsystem.

Avoid unnecessary architecture such as:

```text
AI Data Agent
AI Indicator Agent
AI Strategy Agent
AI Risk Agent
AI Decision Agent
AI Research Agent
AI Training Agent
```

unless there is a genuine autonomous-agent requirement.

Use deterministic services for deterministic tasks.

Use AI where AI adds actual value.

---

# 34. Do Not Create Unnecessary Models

Do not add many models simply to make the system look advanced.

Before adding a model ask:

```text
Does it provide unique predictive information?
Does it outperform a simpler baseline?
Does it improve ensemble performance?
Is it stable?
Can it be validated?
```

If not, do not keep or add it merely because it sounds sophisticated.

---

# 35. Research Discipline

The research lifecycle should be:

```text
Hypothesis
    ↓
Data
    ↓
Features
    ↓
Experiment
    ↓
Backtest
    ↓
Validation
    ↓
Out-of-Sample Test
    ↓
Conclusion
```

Never:

```text
Model looks profitable
      ↓
Immediately trust it
```

---

# 36. Data and Feature Versioning

A model must always be traceable to what produced it.

Example:

```text
Dataset: BTCUSD-M5-v3
Features: FeatureSet-v7
Model: BTC-Directional-v4
Experiment: EXP-00281
```

This must be represented in the model/research metadata.

---

# 37. Security

Never:

- hardcode API keys
- commit secrets
- expose secrets to frontend
- log credentials
- trust frontend role claims
- trust frontend backtest authorization
- allow arbitrary model execution from user input
- allow arbitrary dataset paths
- execute untrusted code through research interfaces

Validate API inputs.

Enforce backend authorization.

---

# 38. Performance and Project Size

The project must remain maintainable.

Before creating a new module, ask:

```text
Can an existing service handle this?
Can this be a function?
Can this be configuration?
Can these modules be merged?
```

Prefer fewer strong modules over many weak modules.

Do not create abstractions simply because they sound professional.

---

# 39. Target Backend Architecture

Use the existing project's technology stack.

Conceptually organize backend responsibilities as:

```text
Market Data Layer
        ↓
Data Validation
        ↓
Feature / Indicator Layer
        ↓
Market State Layer
        ↓
AI Model Layer
        ↓
Signal Aggregation
        ↓
Master Decision
        ↓
Risk Engine
        ↓
Paper Trading
        ↓
Positions / Trades
        ↓
Performance / Monitoring
```

Separately:

```text
Research Layer
        ↓
Datasets
        ↓
Experiments
        ↓
Backtesting
        ↓
Validation
        ↓
Model Registry
        ↓
Model Promotion
```

These layers interact through explicit interfaces.

---

# 40. Target Overall Architecture

```text
                         QUANTUM INTELLIGENCE
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
   MARKET DATA               RESEARCH                  RUNTIME
        │                         │                         │
        │                    DATASETS                      │
        │                    EXPERIMENTS                   │
        │                    BACKTESTING                   │
        │                    VALIDATION                    │
        │                    MODELS                        │
        │                         │                        │
        ▼                         ▼                        ▼
 DATA VALIDATION          MODEL REGISTRY            MARKET STATE
        │                         │                        │
        ▼                         │                        ▼
 FEATURES ────────────────────────────────► AI MODELS
        │                                  │
        ▼                                  ▼
 INDICATORS                         MODEL SIGNALS
        │                                  │
        └──────────────┬───────────────────┘
                       ▼
                SIGNAL AGGREGATION
                       │
                       ▼
                MASTER DECISION
                       │
                       ▼
                  RISK ENGINE
                       │
                       ▼
                PAPER EXECUTION
                       │
                       ▼
               POSITIONS / TRADES
                       │
                       ▼
                PERFORMANCE
                       │
                       ▼
                 MONITORING
```

---

# 41. Target Frontend Architecture

```text
                    FRONTEND
                       │
          ┌────────────┼────────────┐
          │            │            │
       Trading      Analytics    Administration
          │            │            │
          │            │       Super Admin
          │            │            │
          │            │       Research
          │            │       Backtesting
          │            │       Datasets
          │            │       Experiments
          │            │       Models
          │            │       Validation
          │
          └────────────┼────────────┘
                       │
                      API
                       │
              Backend Services
```

Normal users should not see research internals.

Super Admin should have the complete research environment.

---

# 42. What Must Be Deleted Now

After dependency analysis:

```text
Bollinger / Bollinger Bands Engine
```

and code that exists solely to support it.

Also remove:

```text
unused code
dead code
duplicate implementations
broken modules
fake/mock intelligence
obsolete dependencies
unused imports
unused configuration
```

Only remove these after confirming they are not required.

---

# 43. What Must NOT Be Deleted Merely Because of the Refactor

Do not remove merely because the architecture is changing:

```text
Existing AI Models
Existing Indicators except Bollinger
Master Decision
Backtesting Engine
Prediction System
Model Metrics
Price Chart
Explanation System
Useful Dashboard Components
Paper Trading
Authentication
Role System
```

These must be audited and improved where necessary.

---

# 44. Implementation Order

Do not implement everything simultaneously.

Use:

```text
PHASE 1
Repository Audit
        ↓
PHASE 2
Architecture Classification
        ↓
PHASE 3
Bollinger Removal
        ↓
PHASE 4
Data Architecture
        ↓
PHASE 5
Indicator + Feature Architecture
        ↓
PHASE 6
AI Model Architecture
        ↓
PHASE 7
Master Decision Integration
        ↓
PHASE 8
Research Architecture
        ↓
PHASE 9
Backtesting + Validation
        ↓
PHASE 10
Role-Based Research Access
        ↓
PHASE 11
Paper Trading Integration
        ↓
PHASE 12
Frontend Cleanup
        ↓
PHASE 13
Testing + Security Audit
```

Do not jump directly to later phases before the earlier architecture is understood.

---

# 45. Required Output Before Coding

Before modifying the repository, produce a detailed report containing:

## A. Current Architecture

Show the actual architecture discovered.

## B. Current Data Flow

Show how data currently moves through:

```text
Data
→ Features
→ Indicators
→ Models
→ Signals
→ Master Decision
→ Risk
→ Paper Trading
```

## C. Target Architecture

Show the proposed architecture.

## D. File-by-File Classification

```text
KEEP
KEEP + IMPROVE
MERGE
REBUILD
REPLACE
DELETE
NEW
```

## E. AI Model Inventory

For every existing model:

```text
Name
Location
Purpose
Input
Output
Training
Inference
Dependencies
Problems
Recommendation
```

## F. Indicator Inventory

List every existing indicator and its implementation.

Explicitly identify:

```text
Bollinger Engine
```

and everything dependent on it.

## G. Master Decision Audit

Show exactly how signals currently reach Master Decision.

Identify any components bypassing it.

## H. Backtesting Audit

Show:

```text
current location
implementation
data source
execution logic
metrics
security
UI exposure
role exposure
```

## I. Role Audit

Identify existing roles and their current access.

## J. Database Audit

Identify current tables/models/schema.

## K. API Audit

Identify existing endpoints and responsibilities.

## L. Dependency Audit

Identify dependencies that can be removed after refactoring.

## M. Migration Plan

Provide the safest implementation order.

---

# 46. Absolute Development Rules

Do not make Quantum Intelligence bigger merely for the sake of appearing advanced.

Target:

```text
FEWER
but
STRONGER
MODULES
```

Every module must have a clear responsibility.

Every service must have a clear owner.

Every AI model must have a purpose.

Every indicator must provide analytical value.

Every experiment must be reproducible.

Every decision must be traceable.

Every privileged operation must be authorized server-side.

Every market dataset must have provenance.

Every model must be versioned.

Every backtest must use valid historical data.

Every paper trade must be traceable to the decision that created it.

---

# 47. Final Target Flow

```text
                    QUANTUM INTELLIGENCE
                             │
                     MARKET DATA LAYER
                             │
                 ┌───────────┴───────────┐
                 │                       │
             HISTORICAL                LIVE
                 │                       │
                 └───────────┬───────────┘
                             │
                       DATA VALIDATION
                             │
                       FEATURE ENGINE
                             │
                ┌────────────┼────────────┐
                │            │            │
           INDICATORS    STRUCTURE     MARKET STATE
                │            │            │
                └────────────┼────────────┘
                             │
                         AI MODELS
                             │
                      SIGNAL AGGREGATION
                             │
                      MASTER DECISION
                             │
                       RISK ENGINE
                             │
                      PAPER TRADING
                             │
                    POSITIONS / TRADES
                             │
                       PERFORMANCE
                             │
                         FEEDBACK
```

Separate privileged research environment:

```text
                  RESEARCH / SUPER ADMIN
                           │
             ┌─────────────┼─────────────┐
             │             │             │
          DATASETS     EXPERIMENTS    BACKTESTING
             │             │             │
             └─────────────┼─────────────┘
                           │
                       VALIDATION
                           │
                      MODEL REGISTRY
                           │
                    MODEL PROMOTION
```

These worlds must be connected but must not be mixed together in the normal user interface.

---

# 48. Final Instruction to the Coding AI

Do not rush into implementation.

First inspect the repository and produce the complete audit and migration plan described above.

Do not delete or rewrite major systems before understanding their dependencies and current behavior.

After the audit, implement changes incrementally in the defined order.

After every significant architectural change:

- run tests
- run type checking
- run linting
- run build
- verify imports
- verify API contracts
- verify authorization
- verify database consistency

Do not leave:

- broken imports
- dead routes
- unused dependencies
- orphaned database structures
- inaccessible required UI
- inconsistent API contracts
- fake implementations
- fake market data
- fake AI results

If a capability does not yet exist, explicitly mark it as `NEW` rather than pretending it already works.

The final result must be a **cleaner Quantum Intelligence, not a larger Quantum Intelligence**.

Preserve what is valuable.

Remove what is genuinely unnecessary.

Merge what is duplicated.

Rebuild what is weak.

Add only what is architecturally justified.

**The project must remain TypeScript/JavaScript-based.**

**Bollinger is the only indicator engine explicitly scheduled for removal at this stage.**

**Existing AI models remain unless the audit proves a specific model is redundant, broken, unused, or harmful.**

**Master Decision remains a core component.**

**Backtesting remains a core research capability but must be moved behind role-based authorization and removed from ordinary user-facing navigation.**

**Super Admin owns the full research/backtesting environment.**

**The five initial assets are BTCUSD, ETHUSD, XAUUSD, XAGUSD and EURUSD.**

**The project remains paper-trading only.**

**Do not add unnecessary complexity.**

Build around:

**traceability, reproducibility, modularity, security, research discipline, maintainability, and measurable evidence.**
"""

