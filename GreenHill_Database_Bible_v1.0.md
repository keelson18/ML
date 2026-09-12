# Quantuam trade Database Bible v1.0

**Status:** Engineering Baseline  
**Purpose:** Define the complete logical data model, relationships, integrity rules, migration strategy, and data lifecycle for Quantuam trade.

---

## 1. Database Goals

The database must support:

- Multi-market data
- Multi-timeframe analysis
- Trading intelligence
- Strategy management
- Risk management
- Portfolio state
- Paper trading
- Explainability
- Knowledge
- Learning
- Research
- Model governance
- Auditing

Primary database: **PostgreSQL/Supabase PostgreSQL**.

The schema must be normalized around stable domain concepts while permitting high-volume market-data storage and derived analytical data.

---

## 2. Schema Domains

Recommended logical namespaces:

```text
identity
market
intelligence
strategy
trading
risk
portfolio
knowledge
learning
research
ml
audit
system
```

Physical PostgreSQL schemas may be introduced when operationally useful. Do not create schemas solely for aesthetics.

---

## 3. Identity Domain

### `profiles`

Purpose: application user profile.

Key fields:

- `id` UUID PK
- `display_name`
- `timezone`
- `base_currency`
- `created_at`
- `updated_at`

### `user_roles`

- `id`
- `user_id`
- `role`
- `created_at`

Roles should support least privilege.

---

## 4. Market Domain

### `assets`

Represents tradeable instruments.

Fields:

- `id`
- `symbol`
- `name`
- `asset_class`
- `base_asset`
- `quote_asset`
- `exchange_id`
- `status`
- `metadata`
- timestamps

Unique constraint should prevent ambiguous duplicate instruments.

### `markets`

Represents market/provider relationships.

Fields:

- `id`
- `asset_id`
- `provider`
- `market_type`
- `session_timezone`
- `status`

### `timeframes`

- `id`
- `code`
- `seconds`
- `label`

### `candles`

Core OHLCV historical/time-series data.

Fields:

- `id`
- `asset_id`
- `timeframe_id`
- `timestamp`
- `open`
- `high`
- `low`
- `close`
- `volume`
- `source`
- `quality_status`
- `created_at`

Unique key:

`asset_id + timeframe_id + timestamp + source`

High-volume candle tables should be indexed by asset/timeframe/time and considered for partitioning.

### `ticks`

Optional high-frequency data.

Fields:

- `id`
- `asset_id`
- `timestamp`
- `bid`
- `ask`
- `last_price`
- `volume`
- `source`

---

## 5. Market Context

### `market_contexts`

A reproducible snapshot of market state.

Fields:

- `id`
- `asset_id`
- `timestamp`
- `timeframe`
- `regime`
- `trend_state`
- `volatility_state`
- `structure_state`
- `liquidity_state`
- `context_version`
- metadata

### `market_regimes`

- `id`
- `asset_id`
- `timeframe`
- `regime_type`
- `confidence`
- `start_time`
- `end_time`
- `detector_version`

---

## 6. Structure and Pattern Domain

### `structure_events`

Stores events such as:

- swing high
- swing low
- break of structure
- market structure shift
- trend transition

Fields:

- `id`
- `asset_id`
- `timeframe`
- `event_type`
- `price`
- `timestamp`
- `confidence`
- `detector_version`
- evidence

### `liquidity_events`

Stores:

- liquidity pool
- sweep
- rejection
- displacement
- stop-run candidates

### `patterns`

Pattern definitions/catalog.

### `pattern_events`

Observed pattern occurrences.

Fields:

- `id`
- `pattern_id`
- `asset_id`
- `timeframe`
- `detected_at`
- `confidence`
- context
- detector_version

---

## 7. Indicators

### `indicator_definitions`

Stores versioned indicator definitions.

### `indicator_observations`

Stores calculated values.

Avoid storing redundant derived values if they can be deterministically recomputed cheaply. Store them when latency, reproducibility, or auditability justifies persistence.

---

## 8. Strategy Domain

### `strategies`

Logical strategy identity.

### `strategy_versions`

Immutable strategy versions.

Fields:

- `id`
- `strategy_id`
- `version`
- `status`
- `logic_definition`
- `risk_definition`
- `parameters`
- `created_by`
- `created_at`

Statuses:

- draft
- research
- validated
- paper
- approved
- retired

### `strategy_evaluations`

Stores backtest/forward/paper evaluation results.

Fields include:

- strategy version
- dataset
- period
- trades
- return
- drawdown
- Sharpe-like metrics
- win rate
- expectancy
- stability metrics
- evaluation version

---

## 9. Decision Domain

### `trade_setups`

Potential opportunities before final decisions.

### `trade_decisions`

Immutable decision records.

Important fields:

- `id`
- `asset_id`
- `decision_type`
- `timestamp`
- `timeframe`
- `strategy_version_id`
- `confidence`
- `risk_score`
- `market_context_id`
- `decision_version`
- `status`

Decision types:

- BUY
- SELL
- HOLD
- WATCH
- NO_TRADE

### `decision_evidence`

Each supporting or conflicting signal.

Fields:

- `decision_id`
- `source_type`
- `source_id`
- `direction`
- `weight`
- `score`
- `explanation`
- `engine_version`

This table is central to explainability.

---

## 10. Trading Domain

### `paper_accounts`

Simulated account state.

### `paper_orders`

Order lifecycle.

Fields:

- `id`
- `account_id`
- `decision_id`
- `asset_id`
- `side`
- `order_type`
- `quantity`
- `limit_price`
- `stop_price`
- `status`
- timestamps

### `paper_positions`

Current/open simulated positions.

### `paper_trades`

Completed or lifecycle trade records.

Store:

- entry
- exit
- fees/slippage assumptions
- realized P&L
- risk
- strategy
- decision
- context
- execution version

### `trade_reviews`

Post-trade evaluation.

Fields:

- trade
- thesis quality
- execution quality
- risk quality
- market condition
- outcome classification
- lessons
- reviewer/version

---

## 11. Risk Domain

### `risk_profiles`

User/account risk configuration.

### `risk_checks`

Every material execution should have a risk-check record.

Fields:

- decision/order
- check type
- result
- limit
- observed value
- rule version
- timestamp

### `risk_events`

Stores:

- drawdown breaches
- exposure breaches
- circuit breaker events
- abnormal volatility
- concentration warnings

---

## 12. Portfolio Domain

### `portfolios`

Logical portfolio.

### `portfolio_positions`

Aggregated portfolio exposure.

### `portfolio_snapshots`

Time-series portfolio state.

Store:

- equity
- cash
- exposure
- drawdown
- unrealized P&L
- realized P&L
- risk metrics

---

## 13. Knowledge Domain

### `knowledge_nodes`

Represents validated knowledge.

Node types may include:

- pattern
- strategy
- regime
- asset
- event
- lesson
- market_behavior
- hypothesis

### `knowledge_relationships`

Graph relationships.

Examples:

```text
Pattern → performs_well_in → Regime
Strategy → uses → Pattern
Trade → demonstrates → Lesson
Regime → affects → Strategy
```

### `knowledge_events`

Tracks creation, validation, revision, and retirement of knowledge.

Knowledge should be versioned and traceable.

---

## 14. Learning Domain

### `learning_events`

Stores observations and validated learning signals.

### `learning_experiments`

Links learning hypotheses to datasets and results.

### `learning_outcomes`

Stores accepted/rejected learning conclusions.

No learning outcome should silently alter production behavior.

---

## 15. Research Domain

### `research_experiments`

Fields:

- experiment ID
- hypothesis
- researcher
- dataset
- strategy/model version
- parameters
- start/end
- status

### `research_runs`

Individual experiment runs.

### `research_results`

Metrics, artifacts, and conclusions.

### `research_approvals`

Approval workflow before production use.

---

## 16. ML/Model Domain

### `models`

Logical model identity.

### `model_versions`

Immutable versions.

Fields:

- model
- version
- artifact reference
- training dataset
- feature set
- algorithm
- metrics
- status
- created_at

### `model_evaluations`

Validation metrics across datasets.

### `model_deployments`

Tracks where a model version is deployed.

Statuses:

- research
- candidate
- paper
- approved
- retired
- rollback

---

## 17. Audit Domain

### `audit_logs`

Every security-sensitive or business-critical mutation should be auditable.

Fields:

- `id`
- actor
- action
- resource_type
- resource_id
- before_state
- after_state
- timestamp
- IP/device metadata where legally appropriate
- correlation_id

Never store secrets.

### `system_events`

Platform-level events.

---

## 18. Relationships

Core relationships:

```text
User
 ├── Paper Accounts
 ├── Portfolios
 ├── Strategies
 └── Research

Asset
 ├── Markets
 ├── Candles
 ├── Market Context
 ├── Patterns
 ├── Structure Events
 └── Liquidity Events

Strategy
 └── Strategy Versions
      ├── Evaluations
      └── Trade Decisions

Trade Decision
 ├── Evidence
 ├── Risk Checks
 └── Paper Orders

Paper Order
 └── Paper Position
      └── Paper Trade
           └── Trade Review

Knowledge Node
 └── Knowledge Relationships

Model
 └── Model Versions
      ├── Evaluations
      └── Deployments
```

---

## 19. Integrity Rules

- Use foreign keys for domain relationships.
- Use unique constraints for natural uniqueness.
- Use check constraints for impossible financial values.
- Use decimal/numeric types for money and prices where precision is required.
- Do not use floating-point types for monetary accounting.
- Store timestamps in UTC.
- Preserve immutable historical records.
- Use soft deletion only where appropriate.
- Never cascade-delete audit records.
- Version strategy/model definitions.

---

## 20. Indexing

Important indexes:

- `candles(asset_id, timeframe_id, timestamp DESC)`
- `ticks(asset_id, timestamp DESC)`
- `market_contexts(asset_id, timestamp DESC)`
- `trade_decisions(asset_id, timestamp DESC)`
- `paper_trades(account_id, closed_at DESC)`
- `risk_events(account_id, timestamp DESC)`
- `knowledge_relationships(source_node_id)`
- `knowledge_relationships(target_node_id)`
- `audit_logs(resource_type, resource_id, timestamp DESC)`

Use query plans before adding excessive indexes.

---

## 21. Migration Rules

All schema changes must use versioned migrations.

Rules:

1. Never edit an already-applied migration.
2. Add a new migration for changes.
3. Test up/down behavior where supported.
4. Use backward-compatible migrations for deployed systems.
5. Never destroy production data during normal migrations.
6. Large table migrations require a performance plan.

---

## 22. Data Retention

Retention must be domain-specific.

High-volume raw market data may be archived.

Critical records must be retained longer:

- Trade decisions
- Paper trades
- Risk events
- Model versions
- Strategy versions
- Audit logs
- Research results
- Knowledge history

Retention policies must be configurable and documented.

---

## 23. Database Definition of Done

The database is accepted when:

- All core domains are represented.
- Relationships are explicit.
- Constraints protect integrity.
- Critical records are versioned.
- Auditability exists.
- Indexes support real query patterns.
- Migrations are reproducible.
- High-volume data has a scaling strategy.
