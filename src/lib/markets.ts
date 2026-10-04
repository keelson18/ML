import type { Market, MarketType } from './types';

// Full market universe definition
export const MARKET_UNIVERSE: Market[] = [
  // ---- Crypto ----
  { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'BTC/USDT', provider: 'binance', category: 'Major', isActive: true },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'ETH/USDT', provider: 'binance', category: 'Major', isActive: true },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'SOL/USDT', provider: 'binance', category: 'Major', isActive: true },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'XRP/USDT', provider: 'binance', category: 'Major', isActive: true },
  { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'BNB/USDT', provider: 'binance', category: 'Major', isActive: true },
  { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'ADA/USDT', provider: 'binance', category: 'Major', isActive: true },
  { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'DOGE/USDT', provider: 'binance', category: 'Major', isActive: true },
  { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'AVAX/USDT', provider: 'binance', category: 'Altcoin', isActive: true },
  { symbol: 'LINKUSDT', baseAsset: 'LINK', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'LINK/USDT', provider: 'binance', category: 'Altcoin', isActive: true },
  { symbol: 'DOTUSDT', baseAsset: 'DOT', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'DOT/USDT', provider: 'binance', category: 'Altcoin', isActive: true },
  { symbol: 'MATICUSDT', baseAsset: 'MATIC', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'MATIC/USDT', provider: 'binance', category: 'Altcoin', isActive: true },
  { symbol: 'LTCUSDT', baseAsset: 'LTC', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'LTC/USDT', provider: 'binance', category: 'Altcoin', isActive: true },
  { symbol: 'BCHUSDT', baseAsset: 'BCH', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'BCH/USDT', provider: 'binance', category: 'Altcoin', isActive: true },
  { symbol: 'XLMUSDT', baseAsset: 'XLM', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'XLM/USDT', provider: 'binance', category: 'Altcoin', isActive: true },
  { symbol: 'UNIUSDT', baseAsset: 'UNI', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'UNI/USDT', provider: 'binance', category: 'Altcoin', isActive: true },
  { symbol: 'ATOMUSDT', baseAsset: 'ATOM', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'ATOM/USDT', provider: 'binance', category: 'Altcoin', isActive: true },
  { symbol: 'ETCUSDT', baseAsset: 'ETC', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'ETC/USDT', provider: 'binance', category: 'Altcoin', isActive: true },
  { symbol: 'FILUSDT', baseAsset: 'FIL', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'FIL/USDT', provider: 'binance', category: 'Altcoin', isActive: true },
  { symbol: 'NEARUSDT', baseAsset: 'NEAR', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'NEAR/USDT', provider: 'binance', category: 'Altcoin', isActive: true },
  { symbol: 'APTUSDT', baseAsset: 'APT', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'APT/USDT', provider: 'binance', category: 'Altcoin', isActive: true },

  { symbol: 'BTCUSD', canonicalSymbol: 'BTCUSD', sourceSymbol: 'X:BTCUSD', id: 'crypto-btc-usd', baseAsset: 'BTC', quoteAsset: 'USD', priceCurrency: 'USD', marketType: 'crypto', exchange: 'Massive', label: 'BTC/USD', provider: 'massive', category: 'Major', isActive: true },

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

// Lookup helpers
export function getMarketsByType(type: MarketType): Market[] {
  return MARKET_UNIVERSE.filter((m) => m.marketType === type && m.isActive);
}

export function getMarket(symbol: string): Market | undefined {
  return MARKET_UNIVERSE.find((m) => m.symbol === symbol);
}

export function formatMarketPrice(symbol: string, price: number | null | undefined, maximumFractionDigits = 2): string {
  if (price == null) return '--';
  const currency = getMarket(symbol)?.priceCurrency ?? getMarket(symbol)?.quoteAsset;
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
