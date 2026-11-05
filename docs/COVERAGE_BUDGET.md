# Market provider budgets

Provider budgets protect real market-data requests and are independent of market access.
The market registry is the source of truth for active crypto and commodity instruments.
Provider probes are diagnostic only; they do not enroll instruments or determine chart access.

Chart requests validate provider mappings, OHLCV integrity, timestamps, closed candles, freshness,
rate limits, and provider errors. Explicit administrator restrictions are stored separately in
`market_access_restrictions` and are audited through `admin_audit_events`.

Paper trading has independent strategy, risk, execution, ledger, and closed-candle safeguards.
Provider availability or chart access must not be interpreted as autonomous-trading approval.
