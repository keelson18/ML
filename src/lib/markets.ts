import type { Market, MarketType } from './types';

// Full market universe — single source of truth for all instruments
export const MARKET_UNIVERSE: Market[] = [
  // ---- Crypto (USD-settled via Massive, ticker format X:<BASE>USD) ----
  { symbol: 'BTCUSD', canonicalSymbol: 'BTCUSD', sourceSymbol: 'X:BTCUSD', id: 'crypto-btc-usd', baseAsset: 'BTC', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'BTC/USD', provider: 'massive', category: 'Major', isActive: true },
  { symbol: 'ETHUSD', canonicalSymbol: 'ETHUSD', sourceSymbol: 'X:ETHUSD', id: 'crypto-eth-usd', baseAsset: 'ETH', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'ETH/USD', provider: 'massive', category: 'Major', isActive: true },
  { symbol: 'SOLUSD', canonicalSymbol: 'SOLUSD', sourceSymbol: 'X:SOLUSD', id: 'crypto-sol-usd', baseAsset: 'SOL', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'SOL/USD', provider: 'massive', category: 'Major', isActive: true },
  { symbol: 'XRPUSD', canonicalSymbol: 'XRPUSD', sourceSymbol: 'X:XRPUSD', id: 'crypto-xrp-usd', baseAsset: 'XRP', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'XRP/USD', provider: 'massive', category: 'Major', isActive: true },
  { symbol: 'BNBUSD', canonicalSymbol: 'BNBUSD', sourceSymbol: 'X:BNBUSD', id: 'crypto-bnb-usd', baseAsset: 'BNB', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'BNB/USD', provider: 'massive', category: 'Major', isActive: true },
  { symbol: 'ADAUSD', canonicalSymbol: 'ADAUSD', sourceSymbol: 'X:ADAUSD', id: 'crypto-ada-usd', baseAsset: 'ADA', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'ADA/USD', provider: 'massive', category: 'Major', isActive: true },
  { symbol: 'DOGEUSD', canonicalSymbol: 'DOGEUSD', sourceSymbol: 'X:DOGEUSD', id: 'crypto-doge-usd', baseAsset: 'DOGE', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'DOGE/USD', provider: 'massive', category: 'Major', isActive: true },
  { symbol: 'AVAXUSD', canonicalSymbol: 'AVAXUSD', sourceSymbol: 'X:AVAXUSD', id: 'crypto-avax-usd', baseAsset: 'AVAX', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'AVAX/USD', provider: 'massive', category: 'Altcoin', isActive: true },
  { symbol: 'LINKUSD', canonicalSymbol: 'LINKUSD', sourceSymbol: 'X:LINKUSD', id: 'crypto-link-usd', baseAsset: 'LINK', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'LINK/USD', provider: 'massive', category: 'Altcoin', isActive: true },
  { symbol: 'DOTUSD', canonicalSymbol: 'DOTUSD', sourceSymbol: 'X:DOTUSD', id: 'crypto-dot-usd', baseAsset: 'DOT', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'DOT/USD', provider: 'massive', category: 'Altcoin', isActive: true },
  // MATIC was renamed to POL by Polygon; using POL ticker
  { symbol: 'POLUSD', canonicalSymbol: 'POLUSD', sourceSymbol: 'X:POLUSD', id: 'crypto-pol-usd', baseAsset: 'POL', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'POL/USD', provider: 'massive', category: 'Altcoin', isActive: true },
  { symbol: 'LTCUSD', canonicalSymbol: 'LTCUSD', sourceSymbol: 'X:LTCUSD', id: 'crypto-ltc-usd', baseAsset: 'LTC', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'LTC/USD', provider: 'massive', category: 'Altcoin', isActive: true },
  { symbol: 'BCHUSD', canonicalSymbol: 'BCHUSD', sourceSymbol: 'X:BCHUSD', id: 'crypto-bch-usd', baseAsset: 'BCH', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'BCH/USD', provider: 'massive', category: 'Altcoin', isActive: true },
  { symbol: 'XLMUSD', canonicalSymbol: 'XLMUSD', sourceSymbol: 'X:XLMUSD', id: 'crypto-xlm-usd', baseAsset: 'XLM', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'XLM/USD', provider: 'massive', category: 'Altcoin', isActive: true },
  { symbol: 'UNIUSD', canonicalSymbol: 'UNIUSD', sourceSymbol: 'X:UNIUSD', id: 'crypto-uni-usd', baseAsset: 'UNI', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'UNI/USD', provider: 'massive', category: 'Altcoin', isActive: true },
  { symbol: 'ATOMUSD', canonicalSymbol: 'ATOMUSD', sourceSymbol: 'X:ATOMUSD', id: 'crypto-atom-usd', baseAsset: 'ATOM', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'ATOM/USD', provider: 'massive', category: 'Altcoin', isActive: true },
  { symbol: 'ETCUSD', canonicalSymbol: 'ETCUSD', sourceSymbol: 'X:ETCUSD', id: 'crypto-etc-usd', baseAsset: 'ETC', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'ETC/USD', provider: 'massive', category: 'Altcoin', isActive: true },
  { symbol: 'FILUSD', canonicalSymbol: 'FILUSD', sourceSymbol: 'X:FILUSD', id: 'crypto-fil-usd', baseAsset: 'FIL', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'FIL/USD', provider: 'massive', category: 'Altcoin', isActive: true },
  { symbol: 'NEARUSD', canonicalSymbol: 'NEARUSD', sourceSymbol: 'X:NEARUSD', id: 'crypto-near-usd', baseAsset: 'NEAR', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'NEAR/USD', provider: 'massive', category: 'Altcoin', isActive: true },
  { symbol: 'APTUSD', canonicalSymbol: 'APTUSD', sourceSymbol: 'X:APTUSD', id: 'crypto-apt-usd', baseAsset: 'APT', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'APT/USD', provider: 'massive', category: 'Altcoin', isActive: true },

  // ---- Forex Majors ----
  { symbol: 'EURUSD', sourceSymbol: 'EUR/USD', baseAsset: 'EUR', quoteAsset: 'USD', marketType: 'forex', exchange: 'Twelve Data', label: 'EUR/USD', provider: 'twelvedata', category: 'Major', isActive: true },
  { symbol: 'GBPUSD', baseAsset: 'GBP', quoteAsset: 'USD', marketType: 'forex', exchange: 'Twelve Data', label: 'GBP/USD', provider: 'twelvedata', category: 'Major', isActive: true },
  { symbol: 'USDJPY', baseAsset: 'USD', quoteAsset: 'JPY', marketType: 'forex', exchange: 'Twelve Data', label: 'USD/JPY', provider: 'twelvedata', category: 'Major', isActive: true },
  { symbol: 'USDCHF', baseAsset: 'USD', quoteAsset: 'CHF', marketType: 'forex', exchange: 'Twelve Data', label: 'USD/CHF', provider: 'twelvedata', category: 'Major', isActive: true },
  { symbol: 'AUDUSD', baseAsset: 'AUD', quoteAsset: 'USD', marketType: 'forex', exchange: 'Twelve Data', label: 'AUD/USD', provider: 'twelvedata', category: 'Major', isActive: true },
  { symbol: 'NZDUSD', baseAsset: 'NZD', quoteAsset: 'USD', marketType: 'forex', exchange: 'Twelve Data', label: 'NZD/USD', provider: 'twelvedata', category: 'Major', isActive: true },
  { symbol: 'USDCAD', baseAsset: 'USD', quoteAsset: 'CAD', marketType: 'forex', exchange: 'Twelve Data', label: 'USD/CAD', provider: 'twelvedata', category: 'Major', isActive: true },

  // ---- Forex Minors ----
  { symbol: 'EURGBP', baseAsset: 'EUR', quoteAsset: 'GBP', marketType: 'forex', exchange: 'Twelve Data', label: 'EUR/GBP', provider: 'twelvedata', category: 'Minor', isActive: true },
  { symbol: 'EURJPY', baseAsset: 'EUR', quoteAsset: 'JPY', marketType: 'forex', exchange: 'Twelve Data', label: 'EUR/JPY', provider: 'twelvedata', category: 'Minor', isActive: true },
  { symbol: 'GBPJPY', baseAsset: 'GBP', quoteAsset: 'JPY', marketType: 'forex', exchange: 'Twelve Data', label: 'GBP/JPY', provider: 'twelvedata', category: 'Minor', isActive: true },
  { symbol: 'AUDJPY', baseAsset: 'AUD', quoteAsset: 'JPY', marketType: 'forex', exchange: 'Twelve Data', label: 'AUD/JPY', provider: 'twelvedata', category: 'Minor', isActive: true },
  { symbol: 'CHFJPY', baseAsset: 'CHF', quoteAsset: 'JPY', marketType: 'forex', exchange: 'Twelve Data', label: 'CHF/JPY', provider: 'twelvedata', category: 'Minor', isActive: true },
  { symbol: 'EURAUD', baseAsset: 'EUR', quoteAsset: 'AUD', marketType: 'forex', exchange: 'Twelve Data', label: 'EUR/AUD', provider: 'twelvedata', category: 'Minor', isActive: true },
  { symbol: 'EURCHF', baseAsset: 'EUR', quoteAsset: 'CHF', marketType: 'forex', exchange: 'Twelve Data', label: 'EUR/CHF', provider: 'twelvedata', category: 'Minor', isActive: true },
  { symbol: 'GBPCHF', baseAsset: 'GBP', quoteAsset: 'CHF', marketType: 'forex', exchange: 'Twelve Data', label: 'GBP/CHF', provider: 'twelvedata', category: 'Minor', isActive: true },
  { symbol: 'AUDCAD', baseAsset: 'AUD', quoteAsset: 'CAD', marketType: 'forex', exchange: 'Twelve Data', label: 'AUD/CAD', provider: 'twelvedata', category: 'Minor', isActive: true },
  { symbol: 'NZDCAD', baseAsset: 'NZD', quoteAsset: 'CAD', marketType: 'forex', exchange: 'Twelve Data', label: 'NZD/CAD', provider: 'twelvedata', category: 'Minor', isActive: true },
  { symbol: 'CADJPY', baseAsset: 'CAD', quoteAsset: 'JPY', marketType: 'forex', exchange: 'Twelve Data', label: 'CAD/JPY', provider: 'twelvedata', category: 'Minor', isActive: true },

  // ---- Commodities ----
  { symbol: 'XAUUSD', sourceSymbol: 'XAU/USD', baseAsset: 'XAU', quoteAsset: 'USD', marketType: 'commodity', exchange: 'Twelve Data', label: 'Gold (XAU/USD)', provider: 'twelvedata', category: 'Precious Metals', isActive: true },
  { symbol: 'XAGUSD', baseAsset: 'XAG', quoteAsset: 'USD', marketType: 'commodity', exchange: 'Twelve Data', label: 'Silver (XAG/USD)', provider: 'twelvedata', category: 'Precious Metals', isActive: true },
  { symbol: 'XPTUSD', baseAsset: 'XPT', quoteAsset: 'USD', marketType: 'commodity', exchange: 'Twelve Data', label: 'Platinum (XPT/USD)', provider: 'twelvedata', category: 'Precious Metals', isActive: true },
  { symbol: 'XPDUSD', baseAsset: 'XPD', quoteAsset: 'USD', marketType: 'commodity', exchange: 'Twelve Data', label: 'Palladium (XPD/USD)', provider: 'twelvedata', category: 'Precious Metals', isActive: true },
  { symbol: 'USOIL', sourceSymbol: 'WTI/USD', baseAsset: 'USOIL', quoteAsset: 'USD', marketType: 'commodity', exchange: 'Twelve Data', label: 'Crude Oil (USOIL)', provider: 'twelvedata', category: 'Energy', isActive: true },
  { symbol: 'UKOIL', sourceSymbol: 'BRENT/USD', baseAsset: 'UKOIL', quoteAsset: 'USD', marketType: 'commodity', exchange: 'Twelve Data', label: 'Brent Oil (UKOIL)', provider: 'twelvedata', category: 'Energy', isActive: true },
  { symbol: 'NATGAS', sourceSymbol: 'NATGAS/USD', baseAsset: 'NATGAS', quoteAsset: 'USD', marketType: 'commodity', exchange: 'Twelve Data', label: 'Natural Gas', provider: 'twelvedata', category: 'Energy', isActive: true },
  { symbol: 'XCUUSD', baseAsset: 'XCU', quoteAsset: 'USD', marketType: 'commodity', exchange: 'Twelve Data', label: 'Copper', provider: 'twelvedata', category: 'Metals', isActive: true },

  // ---- Indices ----
  { symbol: 'SPX500', canonicalSymbol: 'SPX500', sourceSymbol: 'I:SPX', baseAsset: 'SPX', quoteAsset: 'USD', marketType: 'index', exchange: 'Massive', label: 'S&P 500', provider: 'massive', category: 'US Indices', isActive: true },
  { symbol: 'NAS100', canonicalSymbol: 'NAS100', sourceSymbol: 'I:NDX', baseAsset: 'NAS', quoteAsset: 'USD', marketType: 'index', exchange: 'Massive', label: 'NASDAQ 100', provider: 'massive', category: 'US Indices', isActive: true },
  { symbol: 'US30', canonicalSymbol: 'US30', sourceSymbol: 'I:DJI', baseAsset: 'US30', quoteAsset: 'USD', marketType: 'index', exchange: 'Massive', label: 'Dow Jones', provider: 'massive', category: 'US Indices', isActive: true },
  { symbol: 'UK100', canonicalSymbol: 'UK100', sourceSymbol: 'I:UKX', baseAsset: 'UK100', quoteAsset: 'GBP', marketType: 'index', exchange: 'Massive', label: 'FTSE 100', provider: 'massive', category: 'European Indices', isActive: true },
  { symbol: 'GER40', canonicalSymbol: 'GER40', sourceSymbol: 'I:DAX', baseAsset: 'GER40', quoteAsset: 'EUR', marketType: 'index', exchange: 'Massive', label: 'DAX 40', provider: 'massive', category: 'European Indices', isActive: true },
  { symbol: 'FRA40', canonicalSymbol: 'FRA40', sourceSymbol: 'I:PX1', baseAsset: 'FRA40', quoteAsset: 'EUR', marketType: 'index', exchange: 'Massive', label: 'CAC 40', provider: 'massive', category: 'European Indices', isActive: true },
  { symbol: 'JP225', baseAsset: 'JP225', quoteAsset: 'JPY', marketType: 'index', exchange: 'OANDA', label: 'Nikkei 225', provider: 'oanda', category: 'Asian Indices', isActive: true },
  { symbol: 'HK50', baseAsset: 'HK50', quoteAsset: 'HKD', marketType: 'index', exchange: 'OANDA', label: 'Hang Seng', provider: 'oanda', category: 'Asian Indices', isActive: true },
  { symbol: 'AUS200', baseAsset: 'AUS200', quoteAsset: 'AUD', marketType: 'index', exchange: 'OANDA', label: 'ASX 200', provider: 'oanda', category: 'Pacific Indices', isActive: true },

  // ---- Stocks ----
  { symbol: 'AAPL', baseAsset: 'AAPL', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Apple Inc.', provider: 'massive', category: 'Technology', sector: 'Consumer Electronics', isActive: true },
  { symbol: 'MSFT', baseAsset: 'MSFT', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Microsoft Corp.', provider: 'massive', category: 'Technology', sector: 'Software', isActive: true },
  { symbol: 'GOOGL', baseAsset: 'GOOGL', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Alphabet Inc.', provider: 'massive', category: 'Technology', sector: 'Internet Services', isActive: true },
  { symbol: 'AMZN', baseAsset: 'AMZN', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Amazon.com Inc.', provider: 'massive', category: 'Technology', sector: 'E-Commerce', isActive: true },
  { symbol: 'TSLA', baseAsset: 'TSLA', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Tesla Inc.', provider: 'massive', category: 'Automotive', sector: 'Electric Vehicles', isActive: true },
  { symbol: 'META', baseAsset: 'META', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Meta Platforms Inc.', provider: 'massive', category: 'Technology', sector: 'Social Media', isActive: true },
  { symbol: 'NVDA', baseAsset: 'NVDA', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'NVIDIA Corp.', provider: 'massive', category: 'Technology', sector: 'Semiconductors', isActive: true },
  { symbol: 'JPM', baseAsset: 'JPM', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'JPMorgan Chase', provider: 'massive', category: 'Financial', sector: 'Banking', isActive: true },
  { symbol: 'V', baseAsset: 'V', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Visa Inc.', provider: 'massive', category: 'Financial', sector: 'Payment Services', isActive: true },
  { symbol: 'JNJ', baseAsset: 'JNJ', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Johnson & Johnson', provider: 'massive', category: 'Healthcare', sector: 'Pharmaceuticals', isActive: true },
  { symbol: 'WMT', baseAsset: 'WMT', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Walmart Inc.', provider: 'massive', category: 'Consumer', sector: 'Retail', isActive: true },
  { symbol: 'PG', baseAsset: 'PG', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Procter & Gamble', provider: 'massive', category: 'Consumer', sector: 'Household Products', isActive: true },
  { symbol: 'MA', baseAsset: 'MA', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Mastercard Inc.', provider: 'massive', category: 'Financial', sector: 'Payment Services', isActive: true },
  { symbol: 'UNH', baseAsset: 'UNH', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'UnitedHealth Group', provider: 'massive', category: 'Healthcare', sector: 'Health Insurance', isActive: true },
  { symbol: 'HD', baseAsset: 'HD', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Home Depot Inc.', provider: 'massive', category: 'Consumer', sector: 'Home Improvement', isActive: true },
  { symbol: 'DIS', baseAsset: 'DIS', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Walt Disney Co.', provider: 'massive', category: 'Entertainment', sector: 'Media', isActive: true },
  { symbol: 'NFLX', baseAsset: 'NFLX', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Netflix Inc.', provider: 'massive', category: 'Technology', sector: 'Streaming', isActive: true },
  { symbol: 'ADBE', baseAsset: 'ADBE', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Adobe Inc.', provider: 'massive', category: 'Technology', sector: 'Software', isActive: true },
  { symbol: 'CRM', baseAsset: 'CRM', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Salesforce Inc.', provider: 'massive', category: 'Technology', sector: 'Enterprise Software', isActive: true },
  { symbol: 'INTC', baseAsset: 'INTC', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Intel Corp.', provider: 'massive', category: 'Technology', sector: 'Semiconductors', isActive: true },
];

// Legacy USDT symbol → canonical USD symbol mapping for backward compatibility
const LEGACY_SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: 'BTCUSD', ETHUSDT: 'ETHUSD', SOLUSDT: 'SOLUSD', XRPUSDT: 'XRPUSD',
  ADAUSDT: 'ADAUSD', DOGEUSDT: 'DOGEUSD', AVAXUSDT: 'AVAXUSD',
  LINKUSDT: 'LINKUSD', DOTUSDT: 'DOTUSD', MATICUSDT: 'POLUSD', LTCUSDT: 'LTCUSD',
  BCHUSDT: 'BCHUSD', XLMUSDT: 'XLMUSD', UNIUSDT: 'UNIUSD', ATOMUSDT: 'ATOMUSD',
  ETCUSDT: 'ETCUSD', FILUSDT: 'FILUSD', NEARUSDT: 'NEARUSD', APTUSDT: 'APTUSD',
};

const legacyUsageLog = new Set<string>();

export function resolveLegacySymbol(symbol: string): string {
  const canonical = LEGACY_SYMBOL_MAP[symbol];
  if (canonical && !legacyUsageLog.has(symbol)) {
    legacyUsageLog.add(symbol);
    console.warn(`[markets] Resolved legacy symbol "${symbol}" → "${canonical}". Update references to use the canonical USD symbol.`);
  }
  return canonical ?? symbol;
}

// Lookup helpers
export function getMarketsByType(type: MarketType): Market[] {
  return MARKET_UNIVERSE.filter((m) => m.marketType === type && m.isActive);
}

export function getMarket(symbol: string): Market | undefined {
  const resolved = resolveLegacySymbol(symbol);
  return MARKET_UNIVERSE.find((m) => m.symbol === resolved);
}

export function formatMarketPrice(symbol: string, price: number | null | undefined, maximumFractionDigits = 2): string {
  if (price == null) return '--';
  const resolved = resolveLegacySymbol(symbol);
  const currency = getMarket(resolved)?.priceCurrency ?? getMarket(resolved)?.quoteAsset;
  const formattedPrice = price.toLocaleString(undefined, { maximumFractionDigits });
  return currency === 'USD' ? `$${formattedPrice}` : `${formattedPrice} ${currency ?? ''}`.trim();
}

export function getMarketsByProvider(provider: string): Market[] {
  return MARKET_UNIVERSE.filter((m) => m.provider === provider && m.isActive);
}

// Group markets by type for UI selectors
export function getMarketsGrouped(): Record<MarketType, Market[]> {
  return {
    crypto: getMarketsByType('crypto'),
    forex: getMarketsByType('forex'),
    commodity: getMarketsByType('commodity'),
    index: getMarketsByType('index'),
    stock: getMarketsByType('stock'),
  };
}
