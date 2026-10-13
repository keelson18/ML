# Trader Desk research integrity

# Research honesty rules

Paper trading is not live trading. Simulated results are not live performance and do not predict future performance. Paper fills omit queue position, partial fills, outages, funding, borrow, and realistic slippage in thin books.

The current simulator is spot-long only. Entry orders are all-or-none on a later candle: stop entries use the candle open when it gaps through the trigger, otherwise the trigger price, then apply configured adverse slippage and fees. Position management evaluates only closed candles; if both the stop and a target are inside one candle, the stop is assumed first because intrabar ordering is unknown. Target exits use the target or a better candle open, and each reduction allocates entry fees/slippage in proportion to the reduced quantity. This is a conservative deterministic bar model, not an exchange order-book or partial-fill model. Manual paper closes require a fresh closed 1m provider candle. Results must remain labeled simulated.

Strategies tuned on the same data used for evaluation are overfit. Evaluate with chronological walk-forward splits and a locked forward test. Record every setup and parameter set tried; testing many variants inflates apparent results.

Reports must show the sample size and confidence interval. Below `MIN_TRADES_FOR_STATS`, show `INSUFFICIENT SAMPLE (n < MIN_TRADES_FOR_STATS)` and omit win rate. Compare results after costs with buy-and-hold on the same symbol and period, at least 1,000 seeded random-entry runs using the same execution assumptions, and holding cash.

Confidence must not be presented as probability unless the model and horizon have a measured calibration result. Store its sample count, Brier score, measurement time, model version, and horizon. A lineage-complete prediction is not necessarily calibrated.

Register each setup's falsifiable hypothesis and the observation that would change the conclusion before collecting forward results. A setup cannot be promoted based on a small or in-sample paper result. Forward promotion requires the configured minimum trade count and test duration, complete costs, and performance against the registered baselines.

### Reproducible experiment runs

`POST /api/v1/research/experiments/:id/run` resolves an owned draft, fetches provider candles on the server for its selected symbol and trigger timeframe plus 4h and 1d context, rejects stale provider responses, and removes forming candles. The replay uses the versioned `trend-pullback-v1` planner and the same plan executor and paper simulator used by paper mode. It records the provider/data version for each timeframe, exact normalized candle snapshot, source revision, engine versions, configuration hash, chronological training/test boundary, fees, slippage, and the replayed trades. The database transaction stores the run and result together and makes the experiment, run, and result immutable.

The test interval must follow the training interval. A seeded random-entry comparator uses a holding duration derived from the training replay, and buy-and-hold and random entries use the same fee/slippage assumptions. The validation report rejects a historical holdout that predates experiment registration, a short interval, an underpowered sample, non-positive after-cost expectancy, or results that fail to beat either comparator. A database holdout claim prevents a second experiment from reusing the same symbol, timeframe, and exact test interval. Retries of an identical run are idempotent.

Promotion is a separate admin action guarded by the server's admin/MFA middleware and a service-only database function. That function reads the stored immutable run and refuses promotion unless its server-generated validation artifact passed and is promotion-eligible. Production execution reads active promotion rows from the database; `PROMOTED_SETUP_TYPES` does not authorize production entries. Until a sufficiently large, registered, forward paper sample passes all configured gates, the setup remains shadow-only. These controls make the pipeline reproducible; they do not establish that this strategy is profitable or effective.

Synthetic candles appear only in deterministic unit tests. No provider data or experiment outcome is generated as a fallback. Local provider entitlement and database integration still require verification in the deployment environment.
