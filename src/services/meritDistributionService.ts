import { PrismaClient, MeritDistributionStatus } from '@prisma/client';
import axios from 'axios';

interface BlockscoutDistribution {
  address: string;
  amount: string;
}

interface BlockscoutDistributeRequest {
  id: string;
  description: string;
  distributions: BlockscoutDistribution[];
  create_missing_accounts: boolean;
  expected_total: string;
}

interface BlockscoutDistributeResponse {
  accounts_distributed: string;
  accounts_created: string;
}

export class MeritDistributionService {
  private prisma: PrismaClient;
  private apiKey: string;
  private baseUrl: string = 'https://merits-staging.blockscout.com';

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.apiKey = process.env.BLOCKSCOUT_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('BLOCKSCOUT_API_KEY environment variable is required');
    }
  }

  /**
   * Record trading volume for a user
   */
  async recordTradingVolume(
    userId: number,
    walletAddress: string,
    usdcVolume: string,
    date: Date = new Date()
  ): Promise<void> {
    // Round date to start of day for consistency
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    await this.prisma.tradingVolume.upsert({
      where: {
        userId_date: {
          userId,
          date: dateOnly,
        },
      },
      update: {
        usdcVolume: this.addDecimalStrings(
          (await this.prisma.tradingVolume.findUnique({
            where: { userId_date: { userId, date: dateOnly } }
          }))?.usdcVolume || '0',
          usdcVolume
        ),
        updatedAt: new Date(),
      },
      create: {
        userId,
        walletAddress,
        usdcVolume,
        date: dateOnly,
      },
    });
  }

  /**
   * Get top traders by volume for a specific date
   */
  async getTopTraders(date: Date, limit: number = 1000): Promise<Array<{
    userId: number;
    walletAddress: string;
    usdcVolume: string;
  }>> {
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const topTraders = await this.prisma.tradingVolume.findMany({
      where: {
        date: dateOnly,
      },
      orderBy: {
        usdcVolume: 'desc',
      },
      take: limit,
      select: {
        userId: true,
        walletAddress: true,
        usdcVolume: true,
      },
    });

    // Filter out volumes less than 0.01
    return topTraders.filter(trader => 
      parseFloat(trader.usdcVolume) >= 0.01
    );
  }

  /**
   * Distribute merits to top traders for a specific date
   */
  async distributeMeritsForDate(date: Date): Promise<{
    success: boolean;
    distributedCount: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let distributedCount = 0;

    try {
      // Get top traders for the date
      const topTraders = await this.getTopTraders(date, 1000);
      
      if (topTraders.length === 0) {
        return {
          success: true,
          distributedCount: 0,
          errors: ['No traders found for the specified date'],
        };
      }

      // Prepare distributions for Blockscout API
      const distributions: BlockscoutDistribution[] = topTraders.map(trader => ({
        address: trader.walletAddress,
        amount: this.formatAmount(trader.usdcVolume), // 1:1 ratio with USDC volume
      }));

      // Calculate expected total
      const expectedTotal = distributions.reduce(
        (sum, dist) => this.addDecimalStrings(sum, dist.amount),
        '0'
      );

      // Create unique distribution ID
      const distributionId = `daily_trading_merits_${date.toISOString().split('T')[0]}_${Date.now()}`;

      // Call Blockscout API
      const apiResponse = await this.callBlockscoutAPI({
        id: distributionId,
        description: `Daily trading volume merits for ${date.toISOString().split('T')[0]}`,
        distributions,
        create_missing_accounts: true,
        expected_total: expectedTotal,
      });

      // Record distribution attempts in database
      const distributionPromises = topTraders.map(trader =>
        this.prisma.meritDistribution.create({
          data: {
            userId: trader.userId,
            walletAddress: trader.walletAddress,
            distributionId,
            amount: this.formatAmount(trader.usdcVolume),
            usdcVolume: trader.usdcVolume,
            date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
            status: MeritDistributionStatus.success,
            blockscoutTxId: JSON.stringify(apiResponse),
          },
        })
      );

      await Promise.all(distributionPromises);
      distributedCount = topTraders.length;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      errors.push(errorMessage);

      // If we had partial success, mark failed ones
      const topTraders = await this.getTopTraders(date, 1000);
      const distributionId = `daily_trading_merits_${date.toISOString().split('T')[0]}_${Date.now()}_failed`;
      
      const failedDistributionPromises = topTraders.map(trader =>
        this.prisma.meritDistribution.create({
          data: {
            userId: trader.userId,
            walletAddress: trader.walletAddress,
            distributionId,
            amount: this.formatAmount(trader.usdcVolume),
            usdcVolume: trader.usdcVolume,
            date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
            status: MeritDistributionStatus.failed,
            errorMessage,
          },
        })
      );

      await Promise.allSettled(failedDistributionPromises);
    }

    return {
      success: errors.length === 0,
      distributedCount,
      errors,
    };
  }

  /**
   * Call Blockscout API to distribute merits
   */
  private async callBlockscoutAPI(request: BlockscoutDistributeRequest): Promise<BlockscoutDistributeResponse> {
    const response = await axios.post(
      `${this.baseUrl}/partner/api/v1/distribute`,
      request,
      {
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.status !== 200) {
      throw new Error(`Blockscout API error: ${response.status} ${response.statusText}`);
    }

    return response.data;
  }

  /**
   * Format amount to have maximum 2 decimal places and minimum 0.01
   */
  private formatAmount(amount: string): string {
    const num = parseFloat(amount);
    if (num < 0.01) {
      return '0.01';
    }
    return num.toFixed(2);
  }

  /**
   * Add two decimal strings safely
   */
  private addDecimalStrings(a: string, b: string): string {
    const numA = parseFloat(a || '0');
    const numB = parseFloat(b || '0');
    return (numA + numB).toFixed(8); // Keep high precision internally
  }

  /**
   * Get merit distribution history for a user
   */
  async getUserMeritHistory(userId: number): Promise<Array<{
    id: string;
    amount: string;
    usdcVolume: string;
    date: Date;
    status: MeritDistributionStatus;
    createdAt: Date;
  }>> {
    return await this.prisma.meritDistribution.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        amount: true,
        usdcVolume: true,
        date: true,
        status: true,
        createdAt: true,
      },
    });
  }

  /**
   * Get total merits distributed for a date range
   */
  async getTotalMeritsDistributed(startDate: Date, endDate: Date): Promise<{
    totalAmount: string;
    totalRecipients: number;
    successfulDistributions: number;
    failedDistributions: number;
  }> {
    const distributions = await this.prisma.meritDistribution.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const successfulDistributions = distributions.filter(d => d.status === MeritDistributionStatus.success);
    const failedDistributions = distributions.filter(d => d.status === MeritDistributionStatus.failed);

    const totalAmount = successfulDistributions.reduce(
      (sum, dist) => this.addDecimalStrings(sum, dist.amount),
      '0'
    );

    return {
      totalAmount: parseFloat(totalAmount).toFixed(2),
      totalRecipients: new Set(distributions.map(d => d.userId)).size,
      successfulDistributions: successfulDistributions.length,
      failedDistributions: failedDistributions.length,
    };
  }

  /**
   * Check partner balance on Blockscout
   */
  async checkPartnerBalance(): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/partner/api/v1/balance`,
        {
          headers: {
            'Authorization': this.apiKey,
          },
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to check partner balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 