import dotenv from 'dotenv';
import { StrategyService } from './services/StrategyService';
import { HederaService } from './services/HederaService';
import { TopicId } from '@hashgraph/sdk';

// Load environment variables
dotenv.config();

/**
 * Test script for StrategyService integration with HederaService
 * This script:
 * 1. Fetches market cap data from CoinMarketCap Pro API
 * 2. Calculates Black-Litterman portfolio allocations
 * 3. Posts the results to Hedera testnet
 */
async function testStrategyWithHedera() {
  console.log('🚀 Starting Strategy + Hedera Integration Test');
  console.log('=' .repeat(60));

  // Initialize services
  let strategyService: StrategyService;
  let hederaService: HederaService;
  
  try {
    strategyService = new StrategyService();
    hederaService = new HederaService();
    console.log('✅ Services initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    process.exit(1);
  }

  // Check required environment variables
  const requiredEnvVars = [
    'COINMARKETCAP_PRO_KEY',
    'HEDERA_TESTNET_ACCOUNT_ID',
    'HEDERA_TESTNET_PRIVATE_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars.join(', '));
    console.log('\nPlease set the following in your .env file:');
    console.log('COINMARKETCAP_PRO_KEY=your_coinmarketcap_pro_api_key');
    console.log('HEDERA_TESTNET_ACCOUNT_ID=your_hedera_account_id');
    console.log('HEDERA_TESTNET_PRIVATE_KEY=your_hedera_private_key');
    process.exit(1);
  }

  // Set up Hedera operator
  try {
    hederaService.setOperator(
      process.env.HEDERA_TESTNET_ACCOUNT_ID!,
      process.env.HEDERA_TESTNET_PRIVATE_KEY!
    );
    console.log('✅ Hedera operator configured');
  } catch (error) {
    console.error('❌ Failed to configure Hedera operator:', error);
    process.exit(1);
  }

  // Test Hedera connectivity
  console.log('\n📡 Testing Hedera connectivity...');
  const isConnected = await hederaService.testConnectivity();
  if (!isConnected) {
    console.error('❌ Hedera connectivity test failed');
    process.exit(1);
  }

  let topicId: TopicId;

  try {
    // Step 1: Create a topic for portfolio updates
    console.log('\n📝 Creating Hedera topic for portfolio updates...');
    topicId = await hederaService.createTopic('Portfolio Allocation Updates - Black-Litterman Strategy');
    console.log(`✅ Topic created: ${topicId.toString()}`);

    // Step 2: Fetch market data and calculate portfolio
    console.log('\n📊 Fetching market data and calculating portfolio...');
    const { portfolio, hederaMessage } = await strategyService.getPortfolioAllocation();
    
    // Display portfolio summary
    console.log('\n' + '='.repeat(60));
    console.log(strategyService.getPortfolioSummary(portfolio));
    console.log('='.repeat(60));

    // Step 3: Post portfolio to Hedera
    console.log('\n📤 Posting portfolio allocation to Hedera...');
    const sequenceNumber = await hederaService.submitMessage(topicId, hederaMessage);
    console.log(`✅ Portfolio posted to Hedera with sequence number: ${sequenceNumber}`);

    // Step 4: Verify the message was posted
    console.log('\n🔍 Verifying message was posted...');
    
    // Wait a bit for the message to be processed
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      const retrievedMessage = await hederaService.getMessageBySequence(topicId, sequenceNumber);
      
      if (retrievedMessage) {
        console.log('✅ Message verification successful');
        console.log(`📄 Message content preview: ${retrievedMessage.contents.substring(0, 100)}...`);
        console.log(`⏰ Consensus timestamp: ${retrievedMessage.consensusTimestamp}`);
        console.log(`🔗 Running hash: ${retrievedMessage.runningHash.substring(0, 16)}...`);
      } else {
        console.log('⚠️ Message not yet available via mirror node (this is normal, may take a few minutes)');
      }
    } catch (error) {
      console.log('⚠️ Could not retrieve message via mirror node (this is normal for new topics)');
      console.log('   The message was successfully submitted to the network');
    }

    // Step 5: Display final results
    console.log('\n' + '🎉'.repeat(20));
    console.log('✅ TEST COMPLETED SUCCESSFULLY!');
    console.log(`📝 Topic ID: ${topicId.toString()}`);
    console.log(`📊 Portfolio contains ${portfolio.allocations.length} tokens`);
    console.log(`💰 Total market cap: $${(portfolio.totalMarketCap / 1e9).toFixed(2)}B`);
    console.log(`📤 Message sequence: ${sequenceNumber}`);
    console.log(`📏 Message size: ${hederaMessage.length} characters`);
    
    // Show top 3 allocations
    console.log('\n🏆 Top 3 Allocations:');
    portfolio.allocations.slice(0, 3).forEach((allocation, index) => {
      console.log(`  ${index + 1}. ${allocation.token}: ${(allocation.allocation * 100).toFixed(2)}%`);
    });

    // Optional: Query all messages from the topic
    console.log('\n📋 Querying all topic messages...');
    try {
      const allMessages = await hederaService.queryTopicMessages(topicId, { limit: 10 });
      console.log(`📨 Found ${allMessages.length} messages in topic`);
      
      allMessages.forEach((msg, index) => {
        const preview = msg.contents.length > 50 
          ? msg.contents.substring(0, 50) + '...' 
          : msg.contents;
        console.log(`  ${index + 1}. Seq: ${msg.sequenceNumber}, Preview: "${preview}"`);
      });
    } catch (error) {
      console.log('⚠️ Could not query topic messages yet (mirror node delay is normal)');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Stack trace:', (error as Error).stack);
    process.exit(1);
  } finally {
    // Clean up
    hederaService.close();
    console.log('\n🔒 Hedera client connection closed');
  }

  console.log('\n✨ Test completed successfully! Check the Hedera testnet for your portfolio updates.');
  console.log(`🔗 You can view the topic on Hedera Explorer: https://hashscan.io/testnet/topic/${topicId.toString()}`);
}

/**
 * Test just the CoinMarketCap API integration without Hedera
 */
async function testCoinMarketCapOnly() {
  console.log('🧪 Testing CoinMarketCap API integration only...');
  console.log('=' .repeat(50));

  try {
    const strategyService = new StrategyService();
    
    console.log('📊 Fetching market data...');
    const marketData = await strategyService.fetchMarketCapData();
    
    console.log(`✅ Successfully fetched data for ${marketData.length} tokens`);
    console.log('\n📈 Sample market data:');
    marketData.slice(0, 5).forEach(token => {
      console.log(`  ${token.symbol}: $${token.market_cap.toLocaleString()} market cap, $${token.price.toFixed(4)} price`);
    });

    console.log('\n🧮 Calculating portfolio allocations...');
    const portfolio = strategyService.calculateBlackLittermanAllocations(marketData);
    
    console.log(strategyService.getPortfolioSummary(portfolio));
    
    const message = strategyService.createHederaMessage(portfolio);
    console.log(`\n📝 Generated Hedera message (${message.length} characters):`);
    console.log(message.substring(0, 500) + (message.length > 500 ? '...' : ''));

  } catch (error) {
    console.error('❌ CoinMarketCap test failed:', error);
    process.exit(1);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--cmc-only')) {
    await testCoinMarketCapOnly();
  } else {
    await testStrategyWithHedera();
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the test
main().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
}); 