import { HederaService } from './services/HederaService';
import { DatabaseService } from './services/DatabaseService';
import { HederaTopic, HederaMessage } from './types';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Simple UUID generator
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Test script for the real Hedera service using testnet
 * 
 * Before running this test, make sure to set these environment variables:
 * - HEDERA_ACCOUNT_ID: Your testnet account ID (e.g., "0.0.123456")
 * - HEDERA_PRIVATE_KEY: Your testnet private key
 */

async function testHederaRealService() {
  console.log('🌐 Testing Real Hedera Service with Testnet');
  console.log('='.repeat(50));

  // Check environment variables
  const accountId = process.env.HEDERA_TESTNET_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_TESTNET_PRIVATE_KEY;

  if (!accountId || !privateKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set');
    console.error('   These should be your Hedera testnet credentials');
    return;
  }

  // Initialize services
  const hederaService = new HederaService();
  const dbService = new DatabaseService('./data/test-hedera.db');

  try {
    // Set operator account
    console.log('\n1️⃣ Setting operator account...');
    hederaService.setOperator(accountId, privateKey);

    // Test connectivity
    console.log('\n2️⃣ Testing connectivity...');
    const isConnected = await hederaService.testConnectivity();
    if (!isConnected) {
      throw new Error('Failed to connect to Hedera testnet');
    }

    // Create a new topic
    console.log('\n3️⃣ Creating a new topic...');
    const topicMemo = `Test Topic - ${new Date().toISOString()}`;
    const topicId = await hederaService.createTopic(topicMemo);
    console.log(`✅ Topic created: ${topicId.toString()}`);

    // Store topic in database
    const hederaTopic: HederaTopic = {
      id: generateId(),
      topicId: topicId.toString(),
      memo: topicMemo,
      userId: 12345, // Example user ID
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await dbService.createHederaTopic(hederaTopic);
    console.log(`✅ Topic stored in database`);

    // Submit multiple messages
    console.log('\n4️⃣ Submitting messages...');
    const messages = [
      'Hello, Hedera Consensus Service!',
      'This is message number 2',
      'Final test message from real service'
    ];

    const submittedMessages: HederaMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      console.log(`   Submitting: "${message}"`);
      
      const sequenceNumber = await hederaService.submitMessage(topicId, message);
      console.log(`   ✅ Message submitted with sequence number: ${sequenceNumber}`);

      // Store message in database
      const hederaMessage: HederaMessage = {
        id: generateId(),
        topicId: topicId.toString(),
        sequenceNumber,
        message,
        userId: 12345, // Example user ID
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await dbService.createHederaMessage(hederaMessage);
      submittedMessages.push(hederaMessage);
      console.log(`   ✅ Message stored in database`);

      // Wait a bit between messages
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Wait for messages to be processed by the network
    console.log('\n⏳ Waiting for messages to be processed by Hedera network...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Query messages from Mirror Node
    console.log('\n5️⃣ Querying messages from Mirror Node...');
    const retrievedMessages = await hederaService.queryTopicMessages(topicId);
    console.log(`✅ Retrieved ${retrievedMessages.length} messages from Mirror Node:`);
    
    retrievedMessages.forEach((msg, index) => {
      console.log(`   ${index + 1}. Seq: ${msg.sequenceNumber}, Content: "${msg.contents}"`);
      console.log(`      Timestamp: ${msg.consensusTimestamp.toISOString()}`);
    });

    // Test advanced querying
    console.log('\n6️⃣ Testing advanced message querying...');
    if (retrievedMessages.length >= 2) {
      // Query messages with sequence number >= 2
      const filteredMessages = await hederaService.queryTopicMessagesAdvanced(topicId, {
        sequenceNumberGte: 2,
        limit: 10
      });
      console.log(`✅ Messages with sequence >= 2: ${filteredMessages.length}`);
      
      // Get specific message by sequence number
      const specificMessage = await hederaService.getMessageBySequence(topicId, 1);
      if (specificMessage) {
        console.log(`✅ First message: "${specificMessage.contents}"`);
      }
    }

    // Test database queries
    console.log('\n7️⃣ Testing database queries...');
    const storedTopic = await dbService.getHederaTopic(topicId.toString());
    console.log(`✅ Retrieved topic from DB: ${storedTopic?.memo}`);

    const storedMessages = await dbService.getTopicMessages(topicId.toString());
    console.log(`✅ Retrieved ${storedMessages.length} messages from DB`);

    const userTopics = await dbService.getUserHederaTopics(12345);
    console.log(`✅ User has ${userTopics.length} topics`);

    const userMessages = await dbService.getUserHederaMessages(12345);
    console.log(`✅ User has ${userMessages.length} messages`);

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   • Topic created: ${topicId.toString()}`);
    console.log(`   • Messages submitted: ${messages.length}`);
    console.log(`   • Messages retrieved: ${retrievedMessages.length}`);
    console.log(`   • Database operations: ✅`);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    // Cleanup
    hederaService.close();
    dbService.close();
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testHederaRealService()
    .then(() => {
      console.log('\n✅ Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}

export { testHederaRealService }; 