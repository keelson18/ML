/**
 * Asset Domain Entity
 * Represents a tradable instrument (crypto, forex, commodity, index, stock)
 * Core building block of the market universe
 */

export type AssetClass = 'crypto' | 'forex' | 'commodity' | 'index' | 'stock';
export type AssetStatus = 'active' | 'suspended' | 'delisted';

export interface AssetMetadata {
  exchange?: string;
  sector?: string;
  category?: string;
  minVolume?: number;
  tickSize?: number;
  lotSize?: number;
  sessionTZ?: string;
  provider?: string;
}

/**
 * Asset: Core tradable instrument
 */
export class Asset {
  constructor(
    readonly id: string,
    readonly symbol: string,
    readonly name: string,
    readonly baseAsset: string,
    readonly quoteAsset: string,
    readonly assetClass: AssetClass,
    readonly status: AssetStatus,
    readonly metadata: AssetMetadata = {},
    readonly createdAt: Date = new Date(),
    readonly updatedAt: Date = new Date(),
  ) {}

  isActive(): boolean {
    return this.status === 'active';
  }

  displaySymbol(): string {
    return this.baseAsset && this.quoteAsset
      ? `${this.baseAsset}/${this.quoteAsset}`
      : this.symbol;
  }

  static create(
    symbol: string,
    name: string,
    baseAsset: string,
    quoteAsset: string,
    assetClass: AssetClass,
    metadata?: AssetMetadata,
  ): Asset {
    const id = `${baseAsset}-${quoteAsset}`.toLowerCase();
    return new Asset(id, symbol, name, baseAsset, quoteAsset, assetClass, 'active', metadata);
  }
}

/**
 * AssetRegistry: Manages known assets
 */
export class AssetRegistry {
  private assets = new Map<string, Asset>();

  register(asset: Asset): void {
    if (this.assets.has(asset.id)) {
      throw new Error(`Asset ${asset.id} already registered`);
    }
    this.assets.set(asset.id, asset);
  }

  get(id: string): Asset | undefined {
    return this.assets.get(id);
  }

  getBySymbol(symbol: string): Asset | undefined {
    return Array.from(this.assets.values()).find((a) => a.symbol === symbol);
  }

  all(): Asset[] {
    return Array.from(this.assets.values());
  }

  activeAssets(): Asset[] {
    return this.all().filter((a) => a.isActive());
  }

  static bootstrap(): AssetRegistry {
    const registry = new AssetRegistry();

    // Initial market universe per specification
    const assets = [
      Asset.create('BTCUSD', 'Bitcoin', 'BTC', 'USD', 'crypto', { exchange: 'Binance' }),
      Asset.create('ETHUSD', 'Ethereum', 'ETH', 'USD', 'crypto', { exchange: 'Binance' }),
      Asset.create('XAUUSD', 'Gold Spot', 'XAU', 'USD', 'commodity'),
      Asset.create('XAGUSD', 'Silver Spot', 'XAG', 'USD', 'commodity'),
      Asset.create('EURUSD', 'EUR/USD', 'EUR', 'USD', 'forex', { sessionTZ: 'UTC' }),
    ];

    assets.forEach((a) => registry.register(a));
    return registry;
  }
}
