# Trader Desk research integrity

Trader Desk is a paper-trading and research tool. Simulated results are not live performance and do not predict future performance. Paper fills omit queue position, partial fills, outages, funding, borrow, and realistic slippage in thin books.

Strategies tuned on the same data used for evaluation are overfit. Evaluate with chronological walk-forward splits and a locked forward test. Record every setup and parameter set tried; testing many variants inflates apparent results.

Reports must show the sample size and confidence interval. Below `MIN_TRADES_FOR_STATS`, show `INSUFFICIENT SAMPLE (n < MIN_TRADES_FOR_STATS)` and omit win rate. Compare results after costs with buy-and-hold on the same symbol and period, at least 1,000 seeded random-entry runs using the same execution assumptions, and holding cash.

Confidence must not be presented as probability unless the model and horizon have a measured calibration result. Store its sample count, Brier score, measurement time, model version, and horizon. A lineage-complete prediction is not necessarily calibrated.

Register each setup's falsifiable hypothesis and the observation that would change the conclusion before collecting forward results. A setup cannot be promoted based on a small or in-sample paper result.
