import axios from 'axios';
import { SUPPORTED_TOKENS } from '../config/tokens';
import { SupportedToken } from '../types';

export interface MarketCapData {
  symbol: string;
  market_cap: number;
  price: number;
  circulating_supply: number;
  total_supply: number;
  last_updated: string;
}

export interface PortfolioAllocation {
  token: string;
  allocation: number;
}

export interface BlackLittermanPortfolio {
  allocations: PortfolioAllocation[];
  totalMarketCap: number;
  timestamp: string;
}

export interface CoinMarketCapResponse {
  data: {
    [key: string]: {
      symbol: string;
      quote: {
        USD: {
          market_cap: number;
          price: number;
          circulating_supply: number;
          total_supply: number;
          last_updated: string;
        };
      };
    };
  };
  status: {
    timestamp: string;
    error_code: number;
    error_message: string | null;
  };
}

/**
 * Strategy Service for portfolio management using Black-Litterman model
 * Fetches market cap data from CoinMarketCap Pro API and calculates allocations
 */
export class StrategyService {
  private readonly apiKey: string;
  private readonly baseUrl: string = 'https://pro-api.coinmarketcap.com/v1';
  private readonly supportedTokens: SupportedToken[];

  constructor() {
    this.apiKey = process.env.COINMARKETCAP_PRO_KEY || '';
    if (!this.apiKey) {
      throw new Error('COINMARKETCAP_PRO_KEY environment variable is required');
    }
    
    // Get unique token symbols (remove duplicates across chains)
    const uniqueSymbols = new Set(SUPPORTED_TOKENS.map(token => token.symbol));
    this.supportedTokens = Array.from(uniqueSymbols).map(symbol => 
      SUPPORTED_TOKENS.find(token => token.symbol === symbol)!
    );
    
    console.log(`🎯 Strategy Service initialized with ${this.supportedTokens.length} unique tokens`);
  }

  /**
   * Fetch market cap data for all supported tokens from CoinMarketCap Pro API
   */
  async fetchMarketCapData(): Promise<MarketCapData[]> {
    const symbols = this.supportedTokens.map(token => token.symbol).join(',');
    const url = `${this.baseUrl}/cryptocurrency/quotes/latest`;
    
    const config = {
      headers: {
        'X-CMC_PRO_API_KEY': this.apiKey,
        'Accept': 'application/json',
        'Accept-Charset': 'utf-8',
        'Accept-Encoding': 'deflate, gzip'
      },
      params: {
        symbol: symbols,
        convert: 'USD'
      }
    };

    console.log(`📊 Fetching market cap data for symbols: ${symbols}`);

    try {
      const response = await axios.get<CoinMarketCapResponse>(url, config);
      
      if (response.data.status.error_code !== 0) {
        throw new Error(`CoinMarketCap API error: ${response.data.status.error_message}`);
      }

      const marketCapData: MarketCapData[] = [];
      
      for (const [symbol, data] of Object.entries(response.data.data)) {
        marketCapData.push({
          symbol: data.symbol,
          market_cap: data.quote.USD.market_cap,
          price: data.quote.USD.price,
          circulating_supply: data.quote.USD.circulating_supply,
          total_supply: data.quote.USD.total_supply,
          last_updated: data.quote.USD.last_updated
        });
      }

      console.log(`✅ Successfully fetched market cap data for ${marketCapData.length} tokens`);
      return marketCapData;
      
    } catch (error) {
      console.error('❌ Error fetching market cap data:', error);
      throw new Error(`Failed to fetch market cap data: ${error}`);
    }
  }

  /**
   * Calculate Black-Litterman based portfolio allocations using market cap weights
   * In this simplified implementation, we use market cap proportions as the baseline
   */
  calculateBlackLittermanAllocations(marketCapData: MarketCapData[]): BlackLittermanPortfolio {
    console.log('🧮 Calculating Black-Litterman portfolio allocations...');

    // Filter out tokens with zero or negative market cap
    const validTokens = marketCapData.filter(token => 
      token.market_cap > 0 && 
      isFinite(token.market_cap) && 
      !isNaN(token.market_cap)
    );

    if (validTokens.length === 0) {
      throw new Error('No valid tokens with positive market cap found');
    }

    // Calculate total market cap
    const totalMarketCap = validTokens.reduce((sum, token) => sum + token.market_cap, 0);
    
    // Calculate market cap weights (this serves as our baseline for Black-Litterman)
    const allocations: PortfolioAllocation[] = validTokens.map(token => ({
      token: token.symbol,
      allocation: token.market_cap / totalMarketCap
    }));

    // Apply Black-Litterman adjustments
    // In a full implementation, this would include:
    // 1. Risk aversion parameter (lambda)
    // 2. Covariance matrix of returns
    // 3. Investor views and confidence matrix
    // 4. Optimization to get adjusted weights
    
    // For now, we apply some basic adjustments:
    // - Reduce allocation to stablecoins slightly
    // - Boost allocation to larger cap tokens
    const adjustedAllocations = this.applyBlackLittermanAdjustments(allocations, validTokens);

    // Normalize to ensure sum equals 1
    const totalWeight = adjustedAllocations.reduce((sum, item) => sum + item.allocation, 0);
    const normalizedAllocations = adjustedAllocations.map(item => ({
      ...item,
      allocation: item.allocation / totalWeight
    }));

    // Sort by allocation descending
    normalizedAllocations.sort((a, b) => b.allocation - a.allocation);

    const portfolio: BlackLittermanPortfolio = {
      allocations: normalizedAllocations,
      totalMarketCap,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ Portfolio calculated with ${portfolio.allocations.length} tokens`);
    console.log('📈 Top 5 allocations:');
    portfolio.allocations.slice(0, 5).forEach(item => {
      console.log(`  ${item.token}: ${(item.allocation * 100).toFixed(2)}%`);
    });

    return portfolio;
  }

  /**
   * Apply Black-Litterman style adjustments to market cap weights
   */
  private applyBlackLittermanAdjustments(
    allocations: PortfolioAllocation[], 
    marketData: MarketCapData[]
  ): PortfolioAllocation[] {
    const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD'];
    const largeCapThreshold = 10_000_000_000; // $10B market cap
    
    return allocations.map(allocation => {
      const tokenData = marketData.find(data => data.symbol === allocation.token);
      if (!tokenData) return allocation;

      let adjustedAllocation = allocation.allocation;

      // Reduce stablecoin allocation by 20%
      if (stablecoins.includes(allocation.token)) {
        adjustedAllocation *= 0.8;
      }

      // Boost large cap tokens by 10%
      if (tokenData.market_cap > largeCapThreshold) {
        adjustedAllocation *= 1.1;
      }

      // Reduce very small allocations (< 0.5%) by half to avoid dust
      if (adjustedAllocation < 0.005) {
        adjustedAllocation *= 0.5;
      }

      return {
        ...allocation,
        allocation: adjustedAllocation
      };
    });
  }

  /**
   * Create a formatted JSON message for posting to Hedera
   */
  createHederaMessage(portfolio: BlackLittermanPortfolio): string {
    const message = {
      type: 'portfolio_allocation',
      timestamp: portfolio.timestamp,
      total_market_cap: portfolio.totalMarketCap,
      strategy: 'black_litterman',
      allocations: portfolio.allocations.map(item => ({
        token: item.token,
        allocation: Number(item.allocation.toFixed(6)) // Round to 6 decimal places
      }))
    };

    return JSON.stringify(message, null, 2);
  }

  /**
   * Get portfolio allocations with formatted message ready for Hedera posting
   */
  async getPortfolioAllocation(): Promise<{
    portfolio: BlackLittermanPortfolio;
    hederaMessage: string;
  }> {
    console.log('🚀 Starting portfolio allocation calculation...');
    
    // Fetch market cap data
    const marketCapData = await this.fetchMarketCapData();
    
    // Calculate Black-Litterman allocations
    const portfolio = this.calculateBlackLittermanAllocations(marketCapData);
    
    // Create Hedera message
    const hederaMessage = this.createHederaMessage(portfolio);
    
    console.log('✅ Portfolio allocation completed');
    console.log(`📝 Message size: ${hederaMessage.length} characters`);
    
    return {
      portfolio,
      hederaMessage
    };
  }

  /**
   * Get a summary of the current portfolio
   */
  getPortfolioSummary(portfolio: BlackLittermanPortfolio): string {
    const topAllocations = portfolio.allocations.slice(0, 10);
    const totalTopAllocation = topAllocations.reduce((sum, item) => sum + item.allocation, 0);
    
    let summary = `🎯 Portfolio Summary (Black-Litterman Strategy)\n`;
    summary += `📊 Total Market Cap: $${(portfolio.totalMarketCap / 1e9).toFixed(2)}B\n`;
    summary += `📅 Generated: ${new Date(portfolio.timestamp).toLocaleString()}\n\n`;
    summary += `📈 Top ${topAllocations.length} Allocations (${(totalTopAllocation * 100).toFixed(1)}% of portfolio):\n`;
    
    topAllocations.forEach((item, index) => {
      summary += `${index + 1}. ${item.token}: ${(item.allocation * 100).toFixed(2)}%\n`;
    });
    
    if (portfolio.allocations.length > 10) {
      const remainingTokens = portfolio.allocations.length - 10;
      const remainingAllocation = 1 - totalTopAllocation;
      summary += `... and ${remainingTokens} other tokens (${(remainingAllocation * 100).toFixed(2)}%)\n`;
    }
    
    return summary;
  }

  /**
   * Generate a simple text-based chart for allocations
   */
  generateAllocationChart(portfolio: BlackLittermanPortfolio): string {
    const topAllocations = portfolio.allocations.slice(0, 15);
    const maxPercentage = Math.max(...topAllocations.map(item => item.allocation * 100));
    const maxBarLength = 25;
    
    let chart = `📊 CucumberMoped Index Allocations Chart\n\n`;
    
    topAllocations.forEach((item, index) => {
      const percentage = item.allocation * 100;
      const barLength = Math.round((percentage / maxPercentage) * maxBarLength);
      const bar = '█'.repeat(barLength) + '▒'.repeat(maxBarLength - barLength);
      
      chart += `${String(index + 1).padStart(2)}. ${item.token.padEnd(8)} │${bar}│ ${percentage.toFixed(2)}%\n`;
    });
    
    if (portfolio.allocations.length > 15) {
      const remainingTokens = portfolio.allocations.length - 15;
      const remainingAllocation = portfolio.allocations.slice(15).reduce((sum, item) => sum + item.allocation, 0);
      chart += `    Others    │${'░'.repeat(maxBarLength)}│ ${(remainingAllocation * 100).toFixed(2)}% (${remainingTokens} tokens)\n`;
    }
    
    chart += `\n💰 Total Market Cap: $${(portfolio.totalMarketCap / 1e9).toFixed(2)}B`;
    chart += `\n📅 Last Updated: ${new Date(portfolio.timestamp).toLocaleString()}`;
    
    return chart;
  }

  /**
   * Create a comprehensive index overview
   */
  createIndexOverview(portfolio: BlackLittermanPortfolio, isNewCalculation: boolean = false): string {
    let overview = `🥒 CucumberMoped Index Overview\n\n`;
    
    if (isNewCalculation) {
      overview += `🆕 **Fresh Calculation Generated**\n`;
    } else {
      overview += `📋 **Current Index Composition**\n`;
    }
    
    overview += `Strategy: Black-Litterman Market Cap Weighted\n`;
    overview += `Total Market Cap: $${(portfolio.totalMarketCap / 1e9).toFixed(2)}B\n`;
    overview += `Number of Tokens: ${portfolio.allocations.length}\n`;
    overview += `Last Updated: ${new Date(portfolio.timestamp).toLocaleString()}\n\n`;
    
    // Key metrics
    const topAllocation = portfolio.allocations[0];
    const top5Allocation = portfolio.allocations.slice(0, 5).reduce((sum, item) => sum + item.allocation, 0);
    const top10Allocation = portfolio.allocations.slice(0, 10).reduce((sum, item) => sum + item.allocation, 0);
    
    overview += `📊 **Key Metrics:**\n`;
    overview += `• Largest Position: ${topAllocation.token} (${(topAllocation.allocation * 100).toFixed(2)}%)\n`;
    overview += `• Top 5 Concentration: ${(top5Allocation * 100).toFixed(1)}%\n`;
    overview += `• Top 10 Concentration: ${(top10Allocation * 100).toFixed(1)}%\n`;
    overview += `• Diversification Score: ${this.calculateDiversificationScore(portfolio)}/10\n\n`;
    
    // Strategy notes
    overview += `🎯 **Strategy Notes:**\n`;
    overview += `• Market cap weighted baseline with Black-Litterman adjustments\n`;
    overview += `• Reduced stablecoin allocation for growth focus\n`;
    overview += `• Large cap bias for stability\n`;
    overview += `• Automatic rebalancing every 10+ minutes\n\n`;
    
    return overview;
  }

  /**
   * Calculate a simple diversification score (1-10)
   */
  private calculateDiversificationScore(portfolio: BlackLittermanPortfolio): number {
    // Calculate Herfindahl-Hirschman Index (HHI)
    const hhi = portfolio.allocations.reduce((sum, item) => sum + Math.pow(item.allocation, 2), 0);
    
    // Convert to diversification score (lower HHI = higher diversification)
    // Perfect diversification with n assets would have HHI = 1/n
    const maxHHI = 1; // Single asset
    const minHHI = 1 / portfolio.allocations.length; // Perfectly diversified
    
    // Normalize to 1-10 scale (higher is more diversified)
    const normalizedScore = (maxHHI - hhi) / (maxHHI - minHHI);
    return Math.round(normalizedScore * 9 + 1); // Scale to 1-10
  }
}
