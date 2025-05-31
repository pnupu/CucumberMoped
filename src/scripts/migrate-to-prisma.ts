import { DatabaseService } from '../services/DatabaseService';
import { PrismaDatabaseService } from '../services/PrismaDatabaseService';
import sqlite3 from 'sqlite3';

async function migrateData() {
  console.log('Starting migration from SQLite to Prisma...');

  // Initialize services
  const oldDb = new DatabaseService('./data/bot.db');
  const newDb = new PrismaDatabaseService('file:./data/prisma-bot.db');

  try {
    // Get all data from old database
    console.log('Fetching users...');
    const users = await getAllUsers(oldDb);
    console.log(`Found ${users.length} users`);

    // Migrate users
    for (const user of users) {
      try {
        await newDb.createUser(
          user.telegramId,
          user.username,
          user.walletAddress,
          user.encryptedPrivateKey
        );

        // Update World ID verification if exists
        if (user.worldIdVerified) {
          await newDb.updateUserWorldIdVerification(
            user.telegramId,
            user.worldIdVerified,
            user.worldIdNullifierHash,
            user.worldIdProof
          );
        }

        console.log(`Migrated user ${user.telegramId}`);
      } catch (error: any) {
        if (error.code === 'P2002') {
          console.log(`User ${user.telegramId} already exists, skipping...`);
        } else {
          console.error(`Error migrating user ${user.telegramId}:`, error);
        }
      }
    }

    // Migrate token balances
    console.log('\nFetching token balances...');
    for (const user of users) {
      const balances = await oldDb.getTokenBalances(user.telegramId);
      for (const balance of balances) {
        try {
          await newDb.updateTokenBalance(
            balance.userId,
            balance.tokenAddress,
            balance.tokenSymbol,
            balance.balance,
            balance.chainId
          );
          console.log(`Migrated balance for user ${balance.userId}, token ${balance.tokenSymbol}`);
        } catch (error) {
          console.error(`Error migrating balance for user ${balance.userId}:`, error);
        }
      }
    }

    // Migrate transactions
    console.log('\nFetching transactions...');
    for (const user of users) {
      const transactions = await oldDb.getUserTransactions(user.telegramId, 1000); // Get all transactions
      for (const transaction of transactions) {
        try {
          await newDb.createTransaction(transaction);
          console.log(`Migrated transaction ${transaction.id}`);
        } catch (error: any) {
          if (error.code === 'P2002') {
            console.log(`Transaction ${transaction.id} already exists, skipping...`);
          } else {
            console.error(`Error migrating transaction ${transaction.id}:`, error);
          }
        }
      }
    }

    // Migrate Hedera topics
    console.log('\nFetching Hedera topics...');
    for (const user of users) {
      const topics = await oldDb.getUserHederaTopics(user.telegramId);
      for (const topic of topics) {
        try {
          await newDb.createHederaTopic(topic);
          console.log(`Migrated Hedera topic ${topic.topicId}`);
        } catch (error: any) {
          if (error.code === 'P2002') {
            console.log(`Hedera topic ${topic.topicId} already exists, skipping...`);
          } else {
            console.error(`Error migrating Hedera topic ${topic.topicId}:`, error);
          }
        }
      }
    }

    // Migrate Hedera messages
    console.log('\nFetching Hedera messages...');
    for (const user of users) {
      const messages = await oldDb.getUserHederaMessages(user.telegramId, 1000); // Get all messages
      for (const message of messages) {
        try {
          await newDb.createHederaMessage(message);
          console.log(`Migrated Hedera message ${message.id}`);
        } catch (error: any) {
          if (error.code === 'P2002') {
            console.log(`Hedera message ${message.id} already exists, skipping...`);
          } else {
            console.error(`Error migrating Hedera message ${message.id}:`, error);
          }
        }
      }
    }

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    // Close connections
    oldDb.close();
    await newDb.close();
  }
}

// Helper function to get all users from old database
function getAllUsers(db: DatabaseService): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const sqlite = (db as any).db as sqlite3.Database;
    sqlite.all('SELECT * FROM users', (err: Error | null, rows: any[]) => {
      if (err) reject(err);
      else {
        const users = rows.map(row => ({
          telegramId: row.telegram_id,
          username: row.username,
          walletAddress: row.wallet_address,
          encryptedPrivateKey: row.encrypted_private_key,
          worldIdVerified: Boolean(row.world_id_verified),
          worldIdNullifierHash: row.world_id_nullifier_hash,
          worldIdProof: row.world_id_proof,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at)
        }));
        resolve(users);
      }
    });
  });
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateData().catch(console.error);
}

export { migrateData }; 