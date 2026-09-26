# Quantum — Autonomous Trading Intelligence Platform
## Architecture, UI & Build Specification v2.0

---

> *Critical Update: Quantum is not a manual trading terminal. It is a fully autonomous trading intelligence system that analyzes markets, makes decisions, and executes paper trades without human intervention. The user is an overseer, not an operator. The system trades while you sleep, while you work, while you are with your kid. Your job is to configure it, monitor it, and trust it — because you built it to be trustworthy.*

---

## 1. The Autonomous Philosophy

### 1.1 What "Autonomous" Means

Quantum does not suggest trades. It **takes** trades. The full pipeline runs automatically:

```
Market Data Arrives
    ↓
Data Quality Validated Automatically
    ↓
All Engines Run Automatically
    ↓
Master Decision Engine Decides Automatically
    ↓
Risk Gate Validates Automatically
    ↓
Portfolio Gate Validates Automatically
    ↓
Paper Order Created Automatically
    ↓
Simulated Fill Executed Automatically
    ↓
Position Monitored Automatically (SL/TP/Trailing)
    ↓
Position Closed Automatically
    ↓
Trade Review Generated Automatically
    ↓
Knowledge Updated Automatically
    ↓
Alert Sent to User if Significant Event
```

**The human is not in the execution loop.** The human sets the guardrails, monitors the dashboard, and intervenes only when the system asks for help or when something goes wrong.

### 1.2 Why Autonomous?

Because the mistakes that cost me thousands happened when **I** was at the keyboard:
- I hesitated on a valid setup and missed the entry
- I overrode the system because "this time is different"
- I revenge-traded after a loss
- I moved my stop because I couldn't accept the loss
- I took a setup outside kill zones because I was bored
- I ignored the higher timeframe because the lower timeframe looked "so good"
- I traded while emotional, while tired, while distracted by my kid

**The system does not get emotional. The system does not get tired. The system does not get FOMO. The system follows the rules.**

### 1.3 The Human Role: Overseer, Not Operator

| Operator (Old Way) | Overseer (Quantum Way) |
|---|---|
| Watches charts all day | Checks dashboard when convenient |
| Manually clicks "Buy" | Reviews what the system did |
| Decides position size | Configured risk profile once |
| Moves stop loss manually | Trusts the system's stop placement |
| Revenge trades after loss | System pauses automatically, sends alert |
| Trades outside kill zones | System only trades during configured windows |
| Forgets to review losses | System generates review automatically |
| Sizes on confidence | System sizes on math |
| Emotional decision-making | Evidence-based, rule-based execution |

**The user configures, monitors, reviews, and intervenes. The system executes.**

---

## 2. System Architecture — Autonomous Mode

### 2.1 High-Level Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Quantum AUTONOMOUS PLATFORM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         COMMAND CENTER (Web)                         │   │
│   │  React + Vite | Monitoring Dashboard | Configuration Panel          │   │
│   │  Real-time Alerts | Decision Log | Performance Analytics            │   │
│   └─────────────────────────────┬───────────────────────────────────────┘   │
│                                 │ HTTPS / WebSocket                         │
│                                 ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         API GATEWAY (Fastify)                        │   │
│   │  Auth | RBAC | Configuration | State Management | Alert Dispatch     │   │
│   └─────────────────────────────┬───────────────────────────────────────┘   │
│                                 │                                           │
│           ┌─────────────────────┼─────────────────────┐                     │
│           ▼                     ▼                     ▼                     │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│   │  WS Server   │    │  Scheduler   │    │  Ingestion   │               │
│   │  (Real-time  │    │  (Cron/      │    │  Worker      │               │
│   │   push)      │    │   Queue)     │    │  (EODHD)     │               │
│   └──────────────┘    └──────┬───────┘    └──────────────┘               │
│                              │                                            │
│                              ▼                                            │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │              AUTONOMOUS DECISION ORCHESTRATOR                        │   │
│   │  State Machine | Pipeline Trigger | Queue Manager | Watchdog        │   │
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
│   │  Supabase PostgreSQL | TimescaleDB (Candles) | Redis (State/Queue) │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     EXTERNAL INTEGRATIONS                            │   │
│   │  EODHD (Primary) | Binance (Crypto) | Email/Push (Alerts)          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Service Boundaries

| Service | Runtime | Responsibility |
|---------|---------|---------------|
| `web` | React + Vite | Command center dashboard, configuration, monitoring, alerts, decision log, performance analytics |
| `api` | Node.js + Fastify | Auth, RBAC, configuration persistence, state management, alert dispatch, manual overrides |
| `scheduler` | Node.js + BullMQ | Cron jobs, queue management, pipeline triggers, state machine transitions |
| `orchestrator` | Node.js + Fastify | Autonomous decision pipeline, engine registry, state machine, watchdog |
| `ws` | Node.js + ws | Real-time push: decisions, fills, position updates, alerts, system health |
| `ingest` | Node.js worker | EODHD REST polling, WebSocket streaming, normalization, quality checks |
| `ml` | Node.js/ONNX | Feature engineering, model inference, drift detection |

### 2.3 The State Machine

The autonomous system operates as a state machine:

```
                    ┌─────────────┐
                    │   OFFLINE   │
                    └──────┬──────┘
                           │ User starts system
                           ▼
                    ┌─────────────┐
                    │   IDLE      │
                    │  (waiting   │
                    │   for data) │
                    └──────┬──────┘
                           │ Data received
                           ▼
                    ┌─────────────┐
                    │  MONITORING │
                    │  (engines   │
                    │   running)  │
                    └──────┬──────┘
                           │ Decision generated
                           ▼
              ┌────────────────────────┐
              │       DECIDING         │
              │  (risk + portfolio     │
              │   validation)          │
              └──────┬─────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌────────┐  ┌────────┐  ┌────────┐
   │VETOED  │  │WATCH   │  │EXECUTE │
   │NO_TRADE│  │(wait)  │  │(order) │
   └────┬───┘  └────┬───┘  └────┬───┘
        │           │           │
        ▼           ▼           ▼
   ┌────────┐  ┌────────┐  ┌────────┐
   │  IDLE  │  │MONITOR-│  │POSITION │
   │        │  │  ING   │  │  OPEN   │
   └────────┘  └────────┘  └────┬───┘
                                │ SL/TP hit
                                ▼
                           ┌────────┐
                           │ CLOSED │
                           └────┬───┘
                                │ Review generated
                                ▼
                           ┌────────┐
                           │  IDLE  │
                           └────────┘
```

**State Transitions are Automatic.** No human clicks a button to move from MONITORING to DECIDING. The scheduler triggers the pipeline every N seconds or every new candle.

---

## 3. The Autonomous Execution Flow

### 3.1 Trigger Mechanisms

The decision pipeline triggers automatically on:

1. **Candle Close** — Primary trigger. Every time a candle closes on the execution timeframe, the pipeline runs.
2. **Scheduled Interval** — Fallback. Every 60 seconds if no new candle (for low-liquidity periods).
3. **Liquidity Event** — Reactive. If a liquidity sweep is detected mid-candle, the pipeline runs immediately.
4. **Structure Event** — Reactive. If BOS or MSS is detected mid-candle, the pipeline runs immediately.
5. **Manual Trigger** — For testing/backtesting only. Admin can trigger a manual run.

### 3.2 The Full Autonomous Pipeline

```typescript
// apps/scheduler/src/pipeline.ts

class AutonomousPipeline {
  private state: SystemState = 'IDLE';
  private activeSymbols: string[] = [];
  private config: AutonomousConfig;

  async start(): Promise<void> {
    // 1. Load configuration
    this.config = await this.loadConfig();
    this.activeSymbols = this.config.symbols;

    // 2. Start cron jobs
    this.scheduleCandleCloseTriggers();
    this.scheduleHealthChecks();
    this.schedulePortfolioSnapshots();

    // 3. Start reactive listeners
    this.subscribeToLiquidityEvents();
    this.subscribeToStructureEvents();

    // 4. Set state
    this.state = 'MONITORING';
    await this.broadcastState();
  }

  async onCandleClose(symbol: string, timeframe: string, candle: Candle): Promise<void> {
    if (this.state !== 'MONITORING') return;

    // Check if symbol is in active watchlist
    if (!this.activeSymbols.includes(symbol)) return;

    // Check kill zone
    if (!this.isInKillZone()) {
      this.logSkip(symbol, 'Outside kill zone');
      return;
    }

    // Check circuit breakers
    const circuitBreaker = await this.checkCircuitBreakers();
    if (circuitBreaker.triggered) {
      await this.triggerCircuitBreaker(circuitBreaker);
      return;
    }

    // Run the full pipeline
    await this.runDecisionPipeline(symbol, timeframe, candle);
  }

  private async runDecisionPipeline(symbol: string, timeframe: string, candle: Candle): Promise<void> {
    this.state = 'DECIDING';
    await this.broadcastState();

    try {
      // 1. Data Quality
      const quality = await dataQualityEngine.check(symbol, timeframe, candle);
      if (!quality.passed) {
        await this.logDecision(symbol, 'NO_TRADE', 0, 'Data quality failed');
        return;
      }

      // 2. Market Context
      const context = await marketContextEngine.build(symbol, timeframe, candle);

      // 3. Gather Evidence (parallel)
      const evidence = await Promise.all([
        structureEngine.analyze({ symbol, timeframe, candle, context }),
        liquidityEngine.analyze({ symbol, timeframe, candle, context }),
        patternEngine.analyze({ symbol, timeframe, candle, context }),
        indicatorEngine.analyze({ symbol, timeframe, candle, context }),
        regimeEngine.analyze({ symbol, timeframe, candle, context }),
        strategyEngine.analyze({ symbol, timeframe, candle, context }),
        historicalSimilarityEngine.analyze({ symbol, timeframe, candle, context }),
        mlEngine.analyze({ symbol, timeframe, candle, context })
      ]);

      // 4. Master Decision
      const decision = await masterDecisionEngine.decide({
        symbol, timeframe, candle, context, evidence
      });

      // 5. Risk Gate (automatic veto)
      const riskCheck = await riskEngine.validate(decision);
      if (riskCheck.veto) {
        decision.decisionType = 'NO_TRADE';
        decision.reason = `Risk veto: ${riskCheck.reason}`;
        await this.persistDecision(decision);
        await this.sendAlert('risk_veto', decision);
        return;
      }

      // 6. Portfolio Gate (automatic veto)
      const portfolioCheck = await portfolioEngine.validate(decision);
      if (portfolioCheck.veto) {
        decision.decisionType = 'NO_TRADE';
        decision.reason = `Portfolio veto: ${portfolioCheck.reason}`;
        await this.persistDecision(decision);
        await this.sendAlert('portfolio_veto', decision);
        return;
      }

      // 7. Execute if BUY/SELL
      if (decision.decisionType === 'BUY' || decision.decisionType === 'SELL') {
        await this.executePaperTrade(decision);
      } else {
        await this.persistDecision(decision);
        this.logDecision(symbol, decision.decisionType, decision.confidence, decision.explanation);
      }

    } catch (error) {
      await this.handlePipelineError(symbol, error);
    } finally {
      this.state = 'MONITORING';
      await this.broadcastState();
    }
  }

  private async executePaperTrade(decision: TradeDecision): Promise<void> {
    // Create order
    const order = await paperTradingEngine.createOrder(decision);

    // Simulate fill
    const fill = await paperTradingEngine.simulateFill(order);

    // Open position
    const position = await paperTradingEngine.openPosition(fill);

    // Persist
    await this.persistDecision(decision);
    await this.persistPosition(position);

    // Broadcast to user
    await this.broadcastDecision(decision);
    await this.broadcastPosition(position);
    await this.sendAlert('trade_executed', { decision, position });

    // Log
    this.logDecision(
      decision.symbol, 
      decision.decisionType, 
      decision.confidence, 
      `Auto-executed: ${decision.side} ${decision.symbol} at ${fill.price}`
    );
  }
}
```

### 3.3 Position Lifecycle (Automatic)

```
Position Opened
    ↓
Every new candle:
    ├── Check Stop Loss
    │   └── If hit → Close position, realize loss, generate review
    ├── Check Take Profit 1
    │   └── If hit → Partial close (e.g., 50%), move SL to breakeven
    ├── Check Take Profit 2
    │   └── If hit → Partial close (e.g., 30%), trail remaining
    ├── Check Take Profit 3
    │   └── If hit → Close remainder
    ├── Update Trailing Stop (if activated)
    │   └── If price moves favorably, move SL to lock profit
    └── Update Unrealized P&L
        └── Broadcast to dashboard
```

**All of this happens automatically. The user sees it on the dashboard in real-time.**

---

## 4. The Command Center UI

### 4.1 Design Philosophy

The UI is a **mission control center**, not a trading terminal. Think:
- **NASA Mission Control** — Operators monitor systems, they don't fly the rocket
- **Datadog Dashboard** — Metrics, alerts, health, all real-time
- **Bloomberg Terminal** — Dense information, professional, no fluff

**Key principles:**
- **Density over whitespace** — Every pixel shows useful data
- **Color is semantic** — Green = good/profit, Red = bad/loss, Yellow = warning, Blue = information
- **Alerts are prominent** — Critical events demand attention
- **History is accessible** — Every decision, every trade, every alert is logged and searchable
- **Configuration is powerful** — The user has fine-grained control over what the system does

### 4.2 The Dashboard (Primary View)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Quantum COMMAND CENTER                              [🟢 SYSTEM ACTIVE]   │
│  Autonomous Trading Intelligence Platform                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  SYSTEM STATUS BAR                                                   │   │
│  │  [🟢 RUNNING]  Session: NY Open  |  Kill Zone: ACTIVE  |  Next:     │   │
│  │  London Close in 2h 15m  |  Data Quality: ✅  |  Model Drift: ✅   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐         │
│  │  Portfolio  │ │   Today's   │ │   Win Rate  │ │  System     │         │
│  │    Heat     │ │    P&L      │ │   (30d)     │ │   Uptime    │         │
│  │   [████░░]  │ │   +$124     │ │    62%      │ │   14d 3h    │         │
│  │   4.2/6%    │ │   +1.2%     │ │   24W 15L   │ │   99.2%     │         │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘         │
│                                                                             │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │      ACTIVE POSITIONS       │  │        DECISION LOG (Live)          │  │
│  │                             │  │                                     │  │
│  │  EUR/USD  Long  +$45  [▶]  │  │  14:32  🟢 BUY  EUR/USD  78%      │  │
│  │  GBP/USD  Long  -$12  [▶]  │  │  14:28  🟡 WATCH GBP/USD  68%     │  │
│  │  BTC/USD  Short +$89  [▶]  │  │  14:15  ⚪ NO_TRADE USD/JPY       │  │
│  │                             │  │  14:10  🟢 BUY  BTC/USD   82%     │  │
│  │  [View All Positions →]     │  │  13:55  ⚪ NO_TRADE EUR/GBP      │  │
│  └─────────────────────────────┘  └─────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │      PERFORMANCE CHART      │  │           ALERT FEED               │  │
│  │  [Equity Curve — 30 Days]   │  │  🔴 CRITICAL: Daily loss at 2.8% │  │
│  │                             │  │      (Limit: 3%) — 1 trade away   │  │
│  │    ╱╲                       │  │  🟡 WARNING: ATR elevated on       │  │
│  │   ╱  ╲    ╱╲               │  │      GBP/USD — size reduced 20%   │  │
│  │  ╱    ╲  ╱  ╲  ╱╲         │  │  🟢 INFO: EUR/USD target 1 hit    │  │
│  │ ╱      ╲╱    ╲╱  ╲        │  │  🟢 INFO: New knowledge node:     │  │
│  │╱                  ╲        │  │      "BOS+Sweep+OB in London"     │  │
│  │                            │  │  🔴 CRITICAL: Model drift detected │  │
│  └─────────────────────────────┘  └─────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  QUICK CONTROLS                                                      │   │
│  │  [⏸ Pause System]  [🛑 Emergency Stop]  [⚙ Configuration]          │   │
│  │  [📊 View Terminal]  [📓 Open Journal]  [🔬 Research Lab]          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 The Terminal View (Chart Monitoring)

The terminal still exists, but it's for **monitoring what the system is doing**, not for manual trading.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [◀ Back to Dashboard]  TERMINAL MONITOR  [EUR/USD] [15m] [🟢 LIVE]       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────────────────────────────┐  ┌──────────┐  │
│  │  HIGHER TF   │  │         EXECUTION CHART              │  │ LIVE     │  │
│  │    (4H)      │  │   (15m — System Monitoring)          │  │ DECISION │  │
│  │              │  │                                      │  │ PANEL    │  │
│  │  [BULLISH]   │  │  ═══════════════ Trend Line          │  │          │  │
│  │  Bias Arrow  │  │  ███████████████ Order Block         │  │ Last:    │  │
│  │  BOS: 3c     │  │  ░░░░░░░░░░░░░░ FVG                  │  │ BUY      │  │
│  │  ago         │  │  ─────────────── Liquidity Sweep     │  │ 14:32    │  │
│  │              │  │  ╔═══════════════ Entry Zone          │  │ Conf:78% │  │
│  │              │  │  ║  [POSITION LINE: +$45]            │  │          │  │
│  │              │  │  ║  SL: 1.0842  |  TP1: 1.0875       │  │ Next:    │  │
│  │              │  │  ║  (Auto-managed by system)          │  │ WATCH    │  │
│  │              │  │  ╚═══════════════                    │  │ 68%      │  │
│  └──────────────┘  └──────────────────────────────────────┘  └──────────┘  │
│                                                                             │
│  ┌──────────────┐  ┌──────────────────────────────────────────────────────┐  │
│  │  LOWER TF    │  │           SYSTEM ACTIVITY LOG                        │  │
│  │    (5m)      │  │                                                      │  │
│  │              │  │  14:32:15  🟢 Position opened: EUR/USD Long @ 1.0850│  │
│  │  [Entry      │  │  14:32:15  📝 Stop set: 1.0842 (13 pips, 1.2% risk) │  │
│  │   Confirmed] │  │  14:32:15  📝 Target 1: 1.0875 (1:2.5 R:R)          │  │
│  │              │  │  14:28:00  🟡 WATCH signal: GBP/USD (waiting conf.)  │  │
│  │              │  │  14:15:00  ⚪ NO_TRADE: USD/JPY (HTF mismatch)       │  │
│  │              │  │  14:10:00  🟢 Position opened: BTC/USD Short @ 64200 │  │
│  └──────────────┘  └──────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key difference from manual terminal:**
- No "Execute" button
- Position lines show "Auto-managed by system"
- Activity log shows what the system did and when
- Live decision panel shows last decision and next expected decision

### 4.4 The Configuration Panel

This is where the user controls the autonomous system:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SYSTEM CONFIGURATION                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  GENERAL SETTINGS                                                    │   │
│  │  [🟢 Autonomous Trading: ENABLED]  [⏸ Pause]  [🛑 Emergency Stop]  │   │
│  │  Active Symbols: [EUR/USD ✓] [GBP/USD ✓] [BTC/USD ✓] [ETH/USD ✗]  │   │
│  │  Primary Timeframe: [15m ▼]  Higher TF: [4H ▼]  Lower TF: [5m ▼]  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  KILL ZONES (When system is allowed to trade)                       │   │
│  │  [✓] London Open (8:00-10:00 GMT)                                  │   │
│  │  [✓] London-NY Overlap (14:30-16:30 GMT)                           │   │
│  │  [✓] NY Open (14:30-16:30 GMT)                                     │   │
│  │  [✗] Asian Session (0:00-8:00 GMT) — Observation only              │   │
│  │  [✗] Friday After 18:00 GMT — Close positions, no new trades       │   │
│  │  [✗] Sunday Evening — Low liquidity, no trades                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  RISK PROFILE                                                        │   │
│  │  Risk per Trade: [1.5% ▼]  Max Daily Loss: [3% ▼]                  │   │
│  │  Max Portfolio Heat: [6% ▼]  Max Open Positions: [5 ▼]             │   │
│  │  Max Correlated: [3 ▼]  Consecutive Loss Pause: [3 ▼]              │   │
│  │  Drawdown Pause: [10% ▼]  Cooling Off Period: [4h ▼]               │   │
│  │  [✓] Auto-reduce size on elevated ATR                              │   │
│  │  [✓] Auto-trail stop after TP1 hit                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  STRATEGY SELECTION                                                  │   │
│  │  [✓] BOS + Liquidity Sweep + OB Mitigation (Primary)               │   │
│  │  [✓] MSS + FVG Fill + Displacement (Counter-trend, reduced size)   │   │
│  │  [✗] Range Extreme + Sweep + Reversal (Disabled by user)           │   │
│  │  [✓] Session Open + Momentum                                       │   │
│  │  [✓] Auto-select strategy based on regime                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ALERTS & NOTIFICATIONS                                              │   │
│  │  [✓] Trade executed (push notification)                             │   │
│  │  [✓] Position closed (push + email)                                │   │
│  │  [✓] Circuit breaker triggered (push + email + SMS)                │   │
│  │  [✓] Daily loss limit approaching 80% (push)                       │   │
│  │  [✓] Model drift detected (email)                                  │   │
│  │  [✗] Every NO_TRADE decision (too noisy)                           │   │
│  │  [✓] Daily summary email (19:00 GMT)                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  FAMILY MODE                                                         │   │
│  │  [✓] Enable Family Mode                                            │   │
│  │  Effect: Risk per trade reduced to 1%, max positions: 3,           │   │
│  │  conservative strategy selection, voice alerts enabled               │   │
│  │  Schedule: [Weekends ✓] [Weekdays 17:00-21:00 ✓]                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                              [💾 Save Configuration]                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.5 The Decision Log

Every decision the system makes is logged and searchable:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DECISION LOG                                          [🔍 Search] [Filter ▼]│
├─────────────────────────────────────────────────────────────────────────────┤
│  Date       Time     Symbol    Decision  Conf  R:R   Result    Status      │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Sep 03     14:32    EUR/USD   BUY       78%   1:2.5  Open     Auto-exec   │
│  Sep 03     14:28    GBP/USD   WATCH     68%   —      —        Waiting     │
│  Sep 03     14:15    USD/JPY   NO_TRADE  —     —      —        HTF mismatch │
│  Sep 03     14:10    BTC/USD   BUY       82%   1:3.0  +$89     Closed-TP1  │
│  Sep 03     13:55    EUR/GBP   NO_TRADE  —     —      —        No setup    │
│  Sep 03     13:42    EUR/USD   NO_TRADE  —     —      —        Risk veto   │
│             (Heat would reach 7.2%)                                       │
│  Sep 03     13:30    GBP/USD   SELL      75%   1:2.0  -$24     Closed-SL   │
│  Sep 03     13:15    BTC/USD   NO_TRADE  —     —      —        Session pause│
│                                                                             │
│  [Click any row to see full explanation, evidence, and drawings]           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.6 Alert System

Alerts are critical for an autonomous system. The user is not watching every second.

**Alert Levels:**

| Level | Color | Sound | Notification | Examples |
|-------|-------|-------|--------------|----------|
| **CRITICAL** | 🔴 Red | Loud chime + voice | Push + Email + SMS | Circuit breaker triggered, daily loss limit hit, model drift, data failure |
| **WARNING** | 🟡 Yellow | Soft chime | Push + Email | Risk veto, portfolio heat at 80%, ATR spike, consecutive losses |
| **INFO** | 🟢 Green | Silent | In-app only | Trade executed, target hit, position closed, knowledge updated |
| **DEBUG** | ⚪ Grey | Silent | None (logged only) | Engine latency, data ingestion rate, heartbeat |

**Alert Panel:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ALERTS (3 unread)                                    [Mark All Read]       │
├─────────────────────────────────────────────────────────────────────────────┤
│  🔴 CRITICAL  14:32  Circuit breaker triggered: 3 consecutive losses        │
│                      System paused for 4 hours. Review your last trades.    │
│                      [Review Trades] [Resume Early (requires confirmation)] │
│                                                                             │
│  🟡 WARNING   14:28  Risk veto: EUR/USD trade rejected                      │
│                      Portfolio heat would reach 7.2% (limit: 6%)           │
│                      Suggestion: Wait for existing position to close.       │
│                                                                             │
│  🟢 INFO      14:32  Trade executed: BUY EUR/USD @ 1.0850                  │
│                      Position size: 2.4 units | Risk: 1.2% | SL: 1.0842   │
│                      [View Position] [View Explanation]                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.7 Emergency Controls

Always visible, always accessible:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EMERGENCY CONTROLS                                                        │
│                                                                             │
│  [🛑 EMERGENCY STOP ALL TRADING]                                          │
│       Immediately halt all new decisions. Close all open positions at      │
│       market price. System goes to OFFLINE state. Requires manual restart. │
│                                                                             │
│  [⏸ PAUSE SYSTEM]                                                         │
│       Halt new decisions. Keep existing positions managed (SL/TP active).  │
│       System goes to PAUSED state. Can resume without restart.             │
│                                                                             │
│  [📉 CLOSE ALL POSITIONS]                                                 │
│       Close all open positions at market price. Keep system running.       │
│                                                                             │
│  [⚡ REDUCE SIZE 50%]                                                     │
│       Halve position sizes for all new trades until manually reset.        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. The Scheduler & Queue System

### 5.1 Why a Scheduler?

In an autonomous system, decisions are not triggered by user clicks. They are triggered by:
- Time (candle closes)
- Events (liquidity sweep detected)
- Schedule (daily summary at 19:00 GMT)

The scheduler manages all of this.

### 5.2 Job Types

```typescript
// apps/scheduler/src/jobs.ts

interface ScheduledJob {
  id: string;
  type: 'candle_close' | 'interval' | 'event' | 'maintenance' | 'alert';
  symbol?: string;
  timeframe?: string;
  cron?: string;           // For recurring jobs
  eventType?: string;      // For event-driven jobs
  handler: () => Promise<void>;
  priority: number;        // 1 = critical, 10 = background
  retryPolicy: {
    maxRetries: number;
    backoff: 'linear' | 'exponential';
  };
}

// Example jobs:
const jobs: ScheduledJob[] = [
  {
    id: 'eurusd-15m-pipeline',
    type: 'candle_close',
    symbol: 'EUR/USD',
    timeframe: '15m',
    handler: runDecisionPipeline,
    priority: 1,
    retryPolicy: { maxRetries: 3, backoff: 'exponential' }
  },
  {
    id: 'health-check',
    type: 'interval',
    cron: '*/30 * * * * *',  // Every 30 seconds
    handler: runHealthCheck,
    priority: 2,
    retryPolicy: { maxRetries: 5, backoff: 'linear' }
  },
  {
    id: 'daily-summary',
    type: 'maintenance',
    cron: '0 19 * * *',  // Every day at 19:00 GMT
    handler: sendDailySummary,
    priority: 5,
    retryPolicy: { maxRetries: 2, backoff: 'linear' }
  },
  {
    id: 'portfolio-snapshot',
    type: 'interval',
    cron: '*/5 * * * *',  // Every 5 minutes
    handler: takePortfolioSnapshot,
    priority: 3,
    retryPolicy: { maxRetries: 3, backoff: 'linear' }
  }
];
```

### 5.3 Queue Management (BullMQ)

BullMQ provides:
- **Job persistence** — If the system crashes, jobs are not lost
- **Priority queues** — Critical jobs (decisions) run before background jobs (snapshots)
- **Retry logic** — Failed jobs retry with backoff
- **Rate limiting** — Prevent overwhelming the API or data provider
- **Job progress** — Track long-running jobs (backtests, model training)
- **Dead letter queue** — Jobs that fail permanently are logged for investigation

```
Queue: decisions (priority 1, max 10 concurrent)
Queue: positions (priority 2, max 5 concurrent)
Queue: alerts (priority 3, max 20 concurrent)
Queue: snapshots (priority 5, max 2 concurrent)
Queue: backtests (priority 5, max 1 concurrent)
Queue: ml_training (priority 5, max 1 concurrent)
```

### 5.4 Watchdog

The watchdog monitors system health:

```typescript
// apps/scheduler/src/watchdog.ts

class Watchdog {
  async check(): Promise<WatchdogResult> {
    const checks = await Promise.all([
      this.checkDataFreshness(),      // Is market data < 5 minutes old?
      this.checkApiHealth(),          // Is API responding?
      this.checkWsHealth(),           // Are WebSocket connections active?
      this.checkQueueHealth(),        // Are queues backing up?
      this.checkModelHealth(),        // Is ML model responding?
      this.checkDecisionLatency(),    // Are decisions taking < 2s?
    ]);

    const failed = checks.filter(c => !c.passed);
    if (failed.length > 0) {
      await this.sendAlert('system_health', failed);
      if (failed.some(c => c.critical)) {
        await this.triggerCircuitBreaker('system_health_failure');
      }
    }

    return { checks, healthy: failed.length === 0 };
  }
}
```

---

## 6. The Autonomous Paper Trading Engine

### 6.1 Order Execution (Automatic)

```typescript
// apps/api/src/paper/autoExecution.ts

class AutonomousPaperTradingEngine {
  async onDecision(decision: TradeDecision): Promise<void> {
    if (decision.decisionType !== 'BUY' && decision.decisionType !== 'SELL') {
      return; // NO_TRADE, WATCH — nothing to execute
    }

    // 1. Create order
    const order = await this.createOrder(decision);

    // 2. Wait for next candle to simulate fill
    const fillCandle = await this.waitForNextCandle(decision.symbol, decision.timeframe);

    // 3. Simulate fill price
    const fillPrice = this.calculateFillPrice(order, fillCandle);

    // 4. Apply slippage
    const slippage = this.calculateSlippage(decision.symbol, fillCandle);
    const finalFillPrice = order.side === 'long' 
      ? fillPrice + slippage 
      : fillPrice - slippage;

    // 5. Apply commission
    const commission = finalFillPrice * order.quantity * 0.001;

    // 6. Create fill record
    const fill = await this.createFill(order, finalFillPrice, slippage, commission);

    // 7. Open position
    const position = await this.openPosition(fill);

    // 8. Start position monitoring
    this.startPositionMonitor(position);

    // 9. Broadcast to user
    await this.broadcastTradeExecuted(decision, position);

    // 10. Log
    await this.logTrade(decision, position);
  }

  private async startPositionMonitor(position: PaperPosition): Promise<void> {
    // Subscribe to new candles for this symbol
    const unsubscribe = candleStream.subscribe(position.symbol, position.timeframe, async (candle) => {
      // Check stop loss
      if (this.isStopLossHit(position, candle)) {
        await this.closePosition(position, candle, 'stop_loss');
        unsubscribe();
        return;
      }

      // Check take profits
      for (const target of position.takeProfits) {
        if (this.isTargetHit(position, target, candle)) {
          await this.partialClose(position, candle, target);
          if (position.remainingQuantity <= 0) {
            unsubscribe();
            return;
          }
        }
      }

      // Update trailing stop
      if (position.trailingStop) {
        await this.updateTrailingStop(position, candle);
      }

      // Update unrealized P&L
      await this.updateUnrealizedPnl(position, candle);

      // Broadcast P&L update
      await this.broadcastPositionUpdate(position);
    });
  }

  private async closePosition(position: PaperPosition, candle: Candle, reason: string): Promise<void> {
    // Calculate realized P&L
    const realizedPnl = this.calculateRealizedPnl(position, candle.close);

    // Apply slippage and commission on exit
    const exitSlippage = this.calculateSlippage(position.symbol, candle);
    const exitCommission = candle.close * position.remainingQuantity * 0.001;

    // Update position
    position.status = 'closed';
    position.closePrice = candle.close;
    position.closeTimestamp = candle.timestamp;
    position.closeReason = reason;
    position.realizedPnl = realizedPnl - exitSlippage - exitCommission;

    // Persist
    await this.persistPosition(position);

    // Generate trade review
    const review = await tradeReviewEngine.generate(position);
    await this.persistReview(review);

    // Update knowledge
    await knowledgeEngine.learnFromTrade(position, review);

    // Broadcast
    await this.broadcastPositionClosed(position);
    await this.sendAlert('position_closed', { position, review });

    // Check circuit breakers
    await this.checkPostTradeCircuitBreakers(position);
  }
}
```

### 6.2 Position Visualization on Chart

Open positions are drawn on the execution chart:

```
Entry Price: ──────────────── [Long EUR/USD @ 1.0850] ────────────────
              |                        |
              |                        ├── Unrealized P&L: +$45 (+0.8%)
              |                        ├── Size: 2.4 units
              |                        ├── Opened: 14:32:15
              |                        └── Strategy: BOS + Sweep + OB
              |
Stop Loss:   ──────────────── [SL: 1.0842 (-8 pips)] ────────────────
              |
Target 1:    ─ ─ ─ ─ ─ ─ ─ ─ [TP1: 1.0875 (+25 pips, 1:2.5)] ─ ─ ─ ─
              |                        [HIT ✓] 50% closed @ 14:55
              |
Target 2:    ─ ─ ─ ─ ─ ─ ─ ─ [TP2: 1.0890 (+40 pips, 1:3.1)] ─ ─ ─ ─
              |
Target 3:    ─ ─ ─ ─ ─ ─ ─ ─ [TP3: 1.0905 (+55 pips, 1:4.4)] ─ ─ ─ ─
```

As price moves:
- The position line changes color: green (profitable), red (losing), yellow (near SL)
- The unrealized P&L updates in real-time
- When a target is hit, a marker appears with the partial close details
- The remaining position line adjusts to the new quantity

---

## 7. Circuit Breakers (Automatic Safety)

### 7.1 Circuit Breaker Types

| Breaker | Trigger | Action | Recovery |
|---------|---------|--------|----------|
| **Daily Loss Limit** | Realized losses reach 3% of account | Halt all new trades for 24h | Automatic at 00:00 UTC next day |
| **Consecutive Losses** | 3 losses in a row | Pause 4h, force trade review | Manual resume after review |
| **Drawdown Limit** | 10% drawdown from peak | Pause, require manual review | Manual resume after risk profile review |
| **Volatility Spike** | ATR doubles in 4h | Reduce position sizes 50% | Automatic when ATR normalizes |
| **Data Failure** | No fresh data for 5 minutes | Suspend all decisions | Automatic when data resumes |
| **Model Drift** | ML accuracy < 55% over 50 trades | Reduce ML weight to 0, alert | Manual retrain and redeploy |
| **Queue Backup** | > 100 jobs queued for > 10 minutes | Pause new decisions, alert | Automatic when queue clears |
| **API Failure** | EODHD down for > 15 minutes | Switch to backup provider (Binance) | Automatic when primary resumes |
| **SL Cluster** | Multiple positions hit SL in 1h | Pause 2h, review correlation | Manual resume |

### 7.2 Circuit Breaker UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CIRCUIT BREAKER STATUS                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ACTIVE BREAKERS (1)                                               │   │
│  │                                                                     │   │
│  │  🔴 CONSECUTIVE LOSSES — PAUSED                                    │   │
│  │  Triggered: Sep 03, 14:32 (3 losses in a row)                     │   │
│  │  Remaining: 2h 15m                                                │   │
│  │  Action: System paused, no new trades                             │   │
│  │                                                                     │   │
│  │  [📓 Review Last 3 Trades]  [⏩ Resume Early (requires code)]      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ARMED BREAKERS (Ready to trigger if conditions met)               │   │
│  │                                                                     │   │
│  │  🟡 Daily Loss: 2.8/3.0% (93% of limit)                           │   │
│  │  🟢 Drawdown: 2.1/10% (21% of limit)                              │   │
│  │  🟢 Volatility: Normal                                            │   │
│  │  🟢 Data Quality: Fresh (< 1 min old)                             │   │
│  │  🟢 Model Health: Accurate (67% over last 50 trades)              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Notification System

### 8.1 Channels

| Channel | Use Case | Priority |
|---------|----------|----------|
| **In-app alerts** | All events | All |
| **Push notification** | Trade executed, position closed, circuit breaker | High+ |
| **Email** | Daily summary, circuit breaker, model drift | Medium+ |
| **SMS** | Critical circuit breaker, emergency stop | Critical only |
| **Voice alert** | Family mode, significant events | Configurable |
| **Webhook** | Integration with external systems (future) | Configurable |

### 8.2 Daily Summary Email

```
Subject: Quantum Daily Summary — Sep 03, 2026 (+1.2%)

Portfolio Performance:
- Starting Balance: $10,000
- Current Balance: $10,124
- Daily P&L: +$124 (+1.2%)
- Total Return (30d): +8.4%
- Max Drawdown: 2.1%

Trades Today:
- Total: 3
- Wins: 2 (+$134)
- Losses: 1 (-$10)
- Win Rate: 67%
- Average R:R: 1:2.8

Active Positions:
- EUR/USD Long: +$45 (SL: 1.0842, TP1: 1.0875)
- GBP/USD Long: -$12 (SL: 1.2650, TP1: 1.2700)

Decisions:
- BUY: 2 (EUR/USD, BTC/USD)
- NO_TRADE: 4 (HTF mismatch, risk veto, session pause)
- WATCH: 1 (GBP/USD, waiting confirmation)

System Health:
- Data Quality: ✅ Fresh
- Model Health: ✅ Accurate (67%)
- Circuit Breakers: None active

Knowledge Updates:
- New lesson: "BOS+Sweep+OB in London: 75% win rate"
- Strategy adjusted: Reduced NY session weight by 10%

[View Full Dashboard] [View Journal] [Adjust Configuration]
```

---

## 9. The "Family Mode"

### 9.1 Why Family Mode Matters

I trade with my kid. The system must respect that.

### 9.2 Family Mode Features

- **Conservative sizing**: Risk per trade drops to 1% (from 1.5%)
- **Fewer positions**: Max open positions drops to 3 (from 5)
- **Conservative strategies**: Only highest-probability setups (confidence ≥ 80%)
- **Voice alerts**: "Trade executed: BUY EUR/USD" — so I can hear while helping with homework
- **Scheduled pauses**: Auto-pause during configured family hours
- **Gentle notifications**: No loud chimes, soft voice only
- **Daily summary priority**: Highlights patience and capital preservation over profit

### 9.3 Family Mode Schedule

```
[✓] Enable Family Mode
    Schedule:
    [✓] Weekends (Sat-Sun, all day)
    [✓] Weekdays 17:00-21:00 (family dinner/homework time)
    [✗] Weekdays 21:00-23:00 (personal trading time)

    Effects during family hours:
    - Risk per trade: 1.0% (normally 1.5%)
    - Max positions: 3 (normally 5)
    - Min confidence: 80% (normally 75%)
    - Voice alerts: ON
    - Loud chimes: OFF
    - Emergency alerts only via SMS
```

---

## 10. Updated Implementation Roadmap (Autonomous)

### Phase 0: Audit & Baseline (Week 1)
Same as before. Audit existing codebase, classify modules.

### Phase 1: Foundation & Extraction (Weeks 2-3)
- Monorepo setup
- Fastify API with auth + RBAC
- **Add Scheduler service (BullMQ)**
- **Add state machine (IDLE, MONITORING, DECIDING, PAUSED, OFFLINE)**
- Remove all manual execution buttons from frontend
- Build command center dashboard shell

### Phase 2: Market Data & Ingestion (Weeks 4-5)
- EODHD REST + WebSocket
- TimescaleDB for candles
- **Ingestion worker with automatic quality checks**
- **Redis pub/sub for real-time distribution**
- **Automatic data freshness monitoring**

### Phase 3: Chart & Monitoring (Weeks 6-7)
- Three-timeframe layout
- Canvas overlay for drawings
- **Position line visualization (auto-updating)**
- **Activity log panel**
- **Live decision panel**

### Phase 4: Intelligence Engines (Weeks 8-10)
- All engines with Evidence + DrawingCommand output
- **Reactive triggers: liquidity sweep → immediate pipeline run**
- **Event-driven architecture for mid-candle decisions**

### Phase 5: Autonomous Decision & Execution (Weeks 11-13)
- **Master Decision Engine with automatic execution path**
- **Risk Gate with automatic veto (no human in loop)**
- **Portfolio Gate with automatic veto**
- **Paper Trading Engine with automatic order creation, fill simulation, position monitoring, SL/TP checking**
- **Position lifecycle: open → partial close → full close (all automatic)**
- **Trade review auto-generation**

### Phase 6: Circuit Breakers & Safety (Weeks 14-15)
- **All 9 circuit breakers implemented**
- **Automatic pause/resume logic**
- **Alert dispatch on breaker trigger**
- **Recovery procedures**

### Phase 7: Configuration & Alerts (Weeks 16-17)
- **Configuration panel (symbols, kill zones, risk, strategies, alerts)**
- **Alert system (in-app, push, email, SMS)**
- **Daily summary email**
- **Family mode**

### Phase 8: Backtesting (Weeks 18-19)
- Bar-by-bar backtest
- Look-ahead bias detection
- Strategy comparison

### Phase 9: Knowledge & Learning (Weeks 20-21)
- Knowledge graph
- Trade reviews
- Historical similarity

### Phase 10: ML (Weeks 22-23)
- ONNX LightGBM
- Feature pipeline
- Drift detection

### Phase 11: Roles & Admin (Weeks 24-25)
- RBAC
- Admin panels
- Super admin controls
- **Emergency stop system**

### Phase 12: Validation (Week 26+)
- 2-year backtest
- 30-day autonomous paper trading
- Measure: win rate, expectancy, drawdown, system uptime, circuit breaker triggers

---

## 11. Definition of Done (Autonomous v1.0)

1. [ ] System runs autonomously for 7 days without human intervention
2. [ ] All decisions are automatic (no manual execution)
3. [ ] All positions are auto-managed (SL/TP/Trailing)
4. [ ] Circuit breakers trigger automatically and correctly
5. [ ] User receives alerts for all significant events
6. [ ] User can configure, monitor, pause, and emergency stop
7. [ ] Daily summary emails are accurate and useful
8. [ ] Family mode works as configured
9. [ ] System uptime > 99%
10. [ ] No look-ahead bias in backtests
11. [ ] Positive expectancy over 2-year backtest
12. [ ] 30-day autonomous paper trading shows alignment with backtest
13. [ ] All other v1.0 criteria from previous spec

---

*Quantum does not need me to trade. It trades so I can live.*
