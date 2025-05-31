import { PrismaClient } from '@prisma/client';
import { MeritDistributionService } from './meritDistributionService';

/**
 * Integration service for recording trading volumes when trades occur
 * This should be integrated into your existing trading logic
 */
export class TradeVolumeIntegration {
  private prisma: PrismaClient;
  private meritService: MeritDistributionService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.meritService = new MeritDistributionService(prisma);
  }

  /**
   * Call this method whenever a user completes a trade
   * This will record the USDC volume for merit calculation
   */
  async recordTradeVolume(
    userId: number,
    walletAddress: string,
    fromToken: string,
    toToken: string,
    fromAmount: string,
    toAmount: string,
    transactionHash?: string
  ): Promise<void> {
    try {
      // Calculate USDC volume from the trade
      const usdcVolume = this.calculateUSDCVolume(fromToken, toToken, fromAmount, toAmount);
      
      if (usdcVolume && parseFloat(usdcVolume) > 0) {
        // Record the volume for merit distribution
        await this.meritService.recordTradingVolume(
          userId,
          walletAddress,
          usdcVolume
        );

        console.log(`📊 Recorded ${usdcVolume} USDC volume for user ${userId} (tx: ${transactionHash || 'N/A'})`);
      }
    } catch (error) {
      console.error('Error recording trade volume:', error instanceof Error ? error.message : error);
      // Don't throw - we don't want merit tracking to break the main trading flow
    }
  }

  /**
   * Calculate USDC volume from a trade
   * This logic should be adapted based on your specific trading implementation
   */
  private calculateUSDCVolume(
    fromToken: string,
    toToken: string,
    fromAmount: string,
    toAmount: string
  ): string | null {
    const USDC_ADDRESSES = [
      '0xa0b86a33e6ba1a25e83c02c00e6adf6b2e3f1001', // USDC on Ethereum (example)
      '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC on Polygon (example)
      // Add other USDC token addresses for different chains
    ];

    // Normalize addresses to lowercase for comparison
    const fromTokenLower = fromToken.toLowerCase();
    const toTokenLower = toToken.toLowerCase();
    const usdcAddressesLower = USDC_ADDRESSES.map(addr => addr.toLowerCase());

    // If trading FROM USDC, use fromAmount
    if (usdcAddressesLower.includes(fromTokenLower)) {
      return fromAmount;
    }

    // If trading TO USDC, use toAmount
    if (usdcAddressesLower.includes(toTokenLower)) {
      return toAmount || '0';
    }

    // For non-USDC trades, you might want to:
    // 1. Get USD value of both tokens from a price API
    // 2. Calculate the USD volume
    // 3. Return that as the USDC equivalent
    
    // For now, return null for non-USDC trades
    // You can implement price conversion logic here
    return null;
  }

  /**
   * Enhanced version that uses price data to calculate USDC equivalent
   * This is a placeholder - implement with your preferred price data source
   */
  private async calculateUSDCVolumeWithPrices(
    fromToken: string,
    toToken: string,
    fromAmount: string,
    toAmount: string
  ): Promise<string | null> {
    try {
      // First check if it's already a USDC trade
      const directUSDC = this.calculateUSDCVolume(fromToken, toToken, fromAmount, toAmount);
      if (directUSDC) {
        return directUSDC;
      }

      // For non-USDC trades, get USD prices
      const fromTokenPrice = await this.getTokenUSDPrice(fromToken);
      const toTokenPrice = await this.getTokenUSDPrice(toToken);

      if (fromTokenPrice) {
        const usdVolume = parseFloat(fromAmount) * fromTokenPrice;
        return usdVolume.toFixed(8);
      }

      if (toTokenPrice && toAmount) {
        const usdVolume = parseFloat(toAmount) * toTokenPrice;
        return usdVolume.toFixed(8);
      }

      return null;
    } catch (error) {
      console.error('Error calculating USDC volume with prices:', error);
      return null;
    }
  }

  /**
   * Get token USD price - implement with your preferred price data source
   * This is a placeholder implementation
   */
  private async getTokenUSDPrice(tokenAddress: string): Promise<number | null> {
    // Implement price fetching logic here
    // Examples:
    // - CoinGecko API
    // - CoinMarketCap API
    // - 1inch API
    // - Your existing price service
    
    // Placeholder implementation
    return null;
  }

  /**
   * Integration example for your existing transaction processing
   */
  async onTransactionCompleted(transaction: {
    id: string;
    userId: number;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    toAmount: string;
    txHash: string;
    status: 'completed' | 'failed';
  }): Promise<void> {
    // Only record volume for successful transactions
    if (transaction.status !== 'completed') {
      return;
    }

    // Get user wallet address
    const user = await this.prisma.user.findUnique({
      where: { telegramId: transaction.userId },
      select: { walletAddress: true }
    });

    if (!user) {
      console.error(`User ${transaction.userId} not found`);
      return;
    }

    // Record the trade volume
    await this.recordTradeVolume(
      transaction.userId,
      user.walletAddress,
      transaction.fromToken,
      transaction.toToken,
      transaction.fromAmount,
      transaction.toAmount,
      transaction.txHash
    );
  }

  /**
   * Get user's trading volume for a specific date
   */
  async getUserVolumeForDate(userId: number, date: Date): Promise<string> {
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const volume = await this.prisma.tradingVolume.findUnique({
      where: {
        userId_date: {
          userId,
          date: dateOnly
        }
      },
      select: { usdcVolume: true }
    });

    return volume?.usdcVolume || '0';
  }

  /**
   * Get user's total trading volume for a date range
   */
  async getUserVolumeForRange(userId: number, startDate: Date, endDate: Date): Promise<string> {
    const volumes = await this.prisma.tradingVolume.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      select: { usdcVolume: true }
    });

    return volumes.reduce((total, volume) => {
      const num1 = parseFloat(total);
      const num2 = parseFloat(volume.usdcVolume);
      return (num1 + num2).toFixed(8);
    }, '0');
  }
}

/**
 * Example integration in your existing trading service
 */
export class ExampleTradingServiceIntegration {
  private tradeVolumeIntegration: TradeVolumeIntegration;

  constructor(prisma: PrismaClient) {
    this.tradeVolumeIntegration = new TradeVolumeIntegration(prisma);
  }

  async executeSwap(
    userId: number,
    fromToken: string,
    toToken: string,
    fromAmount: string
  ): Promise<{ success: boolean; txHash?: string; toAmount?: string }> {
    try {
      // Your existing swap logic here
      const swapResult = await this.performSwap(fromToken, toToken, fromAmount);
      
      if (swapResult.success && swapResult.txHash && swapResult.toAmount) {
        // Record the trading volume for merit calculation
        await this.tradeVolumeIntegration.onTransactionCompleted({
          id: swapResult.txHash,
          userId,
          fromToken,
          toToken,
          fromAmount,
          toAmount: swapResult.toAmount,
          txHash: swapResult.txHash,
          status: 'completed'
        });
      }

      return swapResult;
    } catch (error) {
      console.error('Swap failed:', error);
      return { success: false };
    }
  }

  private async performSwap(
    fromToken: string,
    toToken: string,
    fromAmount: string
  ): Promise<{ success: boolean; txHash?: string; toAmount?: string }> {
    // Placeholder for your actual swap implementation
    // This would integrate with 1inch, DEX, or your trading infrastructure
    return {
      success: true,
      txHash: '0x' + Math.random().toString(16).substring(2),
      toAmount: (parseFloat(fromAmount) * 0.99).toString() // Example with slippage
    };
  }
} 