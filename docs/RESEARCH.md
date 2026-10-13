# Trader Desk research integrity

# Research honesty rules

Paper trading is not live trading. Simulated results are not live performance and do not predict future performance. Paper fills omit queue position, partial fills, outages, funding, borrow, and realistic slippage in thin books.

The current simulator is spot-long only. Entry orders are all-or-none on a later candle: stop entries use the candle open when it gaps through the trigger, otherwise the trigger price, then apply configured adverse slippage and fees. Position management evaluates only closed candles; if both the stop and a target are inside one candle, the stop is assumed first because intrabar ordering is unknown. Target exits use the target or a better candle open, and each reduction allocates entry fees/slippage in proportion to the reduced quantity. This is a conservative deterministic bar model, not an exchange order-book or partial-fill model. Manual paper closes require a fresh closed 1m provider candle. Results must remain labeled simulated.

Strategies tuned on the same data used for evaluation are overfit. Evaluate with chronological walk-forward splits and a locked forward test. Record every setup and parameter set tried; testing many variants inflates apparent results.

Reports must show the sample size and confidence interval. Below `MIN_TRADES_FOR_STATS`, show `INSUFFICIENT SAMPLE (n < MIN_TRADES_FOR_STATS)` and omit win rate. Compare results after costs with buy-and-hold on the same symbol and period, at least 1,000 seeded random-entry runs using the same execution assumptions, and holding cash.

Confidence must not be presented as probability unless the model and horizon have a measured calibration result. Store its sample count, Brier score, measurement time, model version, and horizon. A lineage-complete prediction is not necessarily calibrated.

Register each setup's falsifiable hypothesis and the observation that would change the conclusion before collecting forward results. A setup cannot be promoted based on a small or in-sample paper result. Forward promotion requires the configured minimum trade count and test duration, complete costs, and performance against the registered baselines.

### Reproducible experiment runs

`POST /api/v1/research/experiments/:id/run` currently accepts only 15m replay requests. It fetches closed provider candles for 15m confirmation, 1h setup, and 4h/1d context, and rejects stale responses. Each experiment registers a future UTC `testStartTime` before its first test candle. The database freezes parameters and registration time. However, the endpoint currently requests at most 1,000 bars per timeframe while requiring a 90-day forward interval. A 15m 90-day interval needs at least 8,640 bars before training context, so the endpoint returns 422 and cannot presently accumulate an eligible 15m run. This is a known research release blocker. Do not lower the evidence threshold or substitute coarser trigger bars; implement verified chunked, immutable forward collection with bounded storage and replay continuity before claiming the workflow is operational. Promotion must remain disabled absent eligible evidence.

The test interval must follow experiment registration and the pre-test training interval. A seeded random-entry comparator uses a holding duration derived from training replay, and buy-and-hold and random entries use the same fee/slippage assumptions. Historical intervals cannot be registered. The report rejects short or underpowered samples, non-positive after-cost expectancy, profit factor at or below one, and results that fail to beat either comparator. Current 15m accumulation is blocked by the 1,000-bar request cap as described above. The implementation needs immutable chunk persistence and an integration-tested stitch/replay path before it can collect this holdout. No threshold is lowered to work around that limitation.

The database claim trigger serializes claims by symbol/timeframe with a transaction advisory lock and rejects any overlapping half-open `[start, end)` interval. Concurrent claims for different experiments therefore cannot both win even if neither transaction can see the other's uncommitted row. Adjacent windows are allowed. Run `npm run test:research-holdout-concurrency` against local Supabase after starting it; this uses two PostgreSQL sessions and only accepts localhost port 54322. Neither the trigger nor its concurrent test has run in this environment because Docker/Podman is unavailable.

Promotion is a separate admin action guarded by the server's admin/MFA middleware and a service-only database function. That function reads the stored immutable run and refuses promotion unless its server-generated validation artifact passed and is promotion-eligible. Production execution reads active promotion rows from the database; `PROMOTED_SETUP_TYPES` does not authorize production entries. Until a sufficiently large, registered, forward paper sample passes all configured gates, the setup remains shadow-only. These controls make the pipeline reproducible; they do not establish that this strategy is profitable or effective.

Synthetic candles appear only in deterministic unit tests. No provider data or experiment outcome is generated as a fallback. Local provider entitlement and database integration still require verification in the deployment environment.
