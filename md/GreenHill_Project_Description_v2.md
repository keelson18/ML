# Quantum --- Complete Project Description

## 1. Project Overview

**Quantum** is an AI-assisted trading intelligence and paper-trading
platform designed to analyze financial markets, combine multiple forms
of technical and quantitative evidence, generate explainable trade
decisions, test strategies against historical data, manage paper
positions, monitor portfolio risk, and provide research/learning tools.

The uploaded project is primarily a **React + TypeScript + Vite frontend
application** with a **Supabase backend/data layer and Supabase Edge
Functions**. It also contains an **in-browser TensorFlow.js
machine-learning system** and a large collection of modular
trading-analysis engines.

> **Important implementation note:** The current codebase is not a
> Python/FastAPI application. Its ML service is implemented as a
> Supabase/Deno TypeScript Edge Function, while additional ML
> training/inference code runs through TensorFlow.js in the application.

------------------------------------------------------------------------

# 2. Technology Stack

## Frontend

-   React 18
-   TypeScript 5.5
-   Vite 5
-   React Router DOM 6
-   Tailwind CSS 3
-   PostCSS
-   Autoprefixer
-   Lucide React for icons
-   Lightweight Charts for financial charts

## State Management

-   Zustand
-   React Context API

Contexts currently include:

-   Authentication context
-   Theme context
-   Sidebar context

Zustand stores include:

-   Settings store
-   Alert store

## Data Fetching

-   TanStack React Query

The application configures React Query with:

-   30-second stale time
-   One retry
-   No automatic refetch on window focus

## Backend / Cloud

-   Supabase
-   Supabase Auth
-   Supabase PostgreSQL
-   Supabase Edge Functions
-   Deno/TypeScript runtime for Edge Functions

## Machine Learning

Two ML layers exist:

### Client-side ML

-   TensorFlow.js
-   Dense neural networks
-   LSTM networks
-   Transformer-inspired architecture
-   Model training
-   Model inference
-   Model storage

### Edge ML Service

-   Supabase Edge Functions
-   Deno
-   TypeScript
-   Feature engineering
-   Logistic-regression ensemble
-   Model prediction
-   Model status
-   Model retraining endpoint

## Trading / Quantitative Analysis

The project contains custom TypeScript engines for:

-   Technical indicators
-   Market structure
-   Smart Money Concepts
-   Liquidity
-   Candlestick patterns
-   Market regime
-   Strategy evaluation
-   Historical similarity
-   Machine learning
-   AI reasoning
-   Risk
-   Portfolio
-   Research
-   Knowledge
-   Learning
-   Explainability
-   Data quality
-   Trade review

## Testing / Build Tooling

-   ESLint
-   TypeScript compiler
-   Vite build system
-   npm

------------------------------------------------------------------------

# 3. High-Level Architecture

``` text
                         ┌─────────────────────────┐
                         │        Quantum        │
                         │   Trading Intelligence  │
                         └────────────┬────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
             ┌──────▼──────┐                    ┌──────▼──────┐
             │   Frontend  │                    │   Supabase  │
             │ React/TS    │                    │   Backend   │
             │ Vite        │                    │ PostgreSQL  │
             └──────┬──────┘                    │ Auth        │
                    │                           │ Edge Funcs  │
                    │                           └──────┬──────┘
                    │                                  │
          ┌─────────┼──────────┐              ┌───────┼────────┐
          │         │          │              │       │        │
     ┌────▼───┐ ┌───▼────┐ ┌──▼──────┐   ┌───▼───┐ ┌─▼─────┐ ┌▼────────┐
     │ Market │ │ Trading│ │   AI    │   │ ML    │ │ News  │ │ Coach   │
     │ Data   │ │ Engine │ │ Engine  │   │ Edge  │ │ Edge  │ │ Edge    │
     └────────┘ └────────┘ └─────────┘   └───────┘ └───────┘ └─────────┘
```

------------------------------------------------------------------------

# 4. Application Structure

The project is organized into several major layers.

``` text
src/
├── ai/
├── components/
├── context/
├── engines/
├── hooks/
├── lib/
├── pages/
├── store/
├── App.tsx
├── main.tsx
└── index.css

supabase/
└── functions/
    ├── ml-predict/
    ├── news-feed/
    └── kinetic-coach/
```

------------------------------------------------------------------------

# 5. Main Application Pages

The application contains the following major pages.

## Dashboard

The central trading intelligence dashboard.

Responsibilities include:

-   Market overview
-   Current trading intelligence
-   AI decisions
-   Portfolio information
-   Alerts
-   Market context
-   Trading metrics

## Terminal

Trading terminal interface.

Expected responsibilities include:

-   Market chart
-   Price information
-   Trading analysis
-   Paper trading interaction
-   Position information

## AI Center

Central AI/ML workspace.

Features include:

-   AI predictions
-   Model information
-   Training controls
-   Model metrics
-   AI reasoning
-   Decision explanations

## Scanner

Market scanning interface.

Used for:

-   Finding trading opportunities
-   Scanning supported symbols
-   Detecting technical conditions
-   Ranking potential setups

## Patterns

Pattern-analysis workspace.

Handles:

-   Candlestick patterns
-   Chart patterns
-   Pattern detection
-   Pattern evidence

## Backtesting

Strategy validation environment.

Includes support for:

-   Historical backtesting
-   Walk-forward analysis
-   Monte Carlo simulation
-   Profit factor
-   Win rate
-   Sharpe ratio
-   Sortino ratio
-   Drawdown
-   Expectancy
-   Equity curves

## Portfolio

Portfolio management interface.

Includes:

-   Paper portfolio
-   Positions
-   P&L
-   Allocation
-   Portfolio analytics

## Risk

Risk management workspace.

Handles:

-   Position risk
-   Stop-loss logic
-   Take-profit logic
-   Risk scoring
-   Portfolio constraints
-   Exposure

## News

Market-news interface.

The backend Edge Function provides news records and sentiment
classification.

## Learning

Educational/training area.

Designed to help users understand:

-   Trading concepts
-   Market behavior
-   Strategies
-   Patterns
-   AI-generated learning content

## Research

Research workspace.

Supports:

-   Market research
-   Analytical evidence
-   Knowledge discovery
-   Research outputs

## Journal

Trading journal.

Designed for recording and reviewing:

-   Trades
-   Decisions
-   Reasoning
-   Outcomes
-   Reviews

## Watchlist

Market watchlist.

Used to track selected:

-   Symbols
-   Markets
-   Trading opportunities

## Settings

Application configuration.

Includes user/application preferences and settings.

------------------------------------------------------------------------

# 6. Authentication System

Authentication is implemented with **Supabase Auth**.

The authentication context manages:

-   Current session
-   Current user
-   Loading state
-   User role
-   Sign up
-   Sign in
-   Sign out

## Registration

The registration flow accepts:

-   Email
-   Password
-   First name
-   Last name
-   Phone

After account creation, the application stores profile information in
the database and assigns a user role.

## Roles

The code supports a `UserRole` concept and retrieves the role from:

``` text
user_roles
```

The registration flow assigns the initial role:

``` text
trader
```

------------------------------------------------------------------------

# 7. Market Data

The current source code contains a Binance integration.

The project includes:

``` text
src/lib/binance.ts
```

The Edge ML service also directly references:

``` text
https://api.binance.com
```

Therefore, the uploaded version currently has **Binance-based
market-data integration**.

### Important

If Quantum's final architecture is intended to use **EODHD as the
primary market-data provider**, the current Binance integration needs to
be replaced or moved behind a provider abstraction.

A production architecture should look like:

``` text
MarketDataProvider
       │
       ├── EODHDProvider
       ├── BinanceProvider
       └── FutureProvider
```

This prevents the trading engines from becoming tied to one data vendor.

------------------------------------------------------------------------

# 8. Trading Data Model

The code defines trading-related types for concepts such as:

-   Candles
-   Symbols
-   Timeframes
-   Buy/Sell/Neutral sides
-   ML predictions
-   Trade decisions
-   Portfolio state
-   Positions
-   Backtest results
-   Risk
-   Strategies
-   Institutional analysis

The standard OHLCV candle structure is used for market analysis:

``` text
Open
High
Low
Close
Volume
Timestamp
```

------------------------------------------------------------------------

# 9. Technical Indicator Engine

The project contains an indicator library and an indicator engine.

The ML feature-engineering layer also calculates indicators.

Indicators/features represented in the current code include:

-   SMA
-   EMA
-   RSI
-   MACD
-   Stochastic
-   ADX
-   OBV
-   Bollinger-style volatility/band width
-   ATR
-   Volume changes
-   Volume moving averages

These indicators are used as evidence rather than being the only source
of a trading decision.

------------------------------------------------------------------------

# 10. Market Structure Analysis

Quantum includes market-structure analysis.

The system analyzes concepts such as:

-   Swing highs
-   Swing lows
-   Trend structure
-   Support/resistance relationships
-   Market structure
-   Smart Money Concepts
-   Fibonacci relationships

The Master Decision Engine combines this information with other
evidence.

------------------------------------------------------------------------

# 11. Pattern Recognition

The pattern engine detects trading patterns from candle data.

Pattern analysis is integrated into the larger decision pipeline rather
than operating independently.

The architecture allows patterns to become evidence with:

-   Direction
-   Confidence
-   Weight
-   Engine source

This makes pattern recognition part of an explainable decision system.

------------------------------------------------------------------------

# 12. Liquidity Analysis

Quantum contains a dedicated liquidity engine.

Its role is to evaluate market liquidity conditions and provide evidence
to the decision engine.

Liquidity analysis can be combined with:

-   Market structure
-   Price action
-   Volatility
-   Patterns
-   Indicators
-   Institutional analysis

------------------------------------------------------------------------

# 13. Market Regime Engine

The regime engine attempts to classify the current market environment.

This is important because a strategy that works in a trending market may
perform poorly in:

-   Ranging markets
-   High-volatility markets
-   Low-volatility markets
-   Transitional markets

The regime result becomes part of the overall decision evidence.

------------------------------------------------------------------------

# 14. Strategy Engine

The strategy engine evaluates trading strategies against the current
market context.

Strategies can be evaluated using multiple pieces of evidence instead of
relying on a single indicator.

The strategy result feeds the Master Decision Engine.

------------------------------------------------------------------------

# 15. Historical Similarity Engine

Quantum includes a historical similarity engine.

The objective is to compare current market conditions with historical
market situations.

Conceptually:

``` text
Current Market
      ↓
Feature Representation
      ↓
Historical Search
      ↓
Similar Situations
      ↓
Historical Outcomes
      ↓
Evidence
      ↓
Master Decision
```

This is intended to provide historical context for current decisions.

------------------------------------------------------------------------

# 16. Machine Learning System

The ML system is one of the major components of Quantum.

There are two major implementations.

## TensorFlow.js

The project defines three model architectures.

### Dense Model

A feed-forward neural network for tabular features.

``` text
Features
   ↓
Dense
   ↓
Dropout
   ↓
Dense
   ↓
Output
```

### LSTM Model

Designed for sequential/time-series data.

``` text
Candle Sequence
      ↓
     LSTM
      ↓
     LSTM
      ↓
    Dense
      ↓
 Prediction
```

### Transformer-Inspired Model

The current implementation is a lightweight attention-inspired
architecture.

It uses:

-   Dense projection
-   Attention-like weighting
-   Global average pooling
-   Feed-forward layers
-   Classification/regression output

This should be described as **transformer-inspired**, not a full
production Transformer architecture.

------------------------------------------------------------------------

# 17. ML Training Pipeline

The project includes:

``` text
dataLoader.ts
trainer.ts
inference.ts
modelDefinition.ts
modelStorage.ts
trainingWorker.ts
```

The conceptual ML pipeline is:

``` text
Historical Candles
       ↓
Data Loading
       ↓
Feature Engineering
       ↓
Dataset Preparation
       ↓
Train / Validation Split
       ↓
Model Training
       ↓
Metrics
       ↓
Model Storage
       ↓
Inference
       ↓
Prediction
```

------------------------------------------------------------------------

# 18. ML Edge Function

The Supabase Edge Function:

``` text
supabase/functions/ml-predict/
```

acts as a server-side ML service.

The current implementation provides the conceptual endpoints:

``` text
POST /predict
GET  /model/status
POST /retrain
```

The implementation performs extensive feature engineering from:

-   Price
-   Volume
-   Indicators
-   Market structure
-   Volatility

The current Edge Function uses an ensemble of logistic-regression
classifiers.

------------------------------------------------------------------------

# 19. AI Reasoning

Quantum does not rely solely on ML probability.

The system contains an AI reasoning engine that synthesizes evidence
from the different analytical engines.

The intended flow is:

``` text
Market Data
    ↓
Technical Analysis
    ↓
Structure
    ↓
Liquidity
    ↓
Patterns
    ↓
Indicators
    ↓
Regime
    ↓
Strategies
    ↓
Historical Similarity
    ↓
ML
    ↓
AI Reasoning
    ↓
Risk
    ↓
Portfolio
    ↓
Master Decision
```

------------------------------------------------------------------------

# 20. Master Decision Engine

The **Master Decision Engine** is the central decision-making component.

File:

``` text
src/engines/masterDecisionEngine.ts
```

Its documented pipeline is:

``` text
validate
→ context
→ evidence
→ contradictions
→ strategies
→ historical
→ models
→ risk
→ portfolio
→ confidence
→ decide
→ explain
→ persist
```

## Main analysis sequence

The current implementation executes:

1.  Data quality
2.  Market context
3.  Structure
4.  Liquidity
5.  Patterns
6.  Indicators
7.  Market regime
8.  Strategy
9.  Historical similarity
10. ML
11. AI reasoning
12. Contradiction detection
13. Confidence calculation
14. Risk evaluation
15. Portfolio evaluation
16. Final trade decision

------------------------------------------------------------------------

# 21. Evidence-Based Decision Making

The Master Decision Engine does not simply ask:

``` text
Is RSI oversold?
```

Instead, it collects evidence.

Each evidence item can contain concepts such as:

``` text
engineName
direction
confidence
weight
description
```

Directions include:

``` text
bullish
bearish
neutral
```

The system then combines evidence from multiple engines.

------------------------------------------------------------------------

# 22. Contradiction Detection

Quantum explicitly attempts to identify conflicting evidence.

Example:

``` text
Structure Engine → Bullish
Indicator Engine → Bearish
```

The system can classify this as a contradiction.

Contradictions reduce the final confidence score.

This is important because a professional decision system should not hide
disagreement between analytical models.

------------------------------------------------------------------------

# 23. Confidence Engine

The confidence calculation considers factors such as:

-   Evidence quality
-   Evidence agreement
-   Evidence independence
-   Historical sample quality
-   Model calibration
-   Regime stability
-   Data freshness
-   Risk conditions
-   Contradiction penalties

The resulting confidence is bounded between:

``` text
0 and 1
```

------------------------------------------------------------------------

# 24. Explainability

The project includes:

``` text
explain.ts
explainabilityEngine.ts
ExplanationPanel.tsx
```

The objective is to explain why a trade decision was generated.

An explanation can be built around:

-   Evidence
-   Market context
-   Strategy
-   Risk
-   Contradictions
-   ML prediction
-   Confidence

This makes the system more transparent than a black-box buy/sell signal.

------------------------------------------------------------------------

# 25. Risk Engine

Risk management is implemented as a dedicated engine.

The project includes logic for:

-   Risk assessment
-   Position sizing
-   Stop-loss
-   Take-profit
-   Portfolio constraints
-   Risk scoring
-   Exposure

The risk engine participates in the final decision rather than being an
afterthought.

------------------------------------------------------------------------

# 26. Paper Trading

Quantum contains a paper-trading engine.

The system supports concepts including:

-   Paper positions
-   Entry
-   Exit
-   Stop loss
-   Take profit
-   Pending orders
-   Limit orders
-   Stop orders
-   Trailing stops
-   P&L
-   Position status
-   Trade records

The purpose is to simulate trading without executing real-money orders.

------------------------------------------------------------------------

# 27. Paper Trading Execution Flow

``` text
AI Decision
     ↓
Risk Validation
     ↓
Paper Order
     ↓
Pending/Open Position
     ↓
Live Market Price
     ↓
SL / TP / Trailing Stop Check
     ↓
Position Closed
     ↓
P&L
     ↓
Trade Review
```

------------------------------------------------------------------------

# 28. Backtesting

The backtesting engine supports:

-   Historical simulation
-   Risk-based position sizing
-   Stop-loss
-   Take-profit
-   Holding-period exits
-   Commission
-   Equity curves
-   Win rate
-   Profit factor
-   Average win
-   Average loss
-   Expectancy
-   Sharpe ratio
-   Sortino ratio
-   Maximum drawdown

------------------------------------------------------------------------

# 29. Walk-Forward Testing

The current implementation includes walk-forward testing.

The data is divided into:

``` text
70% → In-Sample
30% → Out-of-Sample
```

The system compares performance to determine whether a strategy's
historical performance persists outside the initial sample.

------------------------------------------------------------------------

# 30. Monte Carlo Simulation

The backtesting suite also includes Monte Carlo simulation.

The objective is to resample trade sequences to estimate possible
distributions of:

-   Returns
-   Drawdowns
-   Performance variability

This helps evaluate whether a strategy's historical result may be
dependent on a particular sequence of trades.

------------------------------------------------------------------------

# 31. Portfolio Engine

The portfolio engine evaluates the trading decision against the current
portfolio.

It can consider:

-   Existing positions
-   Portfolio risk
-   Exposure
-   Position sizing
-   Correlations
-   Portfolio constraints

This is important because a good individual trade can still be a poor
portfolio-level decision.

------------------------------------------------------------------------

# 32. Institutional Analysis

The project contains an institutional analysis engine.

The architecture includes:

``` text
runInstitutionalPipeline()
```

Institutional analysis is included as another evidence source for the
Master Decision Engine.

------------------------------------------------------------------------

# 33. Correlation Analysis

The Master Decision Engine accepts correlation-series information.

This allows decisions to consider relationships between different
assets.

For example:

``` text
Asset A
   ↕
Correlation
   ↕
Asset B
```

This can help avoid excessive correlated exposure.

------------------------------------------------------------------------

# 34. News and Sentiment

The project includes a Supabase Edge Function:

``` text
supabase/functions/news-feed/
```

The news function:

-   Generates/handles news records
-   Classifies sentiment
-   Stores news in `news_items`
-   Returns recent news
-   Uses sentiment scores

The current uploaded implementation contains example/mock-style news
sources and URLs, so this area should be connected to a real production
news provider before production deployment.

------------------------------------------------------------------------

# 35. Kinetic Coach

The project includes:

``` text
supabase/functions/kinetic-coach/
```

This is intended to provide AI coaching/interactions around trading and
market analysis.

The frontend also contains:

``` text
KineticCoach.tsx
```

------------------------------------------------------------------------

# 36. Data Persistence

Supabase is used throughout the current project for persistence.

The code references tables/concepts including:

``` text
profiles
user_roles
news_items
paper_positions
```

There are also persistence modules for:

-   Decisions
-   Trade reviews
-   Paper trading
-   Portfolio-related information

------------------------------------------------------------------------

# 37. Frontend Component Architecture

The project contains reusable components such as:

-   AppShell
-   Sidebar
-   Dashboard
-   PriceChart
-   PredictionDisplay
-   AITrainingPanel
-   MasterDecisionPanel
-   ExplanationPanel
-   BacktestPanel
-   AlertPanel
-   InstitutionalPanel
-   ModelMetrics
-   KineticCoach
-   PageHeader
-   AuthScreen

The intended architecture separates:

``` text
Page
 ↓
UI Components
 ↓
Hooks / State
 ↓
Engines / Services
 ↓
Supabase / APIs
```

------------------------------------------------------------------------

# 38. React Context Architecture

Three main contexts are present.

## AuthContext

Responsible for:

-   Session
-   User
-   Authentication
-   User role

## ThemeContext

Responsible for:

-   Theme
-   Dark/light presentation

## SidebarContext

Responsible for:

-   Sidebar state
-   Navigation UI behavior

------------------------------------------------------------------------

# 39. Routing

React Router controls application navigation.

Routes include:

``` text
/
 /terminal
 /ai-center
 /scanner
 /patterns
 /backtesting
 /portfolio
 /risk
 /news
 /learning
 /research
 /journal
 /watchlist
 /settings
```

Protected routing is implemented through the authentication-aware
layout.

Users without an active session are sent to the authentication
interface.

------------------------------------------------------------------------

# 40. State Management Architecture

The project combines:

### React Context

Used for cross-cutting application concerns.

### Zustand

Used for lightweight application state such as:

-   Settings
-   Alerts

### React Query

Used for server/data fetching and caching.

This gives the project three distinct state responsibilities instead of
putting everything into one global store.

------------------------------------------------------------------------

# 41. Hooks

Custom hooks include:

``` text
useAlertEngine
useDecisionEngine
```

These hooks connect UI components to the underlying trading intelligence
and alert systems.

------------------------------------------------------------------------

# 42. Alert System

The alert architecture includes:

-   Alert store
-   Alert engine
-   Alert panel

The system can be extended for conditions such as:

``` text
Price Alert
Pattern Alert
AI Decision Alert
Risk Alert
Market Condition Alert
```

------------------------------------------------------------------------

# 43. Database / Backend Architecture

The current backend architecture is Supabase-centric.

``` text
React Frontend
       ↓
Supabase Client
       ↓
Supabase Auth
       ↓
Supabase PostgreSQL
       ↓
Supabase Edge Functions
       ↓
External Market / News APIs
```

This avoids the need for a traditional always-on Node/Python API server
in the current implementation.

------------------------------------------------------------------------

# 44. Environment Configuration

External credentials and secrets should be stored using environment
variables or the platform's secret-management system.

Examples include:

``` text
Supabase URL
Supabase anonymous key
ML service API key
Market-data API keys
News API keys
```

Secrets must **never be hardcoded** into source files.

The current ML Edge Function contains a fallback development key value.
This should be removed for a production deployment.

------------------------------------------------------------------------

# 45. Security Requirements

A production version should enforce:

-   Secure authentication
-   Row Level Security
-   Server-side authorization
-   Role-based access control
-   API authentication
-   Environment-based secrets
-   Input validation
-   Rate limiting
-   Audit logging
-   Secure Edge Functions
-   No secret keys in frontend code
-   Least-privilege database access

------------------------------------------------------------------------

# 46. Production Data Architecture Recommendation

For the intended production Quantum architecture, market data should
be abstracted.

Recommended design:

``` text
                    Market Data Interface
                            │
             ┌──────────────┼──────────────┐
             │              │              │
          EODHD          Binance        Future API
        Primary          Crypto          Provider
```

The engines should consume normalized candles rather than directly
calling a provider.

``` text
Provider
   ↓
Normalizer
   ↓
Market Data Service
   ↓
Cache
   ↓
Trading Engines
```

------------------------------------------------------------------------

# 47. Recommended Real-Time Architecture

For real-time market intelligence:

``` text
Market Provider
      ↓
WebSocket / Streaming Layer
      ↓
Market Data Normalizer
      ↓
Redis / Fast Cache
      ↓
Feature Calculation
      ↓
Analysis Engines
      ↓
Master Decision Engine
      ↓
Alert System
      ↓
Frontend
```

The uploaded project contains the analytical engines required for much
of this pipeline, but a fully production-grade real-time streaming layer
would need to be implemented around the provider integration.

------------------------------------------------------------------------

# 48. AI Decision Pipeline

The complete intended Quantum decision flow is:

``` text
                  MARKET DATA
                       │
                       ▼
                DATA QUALITY
                       │
                       ▼
                MARKET CONTEXT
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
      STRUCTURE     LIQUIDITY     PATTERNS
          │            │            │
          └────────────┼────────────┘
                       ▼
                   INDICATORS
                       │
                       ▼
                  MARKET REGIME
                       │
                       ▼
                   STRATEGIES
                       │
                       ▼
              HISTORICAL SIMILARITY
                       │
                       ▼
                       ML
                       │
                       ▼
                 AI REASONING
                       │
                       ▼
               CONTRADICTIONS
                       │
                       ▼
                     RISK
                       │
                       ▼
                  PORTFOLIO
                       │
                       ▼
                  CONFIDENCE
                       │
                       ▼
                FINAL DECISION
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
       EXPLAIN                    PERSIST
          │                         │
          └────────────┬────────────┘
                       ▼
                 PAPER TRADING
```

------------------------------------------------------------------------

# 49. Final Decision Types

The decision model supports the concept of:

``` text
BUY
SELL
NO_TRADE
```

A decision can contain:

-   Decision ID
-   Symbol
-   Timeframe
-   Decision type
-   Confidence
-   Side
-   Entry zone
-   Stop loss
-   Targets
-   Risk
-   Strategy
-   Evidence
-   Contradictions
-   Reasoning
-   Engine versions
-   Market context
-   Institutional analysis
-   Timestamp
-   Context ID

------------------------------------------------------------------------

# 50. Multi-Timeframe Architecture

The Master Decision Engine accepts a candle map by timeframe.

Conceptually:

``` text
Higher Timeframe
       ↓
Market Bias
       ↓
Middle Timeframe
       ↓
Structure / Setup
       ↓
Lower Timeframe
       ↓
Entry Confirmation
```

This architecture allows Quantum to evolve toward a true
multi-timeframe decision system.

------------------------------------------------------------------------

# 51. Trading Intelligence Philosophy

Quantum is designed around **confluence rather than one-indicator
trading**.

Instead of:

``` text
RSI < 30
    ↓
BUY
```

the system attempts to reason:

``` text
Data Quality
+
Market Structure
+
Liquidity
+
Patterns
+
Indicators
+
Regime
+
Strategy
+
Historical Similarity
+
ML
+
Risk
+
Portfolio
=
Decision
```

This is one of the core architectural ideas of the project.

------------------------------------------------------------------------

# 52. Current Project Strengths

The uploaded project already has a substantial foundation.

### Strong areas

-   Modular trading engines
-   React/TypeScript architecture
-   Protected authentication
-   Supabase integration
-   Multiple AI/ML components
-   TensorFlow.js models
-   Server-side Edge ML service
-   Technical analysis
-   Market structure
-   Pattern detection
-   Risk management
-   Paper trading
-   Backtesting
-   Walk-forward testing
-   Monte Carlo simulation
-   Explainability
-   Contradiction detection
-   Portfolio analysis
-   News functionality
-   Research and learning modules
-   Dedicated UI for major trading workflows

------------------------------------------------------------------------

# 53. Important Current-Code Gaps

The project should not be described as fully production-ready yet.

Important areas requiring further engineering include:

## Market Data

The current code directly uses Binance in places.

If EODHD is the intended primary provider, the market-data layer needs
to be refactored.

## News

The current Edge Function contains example/mock-style news content.

A real news provider should be integrated.

## ML Productionization

The ML implementations are useful foundations, but production deployment
requires:

-   Proper model versioning
-   Persistent model artifacts
-   Training dataset management
-   Validation
-   Calibration
-   Drift detection
-   Monitoring
-   Retraining policy
-   Reproducibility

## Security

The fallback ML API key must not be used in production.

Secrets should be managed through deployment secrets.

## Real-Time Processing

A production real-time system needs a robust streaming/data-ingestion
architecture.

## Backtesting Validation

The backtesting implementation should be audited for:

-   Look-ahead bias
-   Execution assumptions
-   Slippage
-   Spread
-   Market-specific fees
-   Data survivorship issues
-   Timeframe consistency
-   Position overlap
-   Realistic order fills

------------------------------------------------------------------------

# 54. Recommended Production Stack

If Quantum is being upgraded into a serious production platform, the
recommended stack is:

## Frontend

``` text
Next.js or React
TypeScript
Tailwind CSS
shadcn/ui
Lightweight Charts
Zustand
TanStack Query
```

## Backend

A dedicated API/service layer can be introduced if the application grows
beyond the current Supabase-centric architecture.

Possible stack:

``` text
Node.js / TypeScript
or
Python / FastAPI
```

However, the **uploaded project itself currently uses TypeScript rather
than Python** for its backend/ML Edge Function.

## Database

``` text
PostgreSQL
```

Supabase PostgreSQL is suitable for the current stage.

## Cache / Streaming

``` text
Redis
WebSockets
```

## ML

``` text
TensorFlow
PyTorch
Scikit-learn
```

The current application uses TensorFlow.js and TypeScript-based ML.

## Market Data

``` text
EODHD
```

as the intended primary provider, with other providers behind an
abstraction layer where needed.

## Infrastructure

``` text
Vercel / Cloudflare / similar
+
Supabase
+
Managed Redis
```

The exact deployment choice should depend on the final real-time
workload.

------------------------------------------------------------------------

# 55. Development Commands

The project uses npm scripts.

``` bash
npm install
npm run dev
npm run build
npm run lint
npm run typecheck
npm run preview
```

Development server:

``` bash
npm run dev
```

Production build:

``` bash
npm run build
```

Type checking:

``` bash
npm run typecheck
```

Linting:

``` bash
npm run lint
```

------------------------------------------------------------------------

# 56. Project Identity

## Name

**Quantum**

## Category

**AI Trading Intelligence / Quantitative Trading Research / Paper
Trading Platform**

## Primary Purpose

To provide an intelligent market-analysis system that combines
quantitative analysis, technical analysis, machine learning, historical
context, risk management, portfolio analysis, and explainable
decision-making.

## Trading Mode

The architecture is suited to **paper trading and research** rather than
direct real-money execution.

------------------------------------------------------------------------

# 57. One-Sentence Description

> **Quantum is a modular AI-powered trading intelligence platform that
> analyzes real-time and historical market data through technical,
> structural, liquidity, pattern, regime, strategy, historical, ML,
> risk, and portfolio engines before producing an explainable
> paper-trading decision.**

------------------------------------------------------------------------

# 58. Short Technical Description

> Quantum is a React 18 + TypeScript + Vite trading intelligence
> application backed by Supabase PostgreSQL/Auth/Edge Functions, using
> TanStack Query and Zustand for application state/data management,
> Lightweight Charts for market visualization, and TensorFlow.js plus
> TypeScript/Deno ML services for prediction and analysis. Its modular
> quantitative engine evaluates market context, structure, liquidity,
> patterns, indicators, regimes, strategies, historical similarity, ML
> predictions, risk, and portfolio constraints before producing an
> explainable master trading decision and supporting paper-trading,
> backtesting, research, learning, journaling, watchlists, alerts, and
> news workflows.

------------------------------------------------------------------------

# 59. Technology Summary

  Layer                          Technology
  ------------------------------ ----------------------------------------------
  UI                             React 18
  Language                       TypeScript
  Build                          Vite 5
  Styling                        Tailwind CSS
  Routing                        React Router
  State                          Zustand + React Context
  Data Fetching                  TanStack Query
  Charts                         Lightweight Charts
  Icons                          Lucide React
  Database                       Supabase PostgreSQL
  Authentication                 Supabase Auth
  Serverless Backend             Supabase Edge Functions
  Edge Runtime                   Deno
  Client ML                      TensorFlow.js
  ML Architectures               Dense, LSTM, Transformer-inspired
  Server ML                      TypeScript/Deno logistic-regression ensemble
  Market Data in Current Code    Binance
  Intended Primary Market Data   EODHD
  Trading Mode                   Paper Trading
  Backtesting                    Custom TypeScript engine
  Risk                           Custom risk engine
  AI Reasoning                   Custom reasoning/evidence engine
  Code Quality                   ESLint + TypeScript
  Package Manager                npm

------------------------------------------------------------------------

# 60. Final Architecture Statement

Quantum should be treated as a **multi-engine trading intelligence
platform**, not simply a trading dashboard.

Its core architecture is:

``` text
                    Quantum
                        │
        ┌───────────────┼────────────────┐
        │               │                │
      DATA             AI              USER
        │               │                │
   Market Data      ML Models        Dashboard
   News             Reasoning        Terminal
   Historical       Evidence         Research
        │               │             Journal
        └───────────────┼────────────────┘
                        │
                 ANALYSIS ENGINES
                        │
      ┌─────────────────┼─────────────────┐
      │                 │                 │
  Technical         Structure          Liquidity
  Patterns          Regime             Strategy
  Historical        Risk               Portfolio
      │                 │                 │
      └─────────────────┼─────────────────┘
                        │
                MASTER DECISION
                        │
             ┌──────────┴──────────┐
             │                     │
        EXPLAINABLE AI        PAPER TRADING
             │                     │
             └──────────┬──────────┘
                        │
                    PERSISTENCE
                        │
                    PostgreSQL
```

The key engineering principle is **separation of concerns**: market
data, analysis engines, machine learning, decision synthesis, risk,
portfolio management, execution simulation, persistence, and
presentation should remain independent modules connected through
well-defined interfaces.
