import type { Market, MarketType } from './types';

// Full market universe definition
export const MARKET_UNIVERSE: Market[] = [
  // ---- Crypto ----
  { symbol: 'BTCUSD', baseAsset: 'BTC', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'BTC/USDT', provider: 'binance', category: 'Major', isActive: true },
  { symbol: 'ETHUSD', baseAsset: 'ETH', quoteAsset: 'USDT', marketType: 'crypto', exchange: 'Binance', label: 'ETH/USDT', provider: 'binance', category: 'Major', isActive: true },
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

  // ---- Forex Majors ----
  { symbol: 'EURUSD', baseAsset: 'EUR', quoteAsset: 'USD', marketType: 'forex', exchange: 'OANDA', label: 'EUR/USD', provider: 'oanda', category: 'Major', isActive: true },
  { symbol: 'GBPUSD', baseAsset: 'GBP', quoteAsset: 'USD', marketType: 'forex', exchange: 'OANDA', label: 'GBP/USD', provider: 'oanda', category: 'Major', isActive: true },
  { symbol: 'USDJPY', baseAsset: 'USD', quoteAsset: 'JPY', marketType: 'forex', exchange: 'OANDA', label: 'USD/JPY', provider: 'oanda', category: 'Major', isActive: true },
  { symbol: 'USDCHF', baseAsset: 'USD', quoteAsset: 'CHF', marketType: 'forex', exchange: 'OANDA', label: 'USD/CHF', provider: 'oanda', category: 'Major', isActive: true },
  { symbol: 'AUDUSD', baseAsset: 'AUD', quoteAsset: 'USD', marketType: 'forex', exchange: 'OANDA', label: 'AUD/USD', provider: 'oanda', category: 'Major', isActive: true },
  { symbol: 'NZDUSD', baseAsset: 'NZD', quoteAsset: 'USD', marketType: 'forex', exchange: 'OANDA', label: 'NZD/USD', provider: 'oanda', category: 'Major', isActive: true },
  { symbol: 'USDCAD', baseAsset: 'USD', quoteAsset: 'CAD', marketType: 'forex', exchange: 'OANDA', label: 'USD/CAD', provider: 'oanda', category: 'Major', isActive: true },

  // ---- Forex Minors ----
  { symbol: 'EURGBP', baseAsset: 'EUR', quoteAsset: 'GBP', marketType: 'forex', exchange: 'OANDA', label: 'EUR/GBP', provider: 'oanda', category: 'Minor', isActive: true },
  { symbol: 'EURJPY', baseAsset: 'EUR', quoteAsset: 'JPY', marketType: 'forex', exchange: 'OANDA', label: 'EUR/JPY', provider: 'oanda', category: 'Minor', isActive: true },
  { symbol: 'GBPJPY', baseAsset: 'GBP', quoteAsset: 'JPY', marketType: 'forex', exchange: 'OANDA', label: 'GBP/JPY', provider: 'oanda', category: 'Minor', isActive: true },
  { symbol: 'AUDJPY', baseAsset: 'AUD', quoteAsset: 'JPY', marketType: 'forex', exchange: 'OANDA', label: 'AUD/JPY', provider: 'oanda', category: 'Minor', isActive: true },
  { symbol: 'CHFJPY', baseAsset: 'CHF', quoteAsset: 'JPY', marketType: 'forex', exchange: 'OANDA', label: 'CHF/JPY', provider: 'oanda', category: 'Minor', isActive: true },
  { symbol: 'EURAUD', baseAsset: 'EUR', quoteAsset: 'AUD', marketType: 'forex', exchange: 'OANDA', label: 'EUR/AUD', provider: 'oanda', category: 'Minor', isActive: true },
  { symbol: 'EURCHF', baseAsset: 'EUR', quoteAsset: 'CHF', marketType: 'forex', exchange: 'OANDA', label: 'EUR/CHF', provider: 'oanda', category: 'Minor', isActive: true },
  { symbol: 'GBPCHF', baseAsset: 'GBP', quoteAsset: 'CHF', marketType: 'forex', exchange: 'OANDA', label: 'GBP/CHF', provider: 'oanda', category: 'Minor', isActive: true },
  { symbol: 'AUDCAD', baseAsset: 'AUD', quoteAsset: 'CAD', marketType: 'forex', exchange: 'OANDA', label: 'AUD/CAD', provider: 'oanda', category: 'Minor', isActive: true },
  { symbol: 'NZDCAD', baseAsset: 'NZD', quoteAsset: 'CAD', marketType: 'forex', exchange: 'OANDA', label: 'NZD/CAD', provider: 'oanda', category: 'Minor', isActive: true },
  { symbol: 'CADJPY', baseAsset: 'CAD', quoteAsset: 'JPY', marketType: 'forex', exchange: 'OANDA', label: 'CAD/JPY', provider: 'oanda', category: 'Minor', isActive: true },

  // ---- Commodities ----
  { symbol: 'XAUUSD', baseAsset: 'XAU', quoteAsset: 'USD', marketType: 'commodity', exchange: 'OANDA', label: 'Gold (XAU/USD)', provider: 'oanda', category: 'Precious Metals', isActive: true },
  { symbol: 'XAGUSD', baseAsset: 'XAG', quoteAsset: 'USD', marketType: 'commodity', exchange: 'OANDA', label: 'Silver (XAG/USD)', provider: 'oanda', category: 'Precious Metals', isActive: true },
  { symbol: 'XPTUSD', baseAsset: 'XPT', quoteAsset: 'USD', marketType: 'commodity', exchange: 'OANDA', label: 'Platinum (XPT/USD)', provider: 'oanda', category: 'Precious Metals', isActive: true },
  { symbol: 'XPDUSD', baseAsset: 'XPD', quoteAsset: 'USD', marketType: 'commodity', exchange: 'OANDA', label: 'Palladium (XPD/USD)', provider: 'oanda', category: 'Precious Metals', isActive: true },
  { symbol: 'USOIL', baseAsset: 'USOIL', quoteAsset: 'USD', marketType: 'commodity', exchange: 'OANDA', label: 'Crude Oil (USOIL)', provider: 'oanda', category: 'Energy', isActive: true },
  { symbol: 'UKOIL', baseAsset: 'UKOIL', quoteAsset: 'USD', marketType: 'commodity', exchange: 'OANDA', label: 'Brent Oil (UKOIL)', provider: 'oanda', category: 'Energy', isActive: true },
  { symbol: 'NATGAS', baseAsset: 'NATGAS', quoteAsset: 'USD', marketType: 'commodity', exchange: 'OANDA', label: 'Natural Gas', provider: 'oanda', category: 'Energy', isActive: true },
  { symbol: 'XCUUSD', baseAsset: 'XCU', quoteAsset: 'USD', marketType: 'commodity', exchange: 'OANDA', label: 'Copper', provider: 'oanda', category: 'Metals', isActive: true },

  // ---- Indices ----
  { symbol: 'SPX500', baseAsset: 'SPX', quoteAsset: 'USD', marketType: 'index', exchange: 'OANDA', label: 'S&P 500', provider: 'oanda', category: 'US Indices', isActive: true },
  { symbol: 'NAS100', baseAsset: 'NAS', quoteAsset: 'USD', marketType: 'index', exchange: 'OANDA', label: 'NASDAQ 100', provider: 'oanda', category: 'US Indices', isActive: true },
  { symbol: 'US30', baseAsset: 'US30', quoteAsset: 'USD', marketType: 'index', exchange: 'OANDA', label: 'Dow Jones', provider: 'oanda', category: 'US Indices', isActive: true },
  { symbol: 'UK100', baseAsset: 'UK100', quoteAsset: 'GBP', marketType: 'index', exchange: 'OANDA', label: 'FTSE 100', provider: 'oanda', category: 'European Indices', isActive: true },
  { symbol: 'GER40', baseAsset: 'GER40', quoteAsset: 'EUR', marketType: 'index', exchange: 'OANDA', label: 'DAX 40', provider: 'oanda', category: 'European Indices', isActive: true },
  { symbol: 'FRA40', baseAsset: 'FRA40', quoteAsset: 'EUR', marketType: 'index', exchange: 'OANDA', label: 'CAC 40', provider: 'oanda', category: 'European Indices', isActive: true },
  { symbol: 'JP225', baseAsset: 'JP225', quoteAsset: 'JPY', marketType: 'index', exchange: 'OANDA', label: 'Nikkei 225', provider: 'oanda', category: 'Asian Indices', isActive: true },
  { symbol: 'HK50', baseAsset: 'HK50', quoteAsset: 'HKD', marketType: 'index', exchange: 'OANDA', label: 'Hang Seng', provider: 'oanda', category: 'Asian Indices', isActive: true },
  { symbol: 'AUS200', baseAsset: 'AUS200', quoteAsset: 'AUD', marketType: 'index', exchange: 'OANDA', label: 'ASX 200', provider: 'oanda', category: 'Pacific Indices', isActive: true },

  // ---- Stocks ----
  { symbol: 'AAPL', baseAsset: 'AAPL', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Apple Inc.', provider: 'polygon', category: 'Technology', sector: 'Consumer Electronics', isActive: true },
  { symbol: 'MSFT', baseAsset: 'MSFT', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Microsoft Corp.', provider: 'polygon', category: 'Technology', sector: 'Software', isActive: true },
  { symbol: 'GOOGL', baseAsset: 'GOOGL', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Alphabet Inc.', provider: 'polygon', category: 'Technology', sector: 'Internet Services', isActive: true },
  { symbol: 'AMZN', baseAsset: 'AMZN', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Amazon.com Inc.', provider: 'polygon', category: 'Technology', sector: 'E-Commerce', isActive: true },
  { symbol: 'TSLA', baseAsset: 'TSLA', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Tesla Inc.', provider: 'polygon', category: 'Automotive', sector: 'Electric Vehicles', isActive: true },
  { symbol: 'META', baseAsset: 'META', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Meta Platforms Inc.', provider: 'polygon', category: 'Technology', sector: 'Social Media', isActive: true },
  { symbol: 'NVDA', baseAsset: 'NVDA', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'NVIDIA Corp.', provider: 'polygon', category: 'Technology', sector: 'Semiconductors', isActive: true },
  { symbol: 'JPM', baseAsset: 'JPM', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'JPMorgan Chase', provider: 'polygon', category: 'Financial', sector: 'Banking', isActive: true },
  { symbol: 'V', baseAsset: 'V', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Visa Inc.', provider: 'polygon', category: 'Financial', sector: 'Payment Services', isActive: true },
  { symbol: 'JNJ', baseAsset: 'JNJ', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Johnson & Johnson', provider: 'polygon', category: 'Healthcare', sector: 'Pharmaceuticals', isActive: true },
  { symbol: 'WMT', baseAsset: 'WMT', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Walmart Inc.', provider: 'polygon', category: 'Consumer', sector: 'Retail', isActive: true },
  { symbol: 'PG', baseAsset: 'PG', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Procter & Gamble', provider: 'polygon', category: 'Consumer', sector: 'Household Products', isActive: true },
  { symbol: 'MA', baseAsset: 'MA', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Mastercard Inc.', provider: 'polygon', category: 'Financial', sector: 'Payment Services', isActive: true },
  { symbol: 'UNH', baseAsset: 'UNH', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'UnitedHealth Group', provider: 'polygon', category: 'Healthcare', sector: 'Health Insurance', isActive: true },
  { symbol: 'HD', baseAsset: 'HD', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Home Depot Inc.', provider: 'polygon', category: 'Consumer', sector: 'Home Improvement', isActive: true },
  { symbol: 'DIS', baseAsset: 'DIS', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Walt Disney Co.', provider: 'polygon', category: 'Entertainment', sector: 'Media', isActive: true },
  { symbol: 'NFLX', baseAsset: 'NFLX', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Netflix Inc.', provider: 'polygon', category: 'Technology', sector: 'Streaming', isActive: true },
  { symbol: 'ADBE', baseAsset: 'ADBE', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Adobe Inc.', provider: 'polygon', category: 'Technology', sector: 'Software', isActive: true },
  { symbol: 'CRM', baseAsset: 'CRM', quoteAsset: 'USD', marketType: 'stock', exchange: 'NYSE', label: 'Salesforce Inc.', provider: 'polygon', category: 'Technology', sector: 'Enterprise Software', isActive: true },
  { symbol: 'INTC', baseAsset: 'INTC', quoteAsset: 'USD', marketType: 'stock', exchange: 'NASDAQ', label: 'Intel Corp.', provider: 'polygon', category: 'Technology', sector: 'Semiconductors', isActive: true },
];

// Lookup helpers
export function getMarketsByType(type: MarketType): Market[] {
  return MARKET_UNIVERSE.filter((m) => m.marketType === type && m.isActive);
}

export function getMarket(symbol: string): Market | undefined {
  return MARKET_UNIVERSE.find((m) => m.symbol === symbol);
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

