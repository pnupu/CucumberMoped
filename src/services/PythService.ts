import { HermesClient } from '@pythnetwork/hermes-client';
import axios from 'axios';

export interface PythPriceData {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
  ema_price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}

export interface PythPriceUpdate {
  binary: {
    encoding: string;
    data: string[];
  };
  parsed: PythPriceData[];
}

export class PythService {
  private hermesClient: HermesClient;
  private readonly STALENESS_THRESHOLD = 86400; // 24 hours in seconds (but user wants this to be very high)

  // Price feed IDs for tokens we support (matching tokens.ts)
  private readonly PRICE_FEED_IDS = {
    // Major tokens (available on multiple chains)
    'BTC': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    'ETH': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    'USDC': '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
    'USDT': '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
    
    // Ethereum tokens
    'WBTC': '0xc9d8b075a5c69303365ae23633d4e085199bf5c520a3b90fed1322a0342ffc33',
    'AAVE': '0x2b9ab1e972a281585084148ba1389800799bd4be63b957507db1349314e47445',
    'PEPE': '0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4',
    'LINK': '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
    'UNI': '0x78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501',
    'MOG': '0x17894b9fff49cd07efeab94a0d02db16f158efe04e0dee1db6af5f069082ce83',
    'SPX': '0x8414cfadf82f6bed644d2e399c11df21ec0131aa574c56030b132113dbbf3a0a', // SPX6900
    
    // Base tokens
    'DEGEN': '0x9c93e4a22c56885af427ac4277437e756e7ec403fbc892f975d497383bb33560',
    'BRETT': '0x9b5729efe3d68e537cdcb2ca70444dea5f06e1660b562632609757076d0b9448',
    'VIRTUAL': '0x8132e3eb1dac3e56939a16ff83848d194345f6688bff97eb1c8bd462d558802b',
    'AERO': '0x9db37f4d5654aad3e37e2e14ffd8d53265fb3026d1d8f91146539eebaa2ef45f',
    'TOSHI': '0x3450d9fbb8c3cf749578315668e21fabb4cd78dcfda1c1cba698b804bae2db2a',
    'ZORA': '0x93eacee7286be62044cd8dfbdfdf1bea8f52a3ca6e0f512f4a05bd383f5666b1',
    'MORPHO': '0x5b2a4c542d4a74dd11784079ef337c0403685e3114ba0d9909b5c7a7e06fdc42',
    
    // Arbitrum tokens  
    'PENDLE': '0x9a4df90b25497f66b1afb012467e316e801ca3d839456db028892fe8c70c8016',
    'CRV': '0xa19d04ac696c7a6616d291c7e5d1377cc8be437c327b75adb5dc1bad745fcae8',
    'ATH': '0xf6b551a947e7990089e2d5149b1e44b369fcc6ad3627cb822362a2b19d24ad4a',
    'GMX': '0xb962539d0fcb272a494d65ea56f94851c2bcf8823935da05bd628916e2e9edbf',
    'GRT': '0x4d1f8dae0d96236fb98e8f47471a366ec3b1732b47041781934ca3a9bb2f35e7',
    
    // Additional popular tokens we support
    'ARB': '0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5',
    'OP': '0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf',
    'POL': '0xffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472',
    
    // Add aliases for common naming
    'CBBTC': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // Same as BTC
    'WETH': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', // Same as ETH
  };

  constructor(hermesUrl = 'https://hermes.pyth.network') {
    this.hermesClient = new HermesClient(hermesUrl, {});
  }

  /**
   * Get EMA price for a token
   * @param tokenSymbol Token symbol (e.g., 'BTC', 'ETH', 'USDC')
   * @returns EMA price as a number
   */
  async getEmaPrice(tokenSymbol: string): Promise<number> {
    const priceId = this.getPriceFeedId(tokenSymbol);
    
    try {
      console.log(`🔍 Fetching Pyth EMA price for ${tokenSymbol}`);
      
      // Get latest price update
      const priceUpdate = await this.hermesClient.getLatestPriceUpdates([priceId]);
      
      if (!priceUpdate.parsed || priceUpdate.parsed.length === 0) {
        throw new Error(`No price data available for ${tokenSymbol}`);
      }

      const priceData = priceUpdate.parsed[0];
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Check if price is stale (older than threshold)
      if (currentTime - priceData.ema_price.publish_time > this.STALENESS_THRESHOLD) {
        console.log(`⚠️ Price data for ${tokenSymbol} is older than ${this.STALENESS_THRESHOLD} seconds, but continuing anyway`);
        // User wants to set this threshold very high so it practically never updates
      }

      // Convert price to human readable format
      const emaPrice = parseInt(priceData.ema_price.price) * Math.pow(10, priceData.ema_price.expo);
      
      console.log(`✅ EMA price for ${tokenSymbol}: $${emaPrice.toFixed(6)}`);
      return emaPrice;
      
    } catch (error) {
      console.error(`❌ Error fetching EMA price for ${tokenSymbol}:`, error);
      throw new Error(`Failed to fetch EMA price for ${tokenSymbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get multiple EMA prices at once
   * @param tokenSymbols Array of token symbols
   * @returns Map of token symbol to EMA price
   */
  async getMultipleEmaPrices(tokenSymbols: string[]): Promise<Map<string, number>> {
    const priceIds = tokenSymbols.map(symbol => this.getPriceFeedId(symbol));
    const results = new Map<string, number>();
    
    try {
      console.log(`🔍 Fetching Pyth EMA prices for: ${tokenSymbols.join(', ')}`);
      
      const priceUpdate = await this.hermesClient.getLatestPriceUpdates(priceIds);
      
      if (!priceUpdate.parsed || priceUpdate.parsed.length === 0) {
        throw new Error('No price data available');
      }

      for (let i = 0; i < priceUpdate.parsed.length; i++) {
        const priceData = priceUpdate.parsed[i];
        const tokenSymbol = tokenSymbols[i];
        
        const emaPrice = parseInt(priceData.ema_price.price) * Math.pow(10, priceData.ema_price.expo);
        results.set(tokenSymbol, emaPrice);
      }
      
      console.log(`✅ Fetched EMA prices for ${results.size} tokens`);
      return results;
      
    } catch (error) {
      console.error('❌ Error fetching multiple EMA prices:', error);
      throw new Error(`Failed to fetch EMA prices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get price update data for on-chain updates
   * @param tokenSymbol Token symbol
   * @returns Price update data in binary format for on-chain submission
   */
  async getPriceUpdateData(tokenSymbol: string): Promise<string[]> {
    const priceId = this.getPriceFeedId(tokenSymbol);
    
    try {
      const priceUpdate = await this.hermesClient.getLatestPriceUpdates([priceId]);
      
      if (!priceUpdate.binary || !priceUpdate.binary.data) {
        throw new Error(`No binary price update data available for ${tokenSymbol}`);
      }

      return priceUpdate.binary.data;
      
    } catch (error) {
      console.error(`❌ Error fetching price update data for ${tokenSymbol}:`, error);
      throw new Error(`Failed to fetch price update data for ${tokenSymbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get price feed ID for a token symbol
   * @param tokenSymbol Token symbol
   * @returns Price feed ID
   */
  private getPriceFeedId(tokenSymbol: string): string {
    const normalizedSymbol = tokenSymbol.toUpperCase();
    const priceId = this.PRICE_FEED_IDS[normalizedSymbol as keyof typeof this.PRICE_FEED_IDS];
    
    if (!priceId) {
      throw new Error(`Price feed ID not found for token: ${tokenSymbol}. Available tokens: ${Object.keys(this.PRICE_FEED_IDS).join(', ')}`);
    }
    
    return priceId;
  }

  /**
   * Add a new price feed ID for a token
   * @param tokenSymbol Token symbol
   * @param priceId Pyth price feed ID
   */
  addPriceFeed(tokenSymbol: string, priceId: string): void {
    (this.PRICE_FEED_IDS as any)[tokenSymbol.toUpperCase()] = priceId;
    console.log(`✅ Added price feed for ${tokenSymbol}: ${priceId}`);
  }

  /**
   * Get all supported tokens
   * @returns Array of supported token symbols
   */
  getSupportedTokens(): string[] {
    return Object.keys(this.PRICE_FEED_IDS);
  }

  /**
   * Check if a token is supported
   * @param tokenSymbol Token symbol
   * @returns Whether the token is supported
   */
  isTokenSupported(tokenSymbol: string): boolean {
    return tokenSymbol.toUpperCase() in this.PRICE_FEED_IDS;
  }
} 