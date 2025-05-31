import { PrismaClient } from '@prisma/client';
import { MeritEligibilityService } from './services/meritEligibilityService';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function testMeritEligibility() {
  console.log('🧪 Testing Merit Eligibility Service...');
  
  try {
    const meritEligibilityService = new MeritEligibilityService(prisma);
    
    // Find user with username "tykotamminen"
    const user = await prisma.user.findFirst({
      where: {
        username: 'tykotamminen'
      }
    });
    
    if (!user) {
      console.log('❌ User "tykotamminen" not found. Please run setup:merit-test first.');
      return;
    }
    
    console.log(`✅ Testing eligibility for user: ${user.username} (ID: ${user.telegramId})`);
    
    // Check eligibility
    const eligibility = await meritEligibilityService.checkUserEligibility(user.telegramId);
    
    console.log('\n📊 Eligibility Results:');
    console.log(`• Eligible: ${eligibility.isEligible ? '✅ Yes' : '❌ No'}`);
    console.log(`• Current volume: ${eligibility.userVolume} USDC`);
    console.log(`• Current rank: ${eligibility.userRank ? `#${eligibility.userRank}` : 'Not ranked'}`);
    console.log(`• Total eligible traders: ${eligibility.totalEligibleTraders}`);
    console.log(`• Minimum volume for top 1000: ${eligibility.minimumVolumeForTop1000} USDC`);
    console.log(`• Next distribution: ${eligibility.nextDistributionDate.toISOString()}`);
    console.log(`• Last distribution: ${eligibility.lastDistributionDate?.toISOString() || 'None'}`);
    
    console.log('\n📝 Generated Message:');
    console.log('---');
    console.log(eligibility.eligibilityMessage);
    console.log('---');
    
    console.log('\n✅ Merit eligibility test completed successfully!');
    console.log('💡 The /meriteligibility command is ready to use in the Telegram bot');
    
  } catch (error) {
    console.error('❌ Error testing merit eligibility:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if this file is executed directly
if (require.main === module) {
  testMeritEligibility()
    .then(() => {
      console.log('\n🎉 Merit eligibility test completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}

export { testMeritEligibility }; 