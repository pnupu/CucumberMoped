import { PrismaDatabaseService } from '../services/PrismaDatabaseService';

async function testPrismaService() {
  console.log('Testing Prisma Database Service...\n');

  const db = new PrismaDatabaseService('file:./data/prisma-bot.db');

  try {
    // Test user operations
    console.log('1. Testing user operations...');
    
    // Try to get a user (should return null for non-existent user)
    const nonExistentUser = await db.getUser(999999);
    console.log('Non-existent user:', nonExistentUser);

    // Get actual users if any exist
    const users = await db.prisma.user.findMany({ take: 3 });
    console.log(`Found ${users.length} users in database`);

    if (users.length > 0) {
      const firstUser = users[0];
      console.log('\nFirst user:', {
        telegramId: firstUser.telegramId,
        username: firstUser.username,
        walletAddress: firstUser.walletAddress,
        worldIdVerified: firstUser.worldIdVerified
      });

      // Test getting user with relations
      console.log('\n2. Testing user with relations...');
      const userWithRelations = await db.getUserWithRelations(firstUser.telegramId);
      console.log('User with relations:', {
        telegramId: userWithRelations?.telegramId,
        tokenBalances: userWithRelations?.tokenBalances.length || 0,
        transactions: userWithRelations?.transactions.length || 0,
        hederaTopics: userWithRelations?.hederaTopics.length || 0,
        hederaMessages: userWithRelations?.hederaMessages.length || 0
      });

      // Test token balances
      console.log('\n3. Testing token balances...');
      const balances = await db.getTokenBalances(firstUser.telegramId);
      console.log(`Found ${balances.length} token balances for user ${firstUser.telegramId}`);

      // Test transactions
      console.log('\n4. Testing transactions...');
      const transactions = await db.getUserTransactions(firstUser.telegramId, 5);
      console.log(`Found ${transactions.length} transactions for user ${firstUser.telegramId}`);

      // Test Hedera topics
      console.log('\n5. Testing Hedera topics...');
      const topics = await db.getUserHederaTopics(firstUser.telegramId);
      console.log(`Found ${topics.length} Hedera topics for user ${firstUser.telegramId}`);

      if (topics.length > 0) {
        const firstTopic = topics[0];
        console.log('First topic:', {
          id: firstTopic.id,
          topicId: firstTopic.topicId,
          memo: firstTopic.memo
        });

        // Test topic with messages
        console.log('\n6. Testing topic with messages...');
        const topicWithMessages = await db.getTopicWithMessages(firstTopic.topicId);
        console.log('Topic with messages:', {
          topicId: topicWithMessages?.topicId,
          messagesCount: topicWithMessages?.messages.length || 0,
          userWallet: topicWithMessages?.user.walletAddress
        });
      }

      // Test Hedera messages
      console.log('\n7. Testing Hedera messages...');
      const messages = await db.getUserHederaMessages(firstUser.telegramId, 5);
      console.log(`Found ${messages.length} Hedera messages for user ${firstUser.telegramId}`);
    }

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await db.close();
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testPrismaService().catch(console.error);
}

export { testPrismaService }; 