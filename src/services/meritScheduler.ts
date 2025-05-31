import { PrismaClient } from '@prisma/client';
import { MeritDistributionService } from './meritDistributionService';

export class MeritScheduler {
  private prisma: PrismaClient;
  private meritService: MeritDistributionService;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.meritService = new MeritDistributionService(prisma);
  }

  /**
   * Start the daily merit distribution scheduler
   * Runs at a specified time each day (default: 00:00 UTC)
   */
  startDailyScheduler(hourUTC: number = 0, minuteUTC: number = 0) {
    console.log(`🕐 Starting daily merit distribution scheduler at ${hourUTC.toString().padStart(2, '0')}:${minuteUTC.toString().padStart(2, '0')} UTC`);

    // Calculate milliseconds until next scheduled time
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setUTCHours(hourUTC, minuteUTC, 0, 0);

    // If the scheduled time has passed today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }

    const msUntilNext = nextRun.getTime() - now.getTime();
    console.log(`⏰ Next merit distribution: ${nextRun.toISOString()}`);

    // Set initial timeout
    setTimeout(() => {
      this.runDailyDistribution();
      
      // Set up daily interval (24 hours)
      this.intervalId = setInterval(() => {
        this.runDailyDistribution();
      }, 24 * 60 * 60 * 1000);
    }, msUntilNext);
  }

  /**
   * Stop the scheduler
   */
  stopScheduler() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Merit distribution scheduler stopped');
    }
  }

  /**
   * Run merit distribution for the previous day
   */
  private async runDailyDistribution() {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0); // Start of day

    console.log(`\n🎯 Running daily merit distribution for ${yesterday.toISOString().split('T')[0]}...`);

    try {
      const result = await this.meritService.distributeMeritsForDate(yesterday);

      if (result.success) {
        console.log(`✅ Successfully distributed merits to ${result.distributedCount} traders`);
        
        // Log statistics
        const stats = await this.meritService.getTotalMeritsDistributed(yesterday, yesterday);
        console.log(`📊 Total distributed: ${stats.totalAmount} merits to ${stats.totalRecipients} recipients`);
      } else {
        console.error('❌ Merit distribution failed:', result.errors);
      }
    } catch (error) {
      console.error('💥 Error during daily merit distribution:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Manually trigger merit distribution for a specific date
   */
  async manualDistribution(date: Date): Promise<void> {
    console.log(`🎯 Manual merit distribution for ${date.toISOString().split('T')[0]}...`);
    
    try {
      const result = await this.meritService.distributeMeritsForDate(date);
      
      if (result.success) {
        console.log(`✅ Successfully distributed merits to ${result.distributedCount} traders`);
      } else {
        console.error('❌ Merit distribution failed:', result.errors);
      }
    } catch (error) {
      console.error('💥 Error during manual merit distribution:', error instanceof Error ? error.message : error);
      throw error;
    }
  }

  /**
   * Check system health and partner balance
   */
  async checkSystemHealth(): Promise<{
    partnerBalance: any;
    lastDistribution: Date | null;
    pendingDistributions: number;
  }> {
    try {
      // Check partner balance
      const partnerBalance = await this.meritService.checkPartnerBalance();

      // Get last successful distribution
      const lastDistribution = await this.prisma.meritDistribution.findFirst({
        where: { status: 'success' },
        orderBy: { createdAt: 'desc' },
        select: { date: true }
      });

      // Count pending distributions
      const pendingDistributions = await this.prisma.meritDistribution.count({
        where: { status: 'pending' }
      });

      return {
        partnerBalance,
        lastDistribution: lastDistribution?.date || null,
        pendingDistributions
      };
    } catch (error) {
      console.error('Error checking system health:', error);
      throw error;
    }
  }

  /**
   * Get distribution summary for the last N days
   */
  async getDistributionSummary(days: number = 7): Promise<{
    totalDays: number;
    successfulDays: number;
    totalMeritsDistributed: string;
    totalRecipients: number;
    averageDailyDistribution: string;
  }> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - days);

    const stats = await this.meritService.getTotalMeritsDistributed(startDate, endDate);

    // Count successful distribution days
    const distributionDays = await this.prisma.meritDistribution.groupBy({
      by: ['date'],
      where: {
        status: 'success',
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      _count: {
        id: true
      }
    });

    const averageDaily = parseFloat(stats.totalAmount) / Math.max(distributionDays.length, 1);

    return {
      totalDays: days,
      successfulDays: distributionDays.length,
      totalMeritsDistributed: stats.totalAmount,
      totalRecipients: stats.totalRecipients,
      averageDailyDistribution: averageDaily.toFixed(2)
    };
  }
} 