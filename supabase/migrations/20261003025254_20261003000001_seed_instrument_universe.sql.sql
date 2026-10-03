/*
# Add unique constraints and seed instrument universe

## Purpose
1. Add unique constraint on `assets.symbol` and `market_universe.symbol` so we can upsert.
2. Add `source_symbol` column to `market_universe` for explicit provider symbol.
3. Fix `assets` SELECT policy to allow `anon` role (frontend needs to read instruments without login).
4. Seed both tables with the full instrument universe, explicitly distinguishing
   BTCUSD (canonical USD research symbol, sourced from Binance BTCUSDT) vs BTCUSDT
   (source USDT-quoted instrument). The `metadata` jsonb column documents the
   source symbol, source quote currency, conversion policy, and conversion note.

## Key Design Decisions

### BTCUSD vs BTCUSDT
- `BTCUSD` is the CANONICAL research symbol (Bitcoin quoted in USD).
- `BTCUSDT` is the SOURCE symbol Binance provides (Bitcoin quoted in USDT).
- Both are registered as separate instruments. The BTCUSD record's metadata says
  `conversion: "usdt_to_usd"` with a note that USDT is approximately but not
  identically USD.
- No silent renaming anywhere in the system.

### Security
- `assets` SELECT expanded to `anon, authenticated` so the frontend can load
  instruments before sign-in. Write operations remain authenticated only.
- `market_universe` already had `anon, authenticated` SELECT — unchanged.
*/

-- ============================================================
-- Step 1: Add unique constraints
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assets_symbol_unique' AND conrelid = 'assets'::regclass
  ) THEN
    ALTER TABLE assets ADD CONSTRAINT assets_symbol_unique UNIQUE (symbol);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'market_universe_symbol_unique' AND conrelid = 'market_universe'::regclass
  ) THEN
    ALTER TABLE market_universe ADD CONSTRAINT market_universe_symbol_unique UNIQUE (symbol);
  END IF;
END $$;

-- ============================================================
-- Step 2: Add source_symbol column to market_universe
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'market_universe' AND column_name = 'source_symbol'
  ) THEN
    ALTER TABLE market_universe ADD COLUMN source_symbol text;
    COMMENT ON COLUMN market_universe.source_symbol IS
      'The actual symbol the data provider expects (e.g. BTCUSDT for Binance, XAU/USD for Twelve Data). Falls back to symbol if NULL.';
  END IF;
END $$;

-- ============================================================
-- Step 3: Fix assets SELECT policy to allow anon
-- ============================================================

DROP POLICY IF EXISTS "authenticated_read_market_foundation" ON assets;
DROP POLICY IF EXISTS "anon_read_assets" ON assets;

CREATE POLICY "anon_read_assets"
ON assets FOR SELECT
TO anon, authenticated
USING (true);

-- ============================================================
-- Step 4: Seed assets table
-- ============================================================

INSERT INTO assets (symbol, name, asset_class, base_asset, quote_asset, status, metadata)
VALUES
  ('BTCUSD', 'Bitcoin', 'crypto', 'BTC', 'USD', 'active', '{"source_symbol": "BTCUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "usdt_to_usd", "conversion_note": "Binance provides BTCUSDT; prices are USDT-quoted and treated as USD-equivalent for research. USDT is not identical to USD."}'),
  ('ETHUSD', 'Ethereum', 'crypto', 'ETH', 'USD', 'active', '{"source_symbol": "ETHUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "usdt_to_usd", "conversion_note": "Binance provides ETHUSDT; prices are USDT-quoted and treated as USD-equivalent for research. USDT is not identical to USD."}'),
  ('BTCUSDT', 'Bitcoin (USDT)', 'crypto', 'BTC', 'USDT', 'active', '{"source_symbol": "BTCUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('ETHUSDT', 'Ethereum (USDT)', 'crypto', 'ETH', 'USDT', 'active', '{"source_symbol": "ETHUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('SOLUSDT', 'Solana (USDT)', 'crypto', 'SOL', 'USDT', 'active', '{"source_symbol": "SOLUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('XRPUSDT', 'Ripple (USDT)', 'crypto', 'XRP', 'USDT', 'active', '{"source_symbol": "XRPUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('BNBUSDT', 'BNB (USDT)', 'crypto', 'BNB', 'USDT', 'active', '{"source_symbol": "BNBUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('ADAUSDT', 'Cardano (USDT)', 'crypto', 'ADA', 'USDT', 'active', '{"source_symbol": "ADAUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('DOGEUSDT', 'Dogecoin (USDT)', 'crypto', 'DOGE', 'USDT', 'active', '{"source_symbol": "DOGEUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('AVAXUSDT', 'Avalanche (USDT)', 'crypto', 'AVAX', 'USDT', 'active', '{"source_symbol": "AVAXUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('LINKUSDT', 'Chainlink (USDT)', 'crypto', 'LINK', 'USDT', 'active', '{"source_symbol": "LINKUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('DOTUSDT', 'Polkadot (USDT)', 'crypto', 'DOT', 'USDT', 'active', '{"source_symbol": "DOTUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('MATICUSDT', 'Polygon (USDT)', 'crypto', 'MATIC', 'USDT', 'active', '{"source_symbol": "MATICUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('LTCUSDT', 'Litecoin (USDT)', 'crypto', 'LTC', 'USDT', 'active', '{"source_symbol": "LTCUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('BCHUSDT', 'Bitcoin Cash (USDT)', 'crypto', 'BCH', 'USDT', 'active', '{"source_symbol": "BCHUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('XLMUSDT', 'Stellar (USDT)', 'crypto', 'XLM', 'USDT', 'active', '{"source_symbol": "XLMUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('UNIUSDT', 'Uniswap (USDT)', 'crypto', 'UNI', 'USDT', 'active', '{"source_symbol": "UNIUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('ATOMUSDT', 'Cosmos (USDT)', 'crypto', 'ATOM', 'USDT', 'active', '{"source_symbol": "ATOMUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('ETCUSDT', 'Ethereum Classic (USDT)', 'crypto', 'ETC', 'USDT', 'active', '{"source_symbol": "ETCUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('FILUSDT', 'Filecoin (USDT)', 'crypto', 'FIL', 'USDT', 'active', '{"source_symbol": "FILUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('NEARUSDT', 'NEAR Protocol (USDT)', 'crypto', 'NEAR', 'USDT', 'active', '{"source_symbol": "NEARUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('APTUSDT', 'Aptos (USDT)', 'crypto', 'APT', 'USDT', 'active', '{"source_symbol": "APTUSDT", "source_quote": "USDT", "provider": "binance", "conversion": "none"}'),
  ('XAUUSD', 'Gold Spot', 'commodity', 'XAU', 'USD', 'active', '{"source_symbol": "XAU/USD", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('XAGUSD', 'Silver Spot', 'commodity', 'XAG', 'USD', 'active', '{"source_symbol": "XAG/USD", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('XPTUSD', 'Platinum Spot', 'commodity', 'XPT', 'USD', 'active', '{"source_symbol": "XPT/USD", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('XPDUSD', 'Palladium Spot', 'commodity', 'XPD', 'USD', 'active', '{"source_symbol": "XPD/USD", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('USOIL', 'Crude Oil WTI', 'commodity', 'USOIL', 'USD', 'active', '{"source_symbol": "WTI/USD", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('UKOIL', 'Brent Oil', 'commodity', 'UKOIL', 'USD', 'active', '{"source_symbol": "BRENT/USD", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('NATGAS', 'Natural Gas', 'commodity', 'NATGAS', 'USD', 'active', '{"source_symbol": "NATGAS/USD", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('XCUUSD', 'Copper', 'commodity', 'XCU', 'USD', 'active', '{"source_symbol": "XCU/USD", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('EURUSD', 'Euro / US Dollar', 'forex', 'EUR', 'USD', 'active', '{"source_symbol": "EUR/USD", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('GBPUSD', 'British Pound / US Dollar', 'forex', 'GBP', 'USD', 'active', '{"source_symbol": "GBP/USD", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('USDJPY', 'US Dollar / Japanese Yen', 'forex', 'USD', 'JPY', 'active', '{"source_symbol": "USD/JPY", "source_quote": "JPY", "provider": "twelvedata", "conversion": "none"}'),
  ('USDCHF', 'US Dollar / Swiss Franc', 'forex', 'USD', 'CHF', 'active', '{"source_symbol": "USD/CHF", "source_quote": "CHF", "provider": "twelvedata", "conversion": "none"}'),
  ('AUDUSD', 'Australian Dollar / US Dollar', 'forex', 'AUD', 'USD', 'active', '{"source_symbol": "AUD/USD", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('NZDUSD', 'New Zealand Dollar / US Dollar', 'forex', 'NZD', 'USD', 'active', '{"source_symbol": "NZD/USD", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('USDCAD', 'US Dollar / Canadian Dollar', 'forex', 'USD', 'CAD', 'active', '{"source_symbol": "USD/CAD", "source_quote": "CAD", "provider": "twelvedata", "conversion": "none"}'),
  ('EURGBP', 'Euro / British Pound', 'forex', 'EUR', 'GBP', 'active', '{"source_symbol": "EUR/GBP", "source_quote": "GBP", "provider": "twelvedata", "conversion": "none"}'),
  ('EURJPY', 'Euro / Japanese Yen', 'forex', 'EUR', 'JPY', 'active', '{"source_symbol": "EUR/JPY", "source_quote": "JPY", "provider": "twelvedata", "conversion": "none"}'),
  ('GBPJPY', 'British Pound / Japanese Yen', 'forex', 'GBP', 'JPY', 'active', '{"source_symbol": "GBP/JPY", "source_quote": "JPY", "provider": "twelvedata", "conversion": "none"}'),
  ('AUDJPY', 'Australian Dollar / Japanese Yen', 'forex', 'AUD', 'JPY', 'active', '{"source_symbol": "AUD/JPY", "source_quote": "JPY", "provider": "twelvedata", "conversion": "none"}'),
  ('CHFJPY', 'Swiss Franc / Japanese Yen', 'forex', 'CHF', 'JPY', 'active', '{"source_symbol": "CHF/JPY", "source_quote": "JPY", "provider": "twelvedata", "conversion": "none"}'),
  ('EURAUD', 'Euro / Australian Dollar', 'forex', 'EUR', 'AUD', 'active', '{"source_symbol": "EUR/AUD", "source_quote": "AUD", "provider": "twelvedata", "conversion": "none"}'),
  ('EURCHF', 'Euro / Swiss Franc', 'forex', 'EUR', 'CHF', 'active', '{"source_symbol": "EUR/CHF", "source_quote": "CHF", "provider": "twelvedata", "conversion": "none"}'),
  ('GBPCHF', 'British Pound / Swiss Franc', 'forex', 'GBP', 'CHF', 'active', '{"source_symbol": "GBP/CHF", "source_quote": "CHF", "provider": "twelvedata", "conversion": "none"}'),
  ('AUDCAD', 'Australian Dollar / Canadian Dollar', 'forex', 'AUD', 'CAD', 'active', '{"source_symbol": "AUD/CAD", "source_quote": "CAD", "provider": "twelvedata", "conversion": "none"}'),
  ('NZDCAD', 'New Zealand Dollar / Canadian Dollar', 'forex', 'NZD', 'CAD', 'active', '{"source_symbol": "NZD/CAD", "source_quote": "CAD", "provider": "twelvedata", "conversion": "none"}'),
  ('CADJPY', 'Canadian Dollar / Japanese Yen', 'forex', 'CAD', 'JPY', 'active', '{"source_symbol": "CAD/JPY", "source_quote": "JPY", "provider": "twelvedata", "conversion": "none"}'),
  ('SPX500', 'S&P 500', 'index', 'SPX', 'USD', 'active', '{"source_symbol": "SPX500", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('NAS100', 'NASDAQ 100', 'index', 'NAS', 'USD', 'active', '{"source_symbol": "NAS100", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('US30', 'Dow Jones 30', 'index', 'US30', 'USD', 'active', '{"source_symbol": "US30", "source_quote": "USD", "provider": "twelvedata", "conversion": "none"}'),
  ('UK100', 'FTSE 100', 'index', 'UK100', 'GBP', 'active', '{"source_symbol": "UK100", "source_quote": "GBP", "provider": "twelvedata", "conversion": "none"}'),
  ('GER40', 'DAX 40', 'index', 'GER40', 'EUR', 'active', '{"source_symbol": "GER40", "source_quote": "EUR", "provider": "twelvedata", "conversion": "none"}'),
  ('FRA40', 'CAC 40', 'index', 'FRA40', 'EUR', 'active', '{"source_symbol": "FRA40", "source_quote": "EUR", "provider": "twelvedata", "conversion": "none"}'),
  ('JP225', 'Nikkei 225', 'index', 'JP225', 'JPY', 'active', '{"source_symbol": "JP225", "source_quote": "JPY", "provider": "twelvedata", "conversion": "none"}'),
  ('HK50', 'Hang Seng', 'index', 'HK50', 'HKD', 'active', '{"source_symbol": "HK50", "source_quote": "HKD", "provider": "twelvedata", "conversion": "none"}'),
  ('AUS200', 'ASX 200', 'index', 'AUS200', 'AUD', 'active', '{"source_symbol": "AUS200", "source_quote": "AUD", "provider": "twelvedata", "conversion": "none"}'),
  ('AAPL', 'Apple Inc.', 'stock', 'AAPL', 'USD', 'active', '{"source_symbol": "AAPL", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('MSFT', 'Microsoft Corp.', 'stock', 'MSFT', 'USD', 'active', '{"source_symbol": "MSFT", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('GOOGL', 'Alphabet Inc.', 'stock', 'GOOGL', 'USD', 'active', '{"source_symbol": "GOOGL", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('AMZN', 'Amazon.com Inc.', 'stock', 'AMZN', 'USD', 'active', '{"source_symbol": "AMZN", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('TSLA', 'Tesla Inc.', 'stock', 'TSLA', 'USD', 'active', '{"source_symbol": "TSLA", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('META', 'Meta Platforms Inc.', 'stock', 'META', 'USD', 'active', '{"source_symbol": "META", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('NVDA', 'NVIDIA Corp.', 'stock', 'NVDA', 'USD', 'active', '{"source_symbol": "NVDA", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('JPM', 'JPMorgan Chase', 'stock', 'JPM', 'USD', 'active', '{"source_symbol": "JPM", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('V', 'Visa Inc.', 'stock', 'V', 'USD', 'active', '{"source_symbol": "V", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('JNJ', 'Johnson & Johnson', 'stock', 'JNJ', 'USD', 'active', '{"source_symbol": "JNJ", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('WMT', 'Walmart Inc.', 'stock', 'WMT', 'USD', 'active', '{"source_symbol": "WMT", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('PG', 'Procter & Gamble', 'stock', 'PG', 'USD', 'active', '{"source_symbol": "PG", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('MA', 'Mastercard Inc.', 'stock', 'MA', 'USD', 'active', '{"source_symbol": "MA", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('UNH', 'UnitedHealth Group', 'stock', 'UNH', 'USD', 'active', '{"source_symbol": "UNH", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('HD', 'Home Depot Inc.', 'stock', 'HD', 'USD', 'active', '{"source_symbol": "HD", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('DIS', 'Walt Disney Co.', 'stock', 'DIS', 'USD', 'active', '{"source_symbol": "DIS", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('NFLX', 'Netflix Inc.', 'stock', 'NFLX', 'USD', 'active', '{"source_symbol": "NFLX", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('ADBE', 'Adobe Inc.', 'stock', 'ADBE', 'USD', 'active', '{"source_symbol": "ADBE", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('CRM', 'Salesforce Inc.', 'stock', 'CRM', 'USD', 'active', '{"source_symbol": "CRM", "source_quote": "USD", "provider": "massive", "conversion": "none"}'),
  ('INTC', 'Intel Corp.', 'stock', 'INTC', 'USD', 'active', '{"source_symbol": "INTC", "source_quote": "USD", "provider": "massive", "conversion": "none"}')
ON CONFLICT (symbol) DO UPDATE SET
  name = EXCLUDED.name,
  base_asset = EXCLUDED.base_asset,
  quote_asset = EXCLUDED.quote_asset,
  asset_class = EXCLUDED.asset_class,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- ============================================================
-- Step 5: Seed market_universe table
-- ============================================================

INSERT INTO market_universe (symbol, source_symbol, base_asset, quote_asset, market_type, exchange, provider, label, category, sector, is_active, metadata)
SELECT
  a.symbol,
  a.metadata->>'source_symbol',
  a.base_asset,
  a.quote_asset,
  a.asset_class,
  CASE a.asset_class
    WHEN 'crypto' THEN 'Binance'
    WHEN 'commodity' THEN 'OANDA'
    WHEN 'forex' THEN 'OANDA'
    WHEN 'index' THEN 'OANDA'
    WHEN 'stock' THEN 'NASDAQ'
  END,
  a.metadata->>'provider',
  CASE
    WHEN a.asset_class = 'crypto' AND a.quote_asset = 'USD' THEN split_part(a.symbol, 'USD', 1) || '/USD'
    WHEN a.asset_class = 'crypto' AND a.quote_asset = 'USDT' THEN split_part(a.symbol, 'USDT', 1) || '/USDT'
    WHEN a.asset_class = 'commodity' THEN a.name
    WHEN a.asset_class = 'forex' THEN replace(replace(a.name, ' / ', '/'), 'US Dollar', 'USD')
    WHEN a.asset_class = 'index' THEN a.name
    WHEN a.asset_class = 'stock' THEN a.name
    ELSE a.name
  END,
  CASE
    WHEN a.symbol IN ('BTCUSD','ETHUSD','BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','ADAUSDT','DOGEUSDT') THEN 'Major'
    WHEN a.asset_class = 'crypto' THEN 'Altcoin'
    WHEN a.asset_class = 'forex' AND a.symbol IN ('EURGBP','EURJPY','GBPJPY','AUDJPY','CHFJPY','EURAUD','EURCHF','GBPCHF','AUDCAD','NZDCAD','CADJPY') THEN 'Minor'
    WHEN a.asset_class = 'forex' THEN 'Major'
    WHEN a.asset_class = 'commodity' AND a.symbol IN ('XAUUSD','XAGUSD','XPTUSD','XPDUSD') THEN 'Precious Metals'
    WHEN a.asset_class = 'commodity' AND a.symbol IN ('USOIL','UKOIL','NATGAS') THEN 'Energy'
    WHEN a.asset_class = 'commodity' THEN 'Metals'
    WHEN a.asset_class = 'index' AND a.symbol IN ('SPX500','NAS100','US30') THEN 'US Indices'
    WHEN a.asset_class = 'index' AND a.symbol IN ('UK100','GER40','FRA40') THEN 'European Indices'
    WHEN a.asset_class = 'index' AND a.symbol IN ('JP225','HK50') THEN 'Asian Indices'
    WHEN a.asset_class = 'index' THEN 'Pacific Indices'
    WHEN a.asset_class = 'stock' AND a.symbol IN ('AAPL','MSFT','GOOGL','AMZN','META','NVDA','NFLX','ADBE','CRM','INTC') THEN 'Technology'
    WHEN a.asset_class = 'stock' AND a.symbol IN ('TSLA') THEN 'Automotive'
    WHEN a.asset_class = 'stock' AND a.symbol IN ('JPM','V','MA') THEN 'Financial'
    WHEN a.asset_class = 'stock' AND a.symbol IN ('JNJ','UNH') THEN 'Healthcare'
    WHEN a.asset_class = 'stock' AND a.symbol IN ('WMT','PG','HD') THEN 'Consumer'
    WHEN a.asset_class = 'stock' AND a.symbol = 'DIS' THEN 'Entertainment'
    ELSE 'Other'
  END,
  CASE
    WHEN a.asset_class = 'stock' AND a.symbol = 'AAPL' THEN 'Consumer Electronics'
    WHEN a.asset_class = 'stock' AND a.symbol = 'MSFT' THEN 'Software'
    WHEN a.asset_class = 'stock' AND a.symbol = 'GOOGL' THEN 'Internet Services'
    WHEN a.asset_class = 'stock' AND a.symbol = 'AMZN' THEN 'E-Commerce'
    WHEN a.asset_class = 'stock' AND a.symbol = 'TSLA' THEN 'Electric Vehicles'
    WHEN a.asset_class = 'stock' AND a.symbol = 'META' THEN 'Social Media'
    WHEN a.asset_class = 'stock' AND a.symbol = 'NVDA' THEN 'Semiconductors'
    WHEN a.asset_class = 'stock' AND a.symbol = 'JPM' THEN 'Banking'
    WHEN a.asset_class = 'stock' AND a.symbol IN ('V','MA') THEN 'Payment Services'
    WHEN a.asset_class = 'stock' AND a.symbol = 'JNJ' THEN 'Pharmaceuticals'
    WHEN a.asset_class = 'stock' AND a.symbol = 'WMT' THEN 'Retail'
    WHEN a.asset_class = 'stock' AND a.symbol = 'PG' THEN 'Household Products'
    WHEN a.asset_class = 'stock' AND a.symbol = 'UNH' THEN 'Health Insurance'
    WHEN a.asset_class = 'stock' AND a.symbol = 'HD' THEN 'Home Improvement'
    WHEN a.asset_class = 'stock' AND a.symbol = 'DIS' THEN 'Media'
    WHEN a.asset_class = 'stock' AND a.symbol = 'NFLX' THEN 'Streaming'
    WHEN a.asset_class = 'stock' AND a.symbol IN ('ADBE','CRM') THEN 'Software'
    WHEN a.asset_class = 'stock' AND a.symbol = 'INTC' THEN 'Semiconductors'
    ELSE NULL
  END,
  true,
  a.metadata
FROM assets a
ON CONFLICT (symbol) DO UPDATE SET
  source_symbol = EXCLUDED.source_symbol,
  base_asset = EXCLUDED.base_asset,
  quote_asset = EXCLUDED.quote_asset,
  market_type = EXCLUDED.market_type,
  exchange = EXCLUDED.exchange,
  provider = EXCLUDED.provider,
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  sector = EXCLUDED.sector,
  is_active = EXCLUDED.is_active,
  metadata = EXCLUDED.metadata;

-- ============================================================
-- Step 6: Add indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_market_universe_market_type ON market_universe (market_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_market_universe_symbol ON market_universe (symbol);
CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets (symbol);
