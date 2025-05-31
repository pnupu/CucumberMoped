import { PrismaClient } from '@prisma/client';
import { MeritDistributionService } from './meritDistributionService';

interface EligibilityResult {
  isEligible: boolean;
  userVolume: string;
  userRank: number | null;
  totalEligibleTraders: number;
  minimumVolumeForTop1000: string;
  nextDistributionDate: Date;
  lastDistributionDate: Date | null;
  eligibilityMessage: string;
}

export class MeritEligibilityService {
  private prisma: PrismaClient;
  private meritService: MeritDistributionService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.meritService = new MeritDistributionService(prisma);
  }

  /**
   * Check if a user is eligible for merits based on their trading volume
   */
  async checkUserEligibility(userId: number): Promise<EligibilityResult> {
    // Get yesterday's date for checking eligibility (since merits are distributed for previous day)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayNormalized = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

    // Get today's date for current volume check
    const today = new Date();
    const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Get user's volume for yesterday (what would be eligible for merits)
    const userVolumeYesterday = await this.getUserVolumeForDate(userId, yesterdayNormalized);
    
    // Get user's volume for today (building up for next distribution)
    const userVolumeToday = await this.getUserVolumeForDate(userId, todayNormalized);

    // Get all traders for yesterday to determine rankings
    const allTradersYesterday = await this.meritService.getTopTraders(yesterdayNormalized, 10000); // Get more than top 1000 to see full ranking
    
    // Get all traders for today
    const allTradersToday = await this.meritService.getTopTraders(todayNormalized, 10000);

    // Find user's rank for yesterday
    const userRankYesterday = this.findUserRank(userId, allTradersYesterday);
    
    // Find user's rank for today
    const userRankToday = this.findUserRank(userId, allTradersToday);

    // Determine eligibility (top 1000 and >= 0.01 USDC)
    const isEligibleYesterday = userRankYesterday !== null && userRankYesterday <= 1000 && parseFloat(userVolumeYesterday) >= 0.01;
    const isEligibleToday = userRankToday !== null && userRankToday <= 1000 && parseFloat(userVolumeToday) >= 0.01;

    // Get minimum volume for top 1000 for yesterday
    const minimumVolumeForTop1000Yesterday = this.getMinimumVolumeForTop1000(allTradersYesterday);
    
    // Get minimum volume for top 1000 for today
    const minimumVolumeForTop1000Today = this.getMinimumVolumeForTop1000(allTradersToday);

    // Count total eligible traders
    const totalEligibleTradersYesterday = allTradersYesterday.filter(trader => parseFloat(trader.usdcVolume) >= 0.01).length;
    const totalEligibleTradersToday = allTradersToday.filter(trader => parseFloat(trader.usdcVolume) >= 0.01).length;

    // Calculate next distribution date (tomorrow at 00:00 local time)
    const nextDistributionDate = new Date();
    nextDistributionDate.setDate(nextDistributionDate.getDate() + 1);
    nextDistributionDate.setHours(0, 0, 0, 0);

    // Get last distribution date
    const lastDistribution = await this.getLastDistributionDate();

    // Create eligibility message
    const eligibilityMessage = this.createEligibilityMessage({
      userVolumeYesterday,
      userVolumeToday,
      userRankYesterday,
      userRankToday,
      isEligibleYesterday,
      isEligibleToday,
      totalEligibleTradersYesterday,
      totalEligibleTradersToday,
      minimumVolumeForTop1000Yesterday,
      minimumVolumeForTop1000Today,
      nextDistributionDate,
      lastDistribution
    });

    return {
      isEligible: isEligibleToday, // Focus on today's eligibility for next distribution
      userVolume: userVolumeToday,
      userRank: userRankToday,
      totalEligibleTraders: Math.min(totalEligibleTradersToday, 1000),
      minimumVolumeForTop1000: minimumVolumeForTop1000Today,
      nextDistributionDate,
      lastDistributionDate: lastDistribution,
      eligibilityMessage
    };
  }

  /**
   * Get user's trading volume for a specific date
   */
  private async getUserVolumeForDate(userId: number, date: Date): Promise<string> {
    const volume = await this.prisma.tradingVolume.findUnique({
      where: {
        userId_date: {
          userId,
          date
        }
      },
      select: { usdcVolume: true }
    });

    return volume?.usdcVolume || '0';
  }

  /**
   * Find user's rank in the traders list
   */
  private findUserRank(userId: number, traders: Array<{ userId: number; walletAddress: string; usdcVolume: string }>): number | null {
    const userIndex = traders.findIndex(trader => trader.userId === userId);
    return userIndex === -1 ? null : userIndex + 1;
  }

  /**
   * Get minimum volume required to be in top 1000
   */
  private getMinimumVolumeForTop1000(traders: Array<{ userId: number; walletAddress: string; usdcVolume: string }>): string {
    if (traders.length < 1000) {
      return '0.01'; // If less than 1000 traders, minimum is just the threshold
    }
    return traders[999].usdcVolume; // 1000th trader (0-indexed)
  }

  /**
   * Get the last merit distribution date
   */
  private async getLastDistributionDate(): Promise<Date | null> {
    const lastDistribution = await this.prisma.meritDistribution.findFirst({
      where: { status: 'success' },
      orderBy: { date: 'desc' },
      select: { date: true }
    });

    return lastDistribution?.date || null;
  }

  /**
   * Create a comprehensive eligibility message
   */
  private createEligibilityMessage(data: {
    userVolumeYesterday: string;
    userVolumeToday: string;
    userRankYesterday: number | null;
    userRankToday: number | null;
    isEligibleYesterday: boolean;
    isEligibleToday: boolean;
    totalEligibleTradersYesterday: number;
    totalEligibleTradersToday: number;
    minimumVolumeForTop1000Yesterday: string;
    minimumVolumeForTop1000Today: string;
    nextDistributionDate: Date;
    lastDistribution: Date | null;
  }): string {
    const { 
      userVolumeYesterday, 
      userVolumeToday, 
      userRankYesterday, 
      userRankToday,
      isEligibleYesterday,
      isEligibleToday,
      totalEligibleTradersYesterday,
      totalEligibleTradersToday,
      minimumVolumeForTop1000Yesterday,
      minimumVolumeForTop1000Today,
      nextDistributionDate,
      lastDistribution 
    } = data;

    let message = '🏆 **Blockscout Merit Eligibility Status**\n\n';

    // Yesterday's eligibility (what merits were distributed for)
    if (parseFloat(userVolumeYesterday) > 0) {
      message += `📅 **Yesterday's Performance:**\n`;
      message += `• Your volume: **${parseFloat(userVolumeYesterday).toFixed(2)} USDC**\n`;
      if (userRankYesterday) {
        message += `• Your rank: **#${userRankYesterday}** out of ${totalEligibleTradersYesterday} traders\n`;
      } else {
        message += `• Rank: Not in top rankings\n`;
      }
      message += `• Eligible for merits: ${isEligibleYesterday ? '✅ Yes' : '❌ No'}\n`;
      if (!isEligibleYesterday && userRankYesterday && userRankYesterday > 1000) {
        message += `• Minimum volume needed: **${parseFloat(minimumVolumeForTop1000Yesterday).toFixed(2)} USDC** (top 1000)\n`;
      }
      message += '\n';
    } else {
      message += `📅 **Yesterday:** No trading volume recorded\n\n`;
    }

    // Today's status (building for next distribution)
    message += `🔥 **Today's Status:**\n`;
    if (parseFloat(userVolumeToday) > 0) {
      message += `• Current volume: **${parseFloat(userVolumeToday).toFixed(2)} USDC**\n`;
      if (userRankToday) {
        message += `• Current rank: **#${userRankToday}** out of ${totalEligibleTradersToday} traders\n`;
      } else {
        message += `• Rank: Not yet in rankings\n`;
      }
      
      if (isEligibleToday) {
        message += `• Status: **🎯 Eligible for next merit drop!**\n`;
      } else {
        message += `• Status: **📈 Keep trading to qualify**\n`;
        if (parseFloat(userVolumeToday) < 0.01) {
          message += `• Need at least: **0.01 USDC** volume\n`;
        } else if (userRankToday && userRankToday > 1000) {
          message += `• Minimum volume for top 1000: **${parseFloat(minimumVolumeForTop1000Today).toFixed(2)} USDC**\n`;
        }
      }
    } else {
      message += `• No trading volume today\n`;
      message += `• Status: **🚫 Not eligible** (need minimum 0.01 USDC volume)\n`;
    }

    message += '\n';

    // Merit distribution info
    message += `⏰ **Merit Distribution Schedule:**\n`;
    message += `• Next drop: **${this.formatNextDistributionTime(nextDistributionDate)}**\n`;
    if (lastDistribution) {
      message += `• Last drop: ${lastDistribution.toISOString().split('T')[0]}\n`;
    }
    message += `• Frequency: Daily at 00:00 UTC\n`;
    message += `• Recipients: Top 1000 traders (minimum 0.01 USDC)\n\n`;

    // Merit ratio info
    message += `💰 **Merit Rewards:**\n`;
    message += `• Ratio: **1:1** (1 USDC volume = 1 merit)\n`;
    message += `• Precision: Up to 2 decimal places\n`;
    message += `• Distribution: Based on previous day's volume\n\n`;

    // Call to action
    if (!isEligibleToday) {
      message += `🎯 **How to qualify:**\n`;
      message += `• Trade at least **0.01 USDC** worth of tokens\n`;
      message += `• Aim for the top 1000 by volume\n`;
      message += `• Volume accumulates throughout the day\n`;
      message += `• Use commands like \`/buy\`, \`/sell\`, or \`/quote\` to trade\n\n`;
    }

    message += `💡 *Merit eligibility is based on USDC trading volume only*`;

    return message;
  }

  /**
   * Format the next distribution time in a user-friendly way
   */
  private formatNextDistributionTime(nextDate: Date): string {
    const now = new Date();
    const diffMs = nextDate.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffMs <= 0) {
      return 'Processing now...';
    }

    if (diffHours < 24) {
      return `in ${diffHours}h ${diffMinutes}m`;
    } else {
      return nextDate.toISOString().split('T')[0] + ' at 00:00 UTC';
    }
  }

  /**
   * Add test volume for a specific user (for testing purposes)
   */
  async addTestVolume(userId: number, walletAddress: string, volume: string, date: Date = new Date()): Promise<void> {
    // Normalize the date to match the database storage format
    const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    await this.meritService.recordTradingVolume(userId, walletAddress, volume, normalizedDate);
  }

  /**
   * Get user's merit distribution history
   */
  async getUserMeritHistory(userId: number): Promise<Array<{
    date: Date;
    amount: string;
    usdcVolume: string;
    status: string;
  }>> {
    return await this.meritService.getUserMeritHistory(userId);
  }
} 