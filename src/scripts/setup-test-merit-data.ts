import { PrismaClient } from '@prisma/client';
import { MeritEligibilityService } from '../services/meritEligibilityService';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function setupTestMeritData() {
  console.log('🔧 Setting up test merit data for tykotamminen...');
  
  try {
    const meritEligibilityService = new MeritEligibilityService(prisma);
    
    // Find user with username "tykotamminen"
    const user = await prisma.user.findFirst({
      where: {
        username: 'tykotamminen'
      }
    });
    
    if (!user) {
      console.log('❌ User "tykotamminen" not found. Please register first with /start command.');
      return;
    }
    
    console.log(`✅ Found user: ${user.username} (ID: ${user.telegramId})`);
    console.log(`   Wallet: ${user.walletAddress}`);
    
    // Add significant trading volume for today
    const today = new Date();
    const todayVolume = '1250.75'; // High volume to ensure top ranking
    
    await meritEligibilityService.addTestVolume(
      user.telegramId,
      user.walletAddress,
      todayVolume,
      today
    );
    
    console.log(`📊 Added ${todayVolume} USDC trading volume for today`);
    
    // Add trading volume for yesterday as well
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayVolume = '890.50';
    
    await meritEligibilityService.addTestVolume(
      user.telegramId,
      user.walletAddress,
      yesterdayVolume,
      yesterday
    );
    
    console.log(`📊 Added ${yesterdayVolume} USDC trading volume for yesterday`);
    
    // Add some additional test users to create realistic rankings
    const testUsers = [
      { username: 'whale_trader_1', volume: '2500.00' },
      { username: 'whale_trader_2', volume: '2200.00' },
      { username: 'big_trader_1', volume: '1800.00' },
      { username: 'big_trader_2', volume: '1500.00' },
      { username: 'medium_trader_1', volume: '750.00' },
      { username: 'medium_trader_2', volume: '650.00' },
      { username: 'small_trader_1', volume: '250.00' },
      { username: 'small_trader_2', volume: '150.00' },
      { username: 'tiny_trader_1', volume: '50.00' },
      { username: 'tiny_trader_2', volume: '25.00' },
    ];
    
    let createdUsers = 0;
    for (let i = 0; i < testUsers.length; i++) {
      const testUser = testUsers[i];
      const telegramId = 9000 + i; // Use high IDs to avoid conflicts
      const walletAddress = `0x${(telegramId).toString(16).padStart(40, '0')}`;
      
      // Create user if doesn't exist
      await prisma.user.upsert({
        where: { telegramId },
        update: {},
        create: {
          telegramId,
          username: testUser.username,
          walletAddress,
          encryptedPrivateKey: 'test_key_' + telegramId,
        }
      });
      
      // Add trading volume for today
      await meritEligibilityService.addTestVolume(
        telegramId,
        walletAddress,
        testUser.volume,
        today
      );
      
      // Add trading volume for yesterday (slightly different amounts)
      const yesterdayVol = (parseFloat(testUser.volume) * (0.8 + Math.random() * 0.4)).toFixed(2);
      await meritEligibilityService.addTestVolume(
        telegramId,
        walletAddress,
        yesterdayVol,
        yesterday
      );
      
      createdUsers++;
    }
    
    console.log(`📊 Created ${createdUsers} test users with trading volumes`);
    
    // Check tykotamminen's eligibility
    console.log('\n🏆 Checking tykotamminen eligibility...');
    const eligibility = await meritEligibilityService.checkUserEligibility(user.telegramId);
    
    console.log(`✅ Eligible: ${eligibility.isEligible ? 'Yes' : 'No'}`);
    console.log(`📊 Current volume: ${eligibility.userVolume} USDC`);
    console.log(`🏅 Current rank: ${eligibility.userRank ? `#${eligibility.userRank}` : 'Not ranked'}`);
    console.log(`📈 Total eligible traders: ${eligibility.totalEligibleTraders}`);
    console.log(`⏰ Next distribution: ${eligibility.nextDistributionDate.toISOString()}`);
    
    console.log('\n✅ Test data setup complete!');
    console.log('💡 Now try /meriteligibility command in the Telegram bot');
    
  } catch (error) {
    console.error('❌ Error setting up test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if this file is executed directly
if (require.main === module) {
  setupTestMeritData()
    .then(() => {
      console.log('\n🎉 Test merit data setup completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Setup failed:', error);
      process.exit(1);
    });
}

export { setupTestMeritData }; 