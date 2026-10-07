/*
# Reseed instrument universe with USD crypto pairs

## Purpose
Replaces the 19 USDT-quoted crypto instruments with USD-quoted equivalents
sourced from Massive (X:<BASE>USD tickers). The old BTCUSDT/ETHUSDT/etc.
records are deactivated, not deleted, to preserve referential integrity.

## Changes
- Deactivates all USDT-quoted crypto assets and market_universe rows
- Upserts 19 USD-quoted crypto instruments (BTCUSD, ETHUSD, SOLUSD, etc.)
- MATIC renamed to POL (Polygon's token migration)
- All crypto instruments use provider=massive with X: prefixed source symbols

## Security
- No security changes. RLS policies remain as-is.
- SELECT on assets/market_universe is open to anon, authenticated (unchanged).
*/

-- Deactivate old USDT-quoted crypto instruments
UPDATE assets SET status = 'inactive', updated_at = now()
WHERE asset_class = 'crypto' AND quote_asset = 'USDT';

UPDATE market_universe SET is_active = false
WHERE market_type = 'crypto' AND quote_asset = 'USDT';

-- Upsert USD-quoted crypto instruments
INSERT INTO assets (symbol, name, asset_class, base_asset, quote_asset, status, metadata)
VALUES
  ('BTCUSD', 'Bitcoin', 'crypto', 'BTC', 'USD', 'active', '{"source_symbol": "X:BTCUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('ETHUSD', 'Ethereum', 'crypto', 'ETH', 'USD', 'active', '{"source_symbol": "X:ETHUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('SOLUSD', 'Solana', 'crypto', 'SOL', 'USD', 'active', '{"source_symbol": "X:SOLUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('XRPUSD', 'Ripple', 'crypto', 'XRP', 'USD', 'active', '{"source_symbol": "X:XRPUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('BNBUSD', 'BNB', 'crypto', 'BNB', 'USD', 'active', '{"source_symbol": "X:BNBUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('ADAUSD', 'Cardano', 'crypto', 'ADA', 'USD', 'active', '{"source_symbol": "X:ADAUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('DOGEUSD', 'Dogecoin', 'crypto', 'DOGE', 'USD', 'active', '{"source_symbol": "X:DOGEUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('AVAXUSD', 'Avalanche', 'crypto', 'AVAX', 'USD', 'active', '{"source_symbol": "X:AVAXUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('LINKUSD', 'Chainlink', 'crypto', 'LINK', 'USD', 'active', '{"source_symbol": "X:LINKUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('DOTUSD', 'Polkadot', 'crypto', 'DOT', 'USD', 'active', '{"source_symbol": "X:DOTUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('POLUSD', 'Polygon', 'crypto', 'POL', 'USD', 'active', '{"source_symbol": "X:POLUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('LTCUSD', 'Litecoin', 'crypto', 'LTC', 'USD', 'active', '{"source_symbol": "X:LTCUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('BCHUSD', 'Bitcoin Cash', 'crypto', 'BCH', 'USD', 'active', '{"source_symbol": "X:BCHUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('XLMUSD', 'Stellar', 'crypto', 'XLM', 'USD', 'active', '{"source_symbol": "X:XLMUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('UNIUSD', 'Uniswap', 'crypto', 'UNI', 'USD', 'active', '{"source_symbol": "X:UNIUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('ATOMUSD', 'Cosmos', 'crypto', 'ATOM', 'USD', 'active', '{"source_symbol": "X:ATOMUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('ETCUSD', 'Ethereum Classic', 'crypto', 'ETC', 'USD', 'active', '{"source_symbol": "X:ETCUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('FILUSD', 'Filecoin', 'crypto', 'FIL', 'USD', 'active', '{"source_symbol": "X:FILUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('NEARUSD', 'NEAR Protocol', 'crypto', 'NEAR', 'USD', 'active', '{"source_symbol": "X:NEARUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('APTUSD', 'Aptos', 'crypto', 'APT', 'USD', 'active', '{"source_symbol": "X:APTUSD", "source_quote": "USD", "provider": "massive", "conversion": "none"}')
ON CONFLICT (symbol) DO UPDATE SET
  name = EXCLUDED.name,
  base_asset = EXCLUDED.base_asset,
  quote_asset = EXCLUDED.quote_asset,
  asset_class = EXCLUDED.asset_class,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- Upsert market_universe for USD-quoted crypto
INSERT INTO market_universe (symbol, source_symbol, base_asset, quote_asset, market_type, exchange, provider, label, category, is_active, metadata)
SELECT
  a.symbol,
  a.metadata->>'source_symbol',
  a.base_asset,
  a.quote_asset,
  a.asset_class,
  'Massive',
  a.metadata->>'provider',
  split_part(a.symbol, 'USD', 1) || '/USD',
  CASE
    WHEN a.symbol IN ('BTCUSD','ETHUSD','SOLUSD','XRPUSD','BNBUSD','ADAUSD','DOGEUSD') THEN 'Major'
    ELSE 'Altcoin'
  END,
  true,
  a.metadata
FROM assets a
WHERE a.asset_class = 'crypto' AND a.quote_asset = 'USD' AND a.status = 'active'
ON CONFLICT (symbol) DO UPDATE SET
  source_symbol = EXCLUDED.source_symbol,
  base_asset = EXCLUDED.base_asset,
  quote_asset = EXCLUDED.quote_asset,
  market_type = EXCLUDED.market_type,
  exchange = EXCLUDED.exchange,
  provider = EXCLUDED.provider,
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  metadata = EXCLUDED.metadata;
