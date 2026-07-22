# Quantum Intelligence — AI Trading Intelligence Platform

> A professional-grade AI trading intelligence system capable of analyzing thousands of instruments across Forex, Crypto, Commodities, Indices, and Stocks — identifying patterns, evaluating strategies, learning from historical performance, and producing explainable paper-trading decisions.

![Architecture](docs/architecture.png)

## System Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│  Binance    │────→│  binance.ts  │────→│  Candle[]      │
│  REST/WS    │     │  fetch/sub   │     │  (state)       │
└─────────────┘     └──────────────┘     └───────┬────────┘
                                                  │
                    ┌─────────────────────────────┤
                    │                             │
                    ▼                             ▼
           ┌──────────────┐             ┌─────────────────┐
           │ indicators.ts│             │ strategies.ts   │
           │ SMA, RSI,    │             │ 8 strategies    │
           │ MACD, ATR…   │             │ (patterns,      │
           └──────┬───────┘             │  indicators)    │
                  │                     └────────┬────────┘
                  ▼                              │
           ┌──────────────┐                      │
           │ ml-predict    │◄────────────────────┘
           │ edge function │       Signal[]
           │ (logistic reg)│          │
           └──────┬───────┘          │
                  │                  ▼
                  │        ┌─────────────────┐
                  └───────→│  backtest.ts    │
                  MLPred   │  combineSignals │
                           └────────┬────────┘
                                    ▼
                           ┌─────────────────┐
                           │ Recommendation   │
                           │ (side, score,    │
                           │  SL, TP, ATR)    │
                           └────────┬────────┘
                                    ▼
                     ┌──────────────────────────┐
                     │ Dashboard.tsx + PriceChart│
                     │ (candles + overlays)      │
                     └──────────────────────────┘
```

## Table of Contents

- [Overview](#overview)
- [Role-Based Access](#role-based-access)
- [Supported Markets](#supported-markets)
- [Multi-Timeframe Analysis](#multi-timeframe-analysis)
- [Pattern Recognition Engine](#pattern-recognition-engine)
- [Market Structure Engine](#market-structure-engine)
- [Smart Money Concepts](#smart-money-concepts)
- [Fibonacci Engine](#fibonacci-engine)
- [Indicator Engine](#indicator-engine)
- [AI Intelligence Layer](#ai-intelligence-layer)
- [Strategy Library](#strategy-library)
- [Risk Management](#risk-management)
- [Backtesting](#backtesting)
- [Explainable AI](#explainable-ai)
- [Architecture Requirements](#architecture-requirements)
- [Development Roadmap](#development-roadmap)

---

## Overview

**Quantum Intelligence** is an AI-powered trading intelligence platform for paper trading. You are a Senior Quantitative Researcher, Institutional Trader, AI Engineer, Machine Learning Engineer, Risk Manager, Financial Data Scientist, and Trading Systems Architect — building the comprehensive AI Trading Intelligence Platform.

The system analyzes, learns from, and simulates trading across a large universe of markets, similar to TradingView. It combines traditional technical analysis with machine learning, reinforcement learning, and explainable AI to produce actionable trading insights.

---

## Role-Based Access

| Role | Permissions |
|------|------------|
| **User** | View markets, signals, recommendations, use Kinetic Coach, manage paper trading positions |
| **Admin** | All user permissions + manage ML models, retrain strategies, view system metrics, manage CMS content |

### Context Management System (CMS)

A full CMS for managing:
- Educational content and trading articles
- Strategy documentation and guides
- System announcements and updates
- Indicator and pattern definitions
- User feedback and FAQs

---

## Supported Markets

### Forex

All major, minor, and relevant exotic pairs:
- **Majors**: EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, NZD/USD, USD/CAD
- **Minors**: EUR/GBP, EUR/JPY, GBP/JPY, AUD/JPY, CHF/JPY, EUR/AUD, EUR/CHF, GBP/CHF, AUD/CAD, NZD/CAD, CAD/JPY
- **Exotics**: All available pairs from the data provider

### Cryptocurrencies

- **Major**: BTC/USD, ETH/USD, SOL/USD, XRP/USD, BNB/USD, ADA/USD, DOGE/USD
- **Altcoins**: AVAX/USD, LINK/USD, DOT/USD, MATIC/USD, LTC/USD, BCH/USD, XLM/USD, UNI/USD
- All available cryptocurrency pairs from supported exchanges

### Commodities

- Gold (XAU/USD), Silver (XAG/USD)
- Crude Oil, Brent Oil, Natural Gas
- Copper, Platinum, Palladium

### Indices

- S&P 500, NASDAQ 100, Dow Jones
- FTSE 100, DAX, CAC 40
- Nikkei 225, Hang Seng, ASX 200
- Major global indices

### Stocks

Support for thousands of stocks from:
- NYSE, NASDAQ, LSE
- TSX, Euronext
- Other supported exchanges

---

## Multi-Timeframe Analysis

Analyze across all standard timeframes:

| Timeframe | Label |
|-----------|-------|
| 1 Minute | 1m |
| 3 Minute | 3m |
| 5 Minute | 5m |
| 15 Minute | 15m |
| 30 Minute | 30m |
| 1 Hour | 1h |
| 4 Hour | 4h |
| Daily | 1d |
| Weekly | 1w |
| Monthly | 1M |

The AI must **compare lower and higher timeframes before making decisions**, ensuring confluence across multiple resolutions.

---

## Pattern Recognition Engine

### Chart Patterns

| Pattern | Type |
|---------|------|
| Head and Shoulders | Reversal |
| Inverse Head and Shoulders | Reversal |
| Double Top | Reversal (Bearish) |
| Double Bottom | Reversal (Bullish) |
| Triple Top | Reversal (Bearish) |
| Triple Bottom | Reversal (Bullish) |
| Bull Flag | Continuation |
| Bear Flag | Continuation |
| Pennant | Continuation |
| Ascending Triangle | Continuation (Bullish) |
| Descending Triangle | Continuation (Bearish) |
| Symmetrical Triangle | Breakout |
| Rectangle | Consolidation |
| Cup and Handle | Continuation (Bullish) |
| Inverse Cup and Handle | Continuation (Bearish) |
| Wedge (Rising/Falling) | Reversal/Continuation |
| Channels | Trend |

### Candlestick Patterns

| Pattern | Type |
|---------|------|
| Hammer | Bullish Reversal |
| Inverted Hammer | Bullish Reversal |
| Shooting Star | Bearish Reversal |
| Hanging Man | Bearish Reversal |
| Bullish Engulfing | Bullish Reversal |
| Bearish Engulfing | Bearish Reversal |
| Morning Star | Bullish Reversal |
| Evening Star | Bearish Reversal |
| Doji | Indecision |
| Dragonfly Doji | Bullish Reversal |
| Gravestone Doji | Bearish Reversal |
| Three White Soldiers | Bullish Continuation |
| Three Black Crows | Bearish Continuation |
| Tweezer Top | Bearish Reversal |
| Tweezer Bottom | Bullish Reversal |
| Inside Bar | Consolidation |
| Outside Bar | Volatility Expansion |

---

## Market Structure Engine

Detect and classify market structure states:

- **Higher High (HH)** — Price exceeds previous swing high
- **Higher Low (HL)** — Price holds above previous swing low
- **Lower High (LH)** — Price fails to reach previous swing high
- **Lower Low (LL)** — Price breaks below previous swing low
- **Break of Structure (BOS)** — Trend-confirming break of key level
- **Change of Character (CHoCH)** — Trend reversal signal
- **Trend Continuation** — Existing trend remains intact
- **Trend Reversal** — Trend direction changes
- **Range Markets** — Price oscillates between defined boundaries
- **Consolidation** — Price contracts in a tight range
- **Expansion Phases** — Volatility breakout from consolidation

---

## Smart Money Concepts (SMC)

Institutional-grade market analysis:

| Concept | Description |
|---------|-------------|
| **Order Blocks** | Large institutional limit orders creating support/resistance |
| **Fair Value Gaps (FVG)** | Price inefficiency areas between 3 consecutive candles |
| **Liquidity Pools** | Clusters of stop-loss orders above highs / below lows |
| **Liquidity Sweeps** | Price briefly moves to grab liquidity before reversing |
| **Equal Highs / Equal Lows** | Double-touch levels indicating liquidity buildup |
| **Premium Zones** | Overbought areas above fair value |
| **Discount Zones** | Oversold areas below fair value |
| **Breaker Blocks** | Failed order blocks that flip polarity |
| **Mitigation Blocks** | Order blocks that have been tested and held |
| **Institutional Order Flow** | Tracking large player positioning |

---

## Fibonacci Engine

### Retracement Levels

| Level | Significance |
|-------|-------------|
| 23.6% | Minor retracement |
| 38.2% | Common retracement |
| 50.0% | Psychological level |
| 61.8% | **Golden Ratio** — primary retracement |
| 78.6% | Deep retracement |

### Extension Levels

| Level | Significance |
|-------|-------------|
| 127.2% | Standard extension |
| 161.8% | **Golden Extension** — primary target |
| 261.8% | Extended target |

Provides **confluence analysis** between Fibonacci levels and other signals (SMC zones, order blocks, support/resistance).

---

## Indicator Engine

### Trend Indicators

- **SMA** — Simple Moving Average
- **EMA** — Exponential Moving Average
- **WMA** — Weighted Moving Average
- **HMA** — Hull Moving Average
- **VWMA** — Volume Weighted Moving Average

### Momentum Indicators

- **RSI** — Relative Strength Index
- **MACD** — Moving Average Convergence Divergence
- **Stochastic** — %K / %D oscillator
- **Stochastic RSI** — RSI applied to Stochastic
- **ROC** — Rate of Change
- **Momentum** — Raw momentum oscillator

### Volatility Indicators

- **ATR** — Average True Range
- **Bollinger Bands** — Volatility bands with %B and width
- **Keltner Channels** — ATR-based volatility channels
- **Donchian Channels** — Highest-high / Lowest-low channels

### Volume Indicators

- **OBV** — On-Balance Volume
- **VWAP** — Volume Weighted Average Price
- **MFI** — Money Flow Index
- **Accumulation Distribution** — Volume + price pressure
- **Volume Profile** — Volume at price levels (HVNodes)

### Additional Indicators

- **ADX** — Average Directional Index (trend strength)
- **CCI** — Commodity Channel Index
- **Ichimoku Cloud** — Complete trend/strength/support system
- **Parabolic SAR** — Stop and Reverse
- **Pivot Points** — Classic, Fibonacci, Woodie, Camarilla

---

## AI Intelligence Layer

### Feature Engineering

Create hundreds of engineered features from:
- Technical indicators (all of the above)
- Price action (momentum, volatility, distribution)
- Market structure (HH/HL/LH/LL, BOS, CHoCH)
- Smart Money Concepts (order blocks, FVGs, liquidity)
- Volume behavior (accumulation, distribution, divergence)
- Volatility behavior (regime detection, expansion/contraction)

### Machine Learning Models

| Model | Type | Application |
|-------|------|-------------|
| **XGBoost** | Gradient Boosting | Classification/Regression |
| **LightGBM** | Gradient Boosting | Fast training on large data |
| **Random Forest** | Ensemble | Robust baseline predictions |
| **CatBoost** | Gradient Boosting | Categorical feature handling |
| **LSTM** | Recurrent Neural Network | Sequence prediction |
| **GRU** | Recurrent Neural Network | Efficient sequence modeling |
| **Transformer** | Attention-based | Multi-market context modeling |

### Reinforcement Learning

| Algorithm | Type | Application |
|-----------|------|-------------|
| **PPO** | Policy Gradient | Continuous trading decisions |
| **SAC** | Off-Policy | Exploration-efficient learning |
| **DQN** | Value-Based | Discrete action spaces |

The RL agent learns from:
- **Wins** — Reward positive outcomes
- **Losses** — Penalize negative outcomes
- **Drawdowns** — Risk-aware optimization
- **Risk-adjusted returns** — Sharpe ratio as reward

---

## Strategy Library

| Strategy | Type | Selection Criteria |
|----------|------|-------------------|
| **Trend Following** | Momentum | Strong ADX + trend structure |
| **Breakout Trading** | Momentum | Volatility expansion + level break |
| **Mean Reversion** | Contrarian | RSI extremes + Bollinger band touch |
| **Momentum Trading** | Trend | RSI/Stochastic alignment |
| **Swing Trading** | Medium-term | Multi-timeframe confluence |
| **Scalping** | Short-term | Low-latency micro-structure |
| **Position Trading** | Long-term | Macro trends + fundamental context |
| **Statistical Arbitrage** | Neutral | Cointegrated pairs |
| **Pairs Trading** | Neutral | Correlation + spread mean reversion |
| **Volatility Trading** | Non-directional | Volatility regime + ATR expansion |
| **Smart Money Strategies** | Institutional | SMC concepts + order flow |
| **Hybrid AI Strategies** | Adaptive | ML-selected strategy combination |

The AI must **dynamically select the most appropriate strategy** based on current market conditions.

---

## Risk Management

| Feature | Description |
|---------|-------------|
| **Dynamic Position Sizing** | Adjust size based on volatility and account equity |
| **Maximum Daily Loss** | Hard stop on daily drawdown |
| **Maximum Drawdown Limits** | Portfolio-level drawdown protection |
| **Portfolio Exposure Limits** | Aggregate risk across all positions |
| **Correlation Management** | Avoid overexposure to correlated assets |
| **Volatility-Adjusted Stops** | ATR-based dynamic stop placement |
| **Risk/Reward Analysis** | Minimum R:R ratio enforcement |
| **Kelly Criterion** | Optimal position sizing for long-term growth |

---

## Backtesting

| Feature | Description |
|---------|-------------|
| **Walk-Forward Testing** | Rolling optimization + out-of-sample validation |
| **Monte Carlo Simulations** | Randomized path generation for robustness testing |
| **Out-of-Sample Validation** | Chronological train/test split (no lookahead) |
| **Sharpe Ratio** | Risk-adjusted return metric |
| **Sortino Ratio** | Downside-risk-adjusted return |
| **Profit Factor** | Gross profit / gross loss |
| **Win Rate** | Percentage of profitable trades |
| **Drawdown Analysis** | Maximum peak-to-trough decline |

---

## Explainable AI (XAI)

For every trade signal, provide:

1. **Why the trade was taken** — Market condition rationale
2. **Indicators involved** — Which indicators triggered
3. **Patterns detected** — Chart patterns identified
4. **Confidence score** — 0–1 confidence level
5. **Risk assessment** — Current market risk level
6. **Stop loss reasoning** — Why SL placed at specific level
7. **Take profit reasoning** — Target level justification
8. **Alternative scenarios** — What would invalidate the trade

---

## Architecture Requirements

| Requirement | Standard |
|-------------|----------|
| **Code Quality** | Production-ready, clean architecture, SOLID principles |
| **Design Pattern** | Modular services, dependency injection |
| **Backend** | FastAPI (Python) for ML services, Supabase Edge Functions for serverless |
| **Database** | PostgreSQL (primary), Redis (caching + rate limiting) |
| **Real-time** | WebSockets for live market data |
| **Containerization** | Docker for reproducible deployments |
| **Observability** | Comprehensive logging, monitoring, alerting |
| **Testing** | Unit tests, integration tests, backtest validation |
| **Security** | Security-first design, JWT auth, RLS, API keys |

---

## Development Roadmap

### Phase 1: Foundation (Current)
- ✅ React + TypeScript frontend with Vite
- ✅ Supabase auth + database
- ✅ Binance crypto data integration
- ✅ Core technical indicators
- ✅ 8 strategy implementations
- ✅ Basic ML prediction (logistic regression)
- ✅ Live market data via WebSocket
- ✅ AI Coach (Gemini integration)

### Phase 2: Multi-Market Expansion
- [ ] Add Forex data provider (OANDA / FXCM API)
- [ ] Add Stocks/Indices/Commodities data provider (Polygon / IEX / Yahoo Finance)
- [ ] Universal market type system (crypto, forex, stocks, indices, commodities)
- [ ] Expanded timeframe support (3m, 5m, 30m, 1w, 1M)
- [ ] Multi-exchange/multi-broker abstraction layer

### Phase 3: Pattern Recognition Expansion
- [ ] Complete candlestick pattern library (17+ patterns)
- [ ] Extended chart pattern detection (Triple Tops/Bottoms, Cup & Handle, Wedges, Channels)
- [ ] Market structure engine (HH/HL/LH/LL, BOS, CHoCH)
- [ ] Smart Money Concepts (order blocks, FVGs, liquidity pools)
- [ ] Volume Profile and Market Profile

### Phase 4: Indicator Engine Expansion
- [ ] Additional moving averages (WMA, HMA, VWMA)
- [ ] Stochastic / Stochastic RSI
- [ ] ADX, CCI, Ichimoku Cloud
- [ ] Keltner Channels, Donchian Channels
- [ ] Volume indicators (OBV, MFI, Accum/Dist, Volume Profile)
- [ ] Pivot Points (Classic, Fibonacci, Woodie, Camarilla)

### Phase 5: Advanced AI/ML
- [ ] Feature engineering pipeline (hundreds of features)
- [ ] XGBoost/LightGBM model integration
- [ ] LSTM/GRU sequence models
- [ ] Transformer architecture for multi-market context
- [ ] Reinforcement Learning (PPO, SAC, DQN)
- [ ] Model versioning and A/B testing framework

### Phase 6: Strategy & Risk
- [ ] 12+ strategy implementations
- [ ] Dynamic strategy selection based on market regime
- [ ] Advanced risk management (Kelly Criterion, correlation management)
- [ ] Full backtesting suite (walk-forward, Monte Carlo)
- [ ] Portfolio-level analytics

### Phase 7: Platform & UX
- [ ] Admin dashboard with system metrics
- [ ] Content Management System (CMS)
- [ ] Explainable AI trade cards
- [ ] Performance analytics and reporting
- [ ] Watchlists and alerts
- [ ] Multi-language support

### Phase 8: Production Hardening
- [ ] Comprehensive test coverage
- [ ] Docker containerization
- [ ] Redis caching layer
- [ ] Monitoring and alerting (Prometheus/Grafana)
- [ ] Performance optimization
- [ ] Security audit

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | React 18, TypeScript, TailwindCSS, Lightweight Charts |
| **Backend** | Supabase Edge Functions (Deno), FastAPI (Python) |
| **Database** | Supabase PostgreSQL |
| **Cache** | Redis |
| **Auth** | Supabase Auth (JWT) |
| **ML/AI** | Python (XGBoost, PyTorch, TensorFlow), Deno (logistic regression) |
| **Real-time** | WebSockets |
| **Infrastructure** | Docker, Supabase |

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/your-org/quantum-intelligence.git
cd quantum-intelligence

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials and API keys

# Start development server
npm run dev

# Build for production
npm run build
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `GEMINI_API_KEY` | Google Gemini API key (for Kinetic Coach) |
| `ML_SERVICE_API_KEY` | ML service API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (for edge functions) |

---

## License

MIT License — see [LICENSE](LICENSE) for details.

