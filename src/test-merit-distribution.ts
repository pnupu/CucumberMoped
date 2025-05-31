import { PrismaClient } from '@prisma/client';
import { MeritDistributionService } from './services/meritDistributionService';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

interface TestUser {
  telegramId: number;
  username: string;
  walletAddress: string;
  usdcVolume: string;
}

// Test data: Mock users with different trading volumes
const testUsers: TestUser[] = [
  {
    telegramId: 1001,
    username: 'whale_trader',
    walletAddress: '0x1111111111111111111111111111111111111111',
    usdcVolume: '10000.50', // High volume trader
  },
  {
    telegramId: 1002,
    username: 'medium_trader',
    walletAddress: '0x2222222222222222222222222222222222222222',
    usdcVolume: '500.25', // Medium volume trader
  },
  {
    telegramId: 1003,
    username: 'small_trader',
    walletAddress: '0x3333333333333333333333333333333333333333',
    usdcVolume: '50.10', // Small volume trader
  },
  {
    telegramId: 1004,
    username: 'micro_trader',
    walletAddress: '0x4444444444444444444444444444444444444444',
    usdcVolume: '0.05', // Very small volume trader
  },
  {
    telegramId: 1005,
    username: 'tiny_trader',
    walletAddress: '0x5555555555555555555555555555555555555555',
    usdcVolume: '0.005', // Below minimum threshold
  },
];

async function setupTestData() {
  console.log('🔧 Setting up test data...');
  
  // Create test users in database
  for (const user of testUsers) {
    await prisma.user.upsert({
      where: { telegramId: user.telegramId },
      update: {
        username: user.username,
        walletAddress: user.walletAddress,
      },
      create: {
        telegramId: user.telegramId,
        username: user.username,
        walletAddress: user.walletAddress,
        encryptedPrivateKey: 'test_encrypted_key', // Mock encrypted key
      },
    });
  }
  
  console.log(`✅ Created ${testUsers.length} test users`);
}

async function testRecordTradingVolumes() {
  console.log('\n📊 Testing trading volume recording...');
  
  const meritService = new MeritDistributionService(prisma);
  const testDate = new Date('2024-01-01'); // Use a fixed date for testing
  
  // Record trading volumes for all test users
  for (const user of testUsers) {
    await meritService.recordTradingVolume(
      user.telegramId,
      user.walletAddress,
      user.usdcVolume,
      testDate
    );
    console.log(`📈 Recorded volume ${user.usdcVolume} USDC for ${user.username}`);
  }
  
  // Test updating existing volume (should add to existing)
  console.log('\n🔄 Testing volume accumulation...');
  await meritService.recordTradingVolume(
    testUsers[0].telegramId,
    testUsers[0].walletAddress,
    '100.00',
    testDate
  );
  console.log(`📈 Added additional 100.00 USDC to ${testUsers[0].username}`);
}

async function testGetTopTraders() {
  console.log('\n🏆 Testing top traders retrieval...');
  
  const meritService = new MeritDistributionService(prisma);
  const testDate = new Date('2024-01-01');
  
  const topTraders = await meritService.getTopTraders(testDate, 10);
  
  console.log(`📋 Found ${topTraders.length} eligible traders (minimum 0.01 USDC):`);
  topTraders.forEach((trader, index) => {
    console.log(`  ${index + 1}. ${trader.walletAddress}: ${trader.usdcVolume} USDC`);
  });
  
  return topTraders;
}

async function testCheckPartnerBalance() {
  console.log('\n💰 Testing partner balance check...');
  
  try {
    const meritService = new MeritDistributionService(prisma);
    const balance = await meritService.checkPartnerBalance();
    
    console.log('✅ Partner balance information:');
    console.log(`  Name: ${balance.name}`);
    console.log(`  Balance: ${balance.balance} merits`);
    console.log(`  Total Distributed: ${balance.total_distributed} merits`);
    console.log(`  Rate: ${balance.rate}`);
    console.log(`  Valid Until: ${balance.valid_until}`);
    
    return balance;
  } catch (error) {
    console.error('❌ Error checking partner balance:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function testMeritDistribution() {
  console.log('\n🎁 Testing merit distribution...');
  
  const meritService = new MeritDistributionService(prisma);
  const testDate = new Date('2024-01-01');
  
  try {
    const result = await meritService.distributeMeritsForDate(testDate);
    
    console.log('✅ Merit distribution completed:');
    console.log(`  Success: ${result.success}`);
    console.log(`  Distributed to: ${result.distributedCount} traders`);
    
    if (result.errors.length > 0) {
      console.log('  Errors:');
      result.errors.forEach(error => console.log(`    - ${error}`));
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error during merit distribution:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function testGetUserMeritHistory() {
  console.log('\n📜 Testing user merit history...');
  
  const meritService = new MeritDistributionService(prisma);
  
  // Get merit history for the first test user
  const userId = testUsers[0].telegramId;
  const history = await meritService.getUserMeritHistory(userId);
  
  console.log(`📊 Merit history for user ${userId}:`);
  if (history.length === 0) {
    console.log('  No merit distributions found');
  } else {
    history.forEach((record, index) => {
      console.log(`  ${index + 1}. Date: ${record.date.toISOString().split('T')[0]}`);
      console.log(`     Amount: ${record.amount} merits`);
      console.log(`     Volume: ${record.usdcVolume} USDC`);
      console.log(`     Status: ${record.status}`);
    });
  }
}

async function testGetTotalMeritsDistributed() {
  console.log('\n📈 Testing total merits distributed stats...');
  
  const meritService = new MeritDistributionService(prisma);
  const startDate = new Date('2024-01-01');
  const endDate = new Date('2024-01-31');
  
  const stats = await meritService.getTotalMeritsDistributed(startDate, endDate);
  
  console.log('📊 Distribution statistics:');
  console.log(`  Total Amount: ${stats.totalAmount} merits`);
  console.log(`  Total Recipients: ${stats.totalRecipients} users`);
  console.log(`  Successful Distributions: ${stats.successfulDistributions}`);
  console.log(`  Failed Distributions: ${stats.failedDistributions}`);
}

async function simulateDailyMeritDistribution() {
  console.log('\n🌅 Simulating daily merit distribution process...');
  
  const meritService = new MeritDistributionService(prisma);
  const today = new Date();
  
  // First, simulate some trading activity for today
  console.log('1. Recording today\'s trading volumes...');
  for (const user of testUsers.slice(0, 3)) { // Only first 3 users trade today
    const randomVolume = (Math.random() * 1000 + 10).toFixed(2);
    await meritService.recordTradingVolume(
      user.telegramId,
      user.walletAddress,
      randomVolume,
      today
    );
    console.log(`   ${user.username}: ${randomVolume} USDC`);
  }
  
  // Then distribute merits based on today's volume
  console.log('\n2. Distributing merits for today...');
  const result = await meritService.distributeMeritsForDate(today);
  
  if (result) {
    console.log(`✅ Distributed merits to ${result.distributedCount} traders`);
  }
}

async function cleanupTestData() {
  console.log('\n🧹 Cleaning up test data...');
  
  // Delete test merit distributions
  await prisma.meritDistribution.deleteMany({
    where: {
      userId: { in: testUsers.map(u => u.telegramId) }
    }
  });
  
  // Delete test trading volumes
  await prisma.tradingVolume.deleteMany({
    where: {
      userId: { in: testUsers.map(u => u.telegramId) }
    }
  });
  
  // Delete test users
  await prisma.user.deleteMany({
    where: {
      telegramId: { in: testUsers.map(u => u.telegramId) }
    }
  });
  
  console.log('✅ Test data cleaned up');
}

async function runTests() {
  console.log('🚀 Starting Merit Distribution System Tests\n');
  
  try {
    // Check environment setup
    if (!process.env.BLOCKSCOUT_API_KEY) {
      console.log('⚠️  BLOCKSCOUT_API_KEY not found. Some tests will be skipped.');
      console.log('   Please set BLOCKSCOUT_API_KEY in your .env file to test API integration.\n');
    }
    
    // Setup test data
    await setupTestData();
    
    // Test trading volume recording
    await testRecordTradingVolumes();
    
    // Test getting top traders
    const topTraders = await testGetTopTraders();
    
    // Test partner balance check (if API key is available)
    if (process.env.BLOCKSCOUT_API_KEY) {
      await testCheckPartnerBalance();
    } else {
      console.log('\n💰 Skipping partner balance check (no API key)');
    }
    
    // Test merit distribution (if API key is available)
    if (process.env.BLOCKSCOUT_API_KEY && topTraders.length > 0) {
      console.log('\n⚠️  WARNING: The next test will attempt to distribute REAL merits via Blockscout API!');
      console.log('   Comment out this test if you don\'t want to use your merit balance.\n');
      
      // Uncomment the line below to test actual merit distribution
      // await testMeritDistribution();
      console.log('🔒 Merit distribution test skipped (commented out for safety)');
    } else {
      console.log('\n🎁 Skipping merit distribution test (no API key or no eligible traders)');
    }
    
    // Test user merit history
    await testGetUserMeritHistory();
    
    // Test distribution statistics
    await testGetTotalMeritsDistributed();
    
    // Simulate daily process
    await simulateDailyMeritDistribution();
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error instanceof Error ? error.message : error);
    throw error;
  } finally {
    // Cleanup
    await cleanupTestData();
    await prisma.$disconnect();
  }
}

// Additional utility functions for manual testing
export async function manualMeritDistribution(date?: Date) {
  const meritService = new MeritDistributionService(prisma);
  const targetDate = date || new Date();
  
  console.log(`🎯 Manual merit distribution for ${targetDate.toISOString().split('T')[0]}`);
  
  const result = await meritService.distributeMeritsForDate(targetDate);
  console.log('Result:', result);
  
  await prisma.$disconnect();
  return result;
}

export async function recordUserVolume(userId: number, walletAddress: string, volume: string, date?: Date) {
  const meritService = new MeritDistributionService(prisma);
  const targetDate = date || new Date();
  
  await meritService.recordTradingVolume(userId, walletAddress, volume, targetDate);
  console.log(`📊 Recorded ${volume} USDC for user ${userId} on ${targetDate.toISOString().split('T')[0]}`);
  
  await prisma.$disconnect();
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests()
    .then(() => {
      console.log('\n🎉 Merit distribution system is ready to use!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Tests failed:', error);
      process.exit(1);
    });
} 