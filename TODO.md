# Quantum Intelligence — Implementation Roadmap

Based on the ReadMe specification, here is the phased implementation plan comparing existing features vs. required features.

## Status Legend
- ✅ **Done** — Already implemented in codebase
- 🔧 **In Progress** — Partially implemented, needs expansion
- 📋 **Planned** — Specified in ReadMe, not yet implemented
- ⏸️ **On Hold** — Requires external dependencies/services

---

## Phase 1: Foundation (Current State)
### ✅ Done
- React + TypeScript frontend with Vite
- TailwindCSS with light/dark theme (semantic CSS vars)
- Supabase auth (email/password)
- Supabase PostgreSQL database (5 tables)
- Binance crypto data (REST + WebSocket)
- Core technical indicators (SMA, EMA, RSI, MACD, Bollinger, ATR)
- 8 trading strategies (H&S, Double Top/Bottom, Triangle, Flag, MA Cross, RSI Div, Bollinger, S/R, Fibonacci)
- Basic ML prediction (logistic regression in Deno edge function)
- Live market data via WebSocket with auto-reconnect
- AI Coach (Gemini 1.5 Flash integration)
- Live price chart (Lightweight Charts)

---

## Phase 2: Platform & Role Management
### 🔧 Needs Expansion

#### 1. Role-Based Access Control
- **Current**: Generic `authenticated` user only
- **Required**: Distinguish between `user` and `admin` roles
- **Files to modify**:
  - `src/context/AuthContext.tsx` — Add role/type to user session
  - `src/components/Dashboard.tsx` — Conditional UI for admin features
  - `src/lib/types.ts` — Add `UserRole` type
  - Supabase migration — Add `role` column to auth.users or profiles table
- **New files needed**:
  - `src/components/AdminPanel.tsx` — Admin dashboard
  - `src/components/AdminRoute.tsx` — Role-based route guard

#### 2. Context Management System (CMS)
- **Required**: Manage educational content, strategy docs, system announcements
- **New files needed**:
  - `src/context/CMSContext.tsx` — CMS state management
  - `src/components/CMS/` — CMS editor, viewer, management UI
  - `src/lib/cms.ts` — CMS API client
  - Supabase migration — `cms_content` table (id, slug, title, body, type, author, published_at, created_at)

---

## Phase 3: Multi-Market Expansion
### 📋 Planned

#### 1. Universal Market Type System
- **Current**: Only crypto (BTCUSDT, ETHUSDT, etc.) via Binance
- **Required**: Support Forex, Crypto, Commodities, Indices, Stocks
- **Files to modify**:
  - `src/lib/types.ts` — Add `MarketType` ('crypto' | 'forex' | 'commodity' | 'index' | 'stock'), `Market` interface
  - Expand `TRACKED_PAIRS` into categorized market list
- **New files needed**:
  - `src/lib/markets.ts` — Full market universe definitions
  - `src/lib/providers/` — Data provider abstraction layer

#### 2. Data Provider Abstraction
- **New files needed**:
  - `src/lib/providers/types.ts` — Unified data provider interface
  - `src/lib/providers/binance.ts` — Current Binance, refactored
  - `src/lib/providers/fixer.ts` — Forex data (or OANDA/FXCM)
  - `src/lib/providers/polygon.ts` — Stocks/indices data
  - `src/lib/providers/iex.ts` — Alternative stock data

#### 3. Expanded Timeframes
- **Current**: 1m, 15m, 1h, 4h, 1d
- **Required**: +3m, 5m, 30m, 1w, 1M
- **Files to modify**:
  - `src/lib/types.ts` — Update `Timeframe` type, `TIMEFRAMES` array

---

## Phase 4: Pattern Recognition Engine
### 📋 Planned

#### 1. Expanded Chart Patterns
- **Current**: H&S, Inverse H&S, Double Top/Bottom, Triangle, Flag
- **Required**: +Triple Top/Bottom, Pennant, Rectangle, Cup & Handle, Wedges, Channels
- **Files to modify**:
  - `src/lib/strategies.ts` — Add new pattern detection functions
- **New files needed**:
  - `src/lib/patterns/chart-patterns.ts` — Dedicated chart pattern module
  - `src/lib/patterns/candlestick-patterns.ts` — Candlestick pattern module

#### 2. Candlestick Pattern Library (17 patterns)
- **New files needed**:
  - `src/lib/patterns/candlestick-patterns.ts`
  - Patterns: Hammer, Shooting Star, Engulfing, Doji, Morning/Evening Star, Three Soldiers/Crows, Inside/Outside Bar, etc.

#### 3. Pattern Scoring System
- Each pattern gets a confidence score based on:
  - Context (trend direction, volatility)
  - Volume confirmation
  - Multi-timeframe alignment
  - Recent reliability

---

## Phase 5: Market Structure Engine
### 📋 Planned

- **New files needed**:
  - `src/lib/market-structure.ts`
- Detect: HH, HL, LH, LL, BOS, CHoCH
- Trend state: Bullish, Bearish, Ranging, Consolidating
- Structure breaks with volume confirmation
- Multi-timeframe structure alignment

---

## Phase 6: Smart Money Concepts (SMC)
### 📋 Planned

- **New files needed**:
  - `src/lib/smc.ts` — Core SMC logic
  - `src/lib/smc/order-blocks.ts`
  - `src/lib/smc/fvg.ts` — Fair Value Gaps
  - `src/lib/smc/liquidity.ts` — Liquidity pools/sweeps
  - `src/lib/smc/zones.ts` — Premium/discount zones
- Integration with existing indicator engine for confluence

---

## Phase 7: Fibonacci Engine
### 🔧 Partial (Basic Fibonacci exists in strategies.ts)
- **Current**: Basic Fib retracement (0, 23.6, 38.2, 50, 61.8, 78.6, 100) with golden pocket detection
- **Required**: Full retracement + extension levels with confluence analysis
- **Files to modify**:
  - `src/lib/strategies.ts` — Expand Fibonacci engine
- **New files needed**:
  - `src/lib/fibonacci.ts` — Dedicated Fibonacci module with retracements, extensions, time zones, confluence scoring

---

## Phase 8: Indicator Engine Expansion
### 📋 Planned

#### Additional Moving Averages
- **New files needed**:
  - `src/lib/indicators/wma.ts` — Weighted Moving Average
  - `src/lib/indicators/hma.ts` — Hull Moving Average
  - Add VWMA to volume indicators

#### Momentum Indicators
- **New files needed**:
  - `src/lib/indicators/stochastic.ts`
  - `src/lib/indicators/stochastic-rsi.ts`
  - `src/lib/indicators/roc.ts`
  - `src/lib/indicators/momentum.ts`

#### Volatility Indicators
- **New files needed**:
  - `src/lib/indicators/keltner.ts`
  - `src/lib/indicators/donchian.ts`

#### Volume Indicators
- **New files needed**:
  - `src/lib/indicators/obv.ts`
  - `src/lib/indicators/vwap.ts`
  - `src/lib/indicators/mfi.ts`
  - `src/lib/indicators/accumulation-distribution.ts`
  - `src/lib/indicators/volume-profile.ts`

#### Additional Indicators
- **New files needed**:
  - `src/lib/indicators/adx.ts`
  - `src/lib/indicators/cci.ts`
  - `src/lib/indicators/ichimoku.ts`
  - `src/lib/indicators/parabolic-sar.ts`
  - `src/lib/indicators/pivot-points.ts`

---

## Phase 9: AI/ML Intelligence Layer
### 📋 Planned

#### 1. Feature Engineering Pipeline
- **New files needed**:
  - `src/lib/ml/features.ts` — Feature computation (hundreds of features)
  - Feature categories: indicators, price action, market structure, SMC, volume, volatility

#### 2. Advanced ML Models
- **New files needed**:
  - `supabase/functions/ml-predict/models/xgboost.ts`
  - `supabase/functions/ml-predict/models/lstm.ts`
  - `supabase/functions/ml-predict/models/transformer.ts`
  - `src/lib/ml/ensemble.ts` — Ensemble voting/stacking

#### 3. Reinforcement Learning
- **New files needed**:
  - `src/lib/rl/environment.ts` — Trading environment (OpenAI Gym-style)
  - `src/lib/rl/agents/ppo.ts`
  - `src/lib/rl/agents/sac.ts`
  - `src/lib/rl/agents/dqn.ts`
  - `src/lib/rl/trainer.ts` — Training loop with experience replay

---

## Phase 10: Strategy Library Expansion
### 📋 Planned

- **New files needed**:
  - `src/lib/strategies/trend-following.ts`
  - `src/lib/strategies/breakout.ts`
  - `src/lib/strategies/mean-reversion.ts`
  - `src/lib/strategies/momentum.ts`
  - `src/lib/strategies/swing.ts`
  - `src/lib/strategies/scalping.ts`
  - `src/lib/strategies/position-trading.ts`
  - `src/lib/strategies/stat-arb.ts`
  - `src/lib/strategies/pairs-trading.ts`
  - `src/lib/strategies/volatility.ts`
  - `src/lib/strategies/smc-strategies.ts`
  - `src/lib/strategies/hybrid-ai.ts`
- **Strategy selector**: Dynamic strategy selection based on market regime detection

---

## Phase 11: Risk Management
### 📋 Planned

- **New files needed**:
  - `src/lib/risk/position-sizing.ts` — Dynamic position sizing (Kelly, Fixed %, Volatility-adjusted)
  - `src/lib/risk/limits.ts` — Daily loss, drawdown, exposure limits
  - `src/lib/risk/correlation.ts` — Correlation management
  - `src/lib/risk/stops.ts` — Volatility-adjusted stop placement
  - `src/lib/risk/portfolio.ts` — Portfolio-level risk aggregation

---

## Phase 12: Backtesting Expansion
### 📋 Planned

- **New files needed**:
  - `src/lib/backtest/engine.ts` — Refactored backtest engine
  - `src/lib/backtest/walk-forward.ts` — Walk-forward optimization
  - `src/lib/backtest/monte-carlo.ts` — Monte Carlo simulation
  - `src/lib/backtest/metrics.ts` — Sharpe, Sortino, Profit Factor, Calmar
  - `src/lib/backtest/report.ts` — HTML/PDF report generation

---

## Phase 13: Explainable AI (XAI)
### 📋 Planned

- **New files needed**:
  - `src/components/ExplainableTrade.tsx` — Trade explanation card
  - `src/lib/xai/explainer.ts` — Feature importance, SHAP-style explanations
- For every trade signal, generate:
  - Reasoning chain (why this trade)
  - Indicators/patterns involved
  - Confidence score breakdown
  - Risk assessment
  - SL/TP reasoning
  - Alternative scenarios

---

## Phase 14: Admin Dashboard
### 📋 Planned

- **New files needed**:
  - `src/components/AdminPanel.tsx` — Admin console
  - `src/components/Admin/SystemMetrics.tsx` — System health
  - `src/components/Admin/UserManagement.tsx` — User admin
  - `src/components/Admin/ModelManagement.tsx` — ML model control
  - `src/components/Admin/CMSManager.tsx` — Content management
  - `src/components/Admin/Logs.tsx` — System logs viewer

---

## Database Migrations Needed

### New Tables
1. `profiles` — Extended user profiles with role
2. `cms_content` — CMS articles and content
3. `market_universe` — All supported markets (forex, crypto, stocks, etc.)
4. `features` — Cached feature computations
5. `model_registry` — ML model versioning metadata
6. `rl_agents` — RL agent checkpoints
7. `strategy_performance` — Per-strategy performance tracking

### Existing Table Modifications
1. `positions` — Add market_type, pair normalisation
2. `ml_predictions` — Add model_type, feature_version columns

---

## Immediate Next Steps (Priority Order)

1. **Role-based auth**: Add admin/user roles to existing auth system
2. **Market type system**: Extend types.ts for multi-market support
3. **Timeframe expansion**: Add 3m, 5m, 30m, 1w, 1M
4. **CMS context**: Create basic CMS system
5. **Pattern library**: Add candlestick + chart pattern engines
6. **Market structure engine**: Add BOS/CHoCH detection
7. **Indicator expansion**: Add missing indicators

---

## Files to Create (New)

```
src/
├── lib/
│   ├── markets.ts                  # Market universe definitions
│   ├── market-structure.ts         # HH/HL/LH/LL, BOS, CHoCH
│   ├── smc.ts                      # Smart Money Concepts
│   ├── fibonacci.ts                # Full Fibonacci engine
│   ├── feature-engineering.ts      # ML feature pipeline
│   ├── cms.ts                      # CMS API client
│   ├── providers/
│   │   ├── types.ts                # Data provider interface
│   │   ├── binance.ts              # Refactored Binance provider
│   │   ├── forex.ts                # Forex data provider
│   │   └── stocks.ts               # Stocks/indices provider
│   ├── indicators/
│   │   ├── wma.ts
│   │   ├── hma.ts
│   │   ├── stochastic.ts
│   │   ├── stochastic-rsi.ts
│   │   ├── adx.ts
│   │   ├── cci.ts
│   │   ├── ichimoku.ts
│   │   ├── keltner.ts
│   │   ├── donchian.ts
│   │   ├── obv.ts
│   │   ├── vwap.ts
│   │   ├── mfi.ts
│   │   ├── volume-profile.ts
│   │   └── pivot-points.ts
│   ├── patterns/
│   │   ├── chart-patterns.ts       # Extended chart patterns
│   │   └── candlestick-patterns.ts # Candlestick patterns
│   ├── strategies/
│   │   ├── index.ts                # Strategy registry
│   │   ├── trend-following.ts
│   │   ├── breakout.ts
│   │   ├── mean-reversion.ts
│   │   └── ... (12+ total)
│   ├── risk/
│   │   ├── position-sizing.ts
│   │   ├── limits.ts
│   │   └── portfolio.ts
│   ├── backtest/
│   │   ├── engine.ts
│   │   ├── walk-forward.ts
│   │   ├── monte-carlo.ts
│   │   └── metrics.ts
│   ├── rl/
│   │   ├── environment.ts
│   │   ├── agents/
│   │   │   ├── ppo.ts
│   │   │   ├── sac.ts
│   │   │   └── dqn.ts
│   │   └── trainer.ts
│   └── ml/
│       ├── features.ts
│       └── ensemble.ts
├── components/
│   ├── AdminPanel.tsx
│   ├── AdminRoute.tsx
│   ├── ExplainableTrade.tsx
│   ├── CMS/
│   │   ├── CMSViewer.tsx
│   │   ├── CMSEditor.tsx
│   │   └── CMSManager.tsx
│   └── Admin/
│       ├── SystemMetrics.tsx
│       ├── UserManagement.tsx
│       ├── ModelManagement.tsx
│       └── Logs.tsx
└── context/
    ├── CMSContext.tsx
    └── RoleContext.tsx
```

## Files to Modify

```
src/
├── lib/types.ts                    # Add MarketType, Timeframe, UserRole, Market
├── context/AuthContext.tsx          # Add role/profile data
├── components/Dashboard.tsx         # Multi-market selector, admin routing
├── components/AuthScreen.tsx        # Role assignment on signup
├── lib/strategies.ts                # Expand pattern detection, Fibonacci
├── lib/indicators.ts                # Add new indicators
├── lib/backtest.ts                  # Expand backtest capabilities
└── lib/binance.ts                   # Refactor as part of provider system
```

