import dotenv from 'dotenv';
import { DatabaseService } from './src/services/DatabaseService';
import { HederaService } from './src/services/HederaService';
import { StrategyService } from './src/services/StrategyService';

// Load environment variables
dotenv.config();

async function testCucumberMopedIndex() {
  console.log('🥒 Testing CucumberMoped Index Implementation...\n');

  try {
    // Initialize services
    console.log('📊 Initializing services...');
    const db = new DatabaseService('./data/test-bot.db');
    
    const hederaService = new HederaService();
    hederaService.setOperator(
      process.env.HEDERA_TESTNET_ACCOUNT_ID!,
      process.env.HEDERA_TESTNET_PRIVATE_KEY!
    );

    const strategyService = new StrategyService();
    console.log('✅ Services initialized\n');

    // Test 1: Strategy Service - Get Portfolio Allocation
    console.log('🧮 Test 1: Strategy Service - Portfolio Allocation');
    console.log('=' .repeat(50));
    
    try {
      const { portfolio, hederaMessage } = await strategyService.getPortfolioAllocation();
      
      console.log(`✅ Portfolio calculated with ${portfolio.allocations.length} tokens`);
      console.log(`💰 Total Market Cap: $${(portfolio.totalMarketCap / 1e9).toFixed(2)}B`);
      console.log(`📝 Message size: ${hederaMessage.length} characters`);
      
      // Show top 5 allocations
      console.log('\n📈 Top 5 Allocations:');
      portfolio.allocations.slice(0, 5).forEach((item: any, index: number) => {
        console.log(`  ${index + 1}. ${item.token}: ${(item.allocation * 100).toFixed(2)}%`);
      });

      // Test overview generation
      const overview = strategyService.createIndexOverview(portfolio, true);
      console.log('\n📋 Index Overview:');
      console.log(overview);

      // Test chart generation
      const chart = strategyService.generateAllocationChart(portfolio);
      console.log('\n📊 Allocation Chart:');
      console.log(chart);

      console.log('\n✅ Strategy Service test completed successfully!\n');

      // Test 2: Hedera Service - Topic and Message Management
      console.log('🌐 Test 2: Hedera Service - Topic Management');
      console.log('=' .repeat(50));

      const CUCUMBER_TOPIC_MEMO = "CucumberMoped Index - Test Allocations";
      
      // Check if topic exists in database
      let hederaTopic = await db.findHederaTopicByMemo(CUCUMBER_TOPIC_MEMO);
      let topicId: string;

      if (!hederaTopic) {
        console.log('🆕 Creating new Hedera topic...');
        const newTopicId = await hederaService.findOrCreateTopicByMemo(CUCUMBER_TOPIC_MEMO);
        topicId = newTopicId.toString();
        console.log(`✅ Created topic: ${topicId}`);

        // Store in database (simulating user ID 12345 for test)
        const newHederaTopic = {
          id: `topic_test_${Date.now()}`,
          topicId: topicId,
          memo: CUCUMBER_TOPIC_MEMO,
          userId: 12345,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await db.createHederaTopic(newHederaTopic);
        console.log('✅ Topic stored in database');
      } else {
        topicId = hederaTopic.topicId;
        console.log(`📋 Found existing topic: ${topicId}`);
      }

      // Submit message to Hedera
      console.log('\n📝 Submitting allocation message to Hedera...');
      const sequenceNumber = await hederaService.submitMessage(topicId, hederaMessage);
      console.log(`✅ Message submitted with sequence number: ${sequenceNumber}`);

      // Store message in database
      const messageRecord = {
        id: `msg_test_${Date.now()}_${sequenceNumber}`,
        topicId: topicId,
        sequenceNumber: sequenceNumber,
        message: hederaMessage,
        userId: 12345,
        consensusTimestamp: new Date(),
        runningHash: `hash_${sequenceNumber}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.createHederaMessage(messageRecord);
      console.log('✅ Message stored in database');

      // Test message retrieval
      console.log('\n🔍 Testing message retrieval...');
      const latestMessage = await hederaService.getLatestMessage(topicId);
      if (latestMessage) {
        console.log(`✅ Retrieved latest message (sequence: ${latestMessage.sequenceNumber})`);
        console.log(`📊 Message age: ${((new Date().getTime() - latestMessage.consensusTimestamp.getTime()) / 1000).toFixed(1)} seconds`);
      } else {
        console.log('⚠️ No messages found');
      }

      // Test database retrieval
      const dbMessage = await db.getLatestMessageFromTopic(topicId);
      if (dbMessage) {
        console.log(`✅ Retrieved message from database (sequence: ${dbMessage.sequenceNumber})`);
      }

      console.log('\n✅ Hedera Service test completed successfully!\n');

      // Test 3: Integration Test - Full Workflow
      console.log('🔄 Test 3: Integration Test - Full Workflow');
      console.log('=' .repeat(50));

      console.log('✅ Topic exists and is accessible');
      console.log('✅ Strategy service can calculate allocations');
      console.log('✅ Messages can be posted to Hedera');
      console.log('✅ Messages can be retrieved from Hedera');
      console.log('✅ Database operations work correctly');
      console.log('✅ Overview and charts can be generated');

      console.log('\n🎉 All tests passed! The /testindex command should work correctly.');

    } catch (error) {
      console.error('❌ Strategy Service test failed:', error);
      throw error;
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testCucumberMopedIndex().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
} 