# Hedera Consensus Service Integration

This project includes a complete integration with Hedera Consensus Service (HCS) that allows you to create topics, submit messages, and query them from the Hedera testnet.

## Features

### ✅ Completed Implementation

- **Real Hedera Service** (`HederaService.ts`)
  - Create topics on Hedera testnet
  - Submit messages to topics
  - Query topic messages from Mirror Node API
  - Advanced filtering capabilities
  - Connectivity testing

- **Database Integration** (`DatabaseService.ts`)
  - Store and retrieve Hedera topics
  - Store and retrieve Hedera messages
  - User-based topic and message management
  - Sequence number tracking

- **Database Schema**
  - `hedera_topics` table for topic storage
  - `hedera_messages` table for message storage
  - Proper foreign key relationships

## Prerequisites

1. **Hedera Testnet Account**: You need a Hedera testnet account with some HBAR for fees
2. **Environment Variables**: Set up your testnet credentials

## Setup

### 1. Environment Configuration

Create a `.env` file in the project root with your Hedera testnet credentials:

```env
# Hedera Testnet Configuration
HEDERA_ACCOUNT_ID=0.0.YOUR_ACCOUNT_ID
HEDERA_PRIVATE_KEY=your_private_key_here
```

### 2. Install Dependencies

All required dependencies are already included in `package.json`:
- `@hashgraph/sdk` - Official Hedera SDK
- `axios` - For Mirror Node API calls
- `sqlite3` - Database storage

## Usage

### Basic HederaService Usage

```typescript
import { HederaService } from './services/HederaService';

// Initialize the service
const hederaService = new HederaService();

// Set operator account
hederaService.setOperator(
  process.env.HEDERA_ACCOUNT_ID!,
  process.env.HEDERA_PRIVATE_KEY!
);

// Test connectivity
const isConnected = await hederaService.testConnectivity();

// Create a topic
const topicId = await hederaService.createTopic('My Topic');
console.log(`Topic created: ${topicId.toString()}`);

// Submit a message
const sequenceNumber = await hederaService.submitMessage(
  topicId, 
  'Hello, Hedera!'
);

// Query messages
const messages = await hederaService.queryTopicMessages(topicId);
console.log(`Retrieved ${messages.length} messages`);
```

### DatabaseService Integration

```typescript
import { DatabaseService } from './services/DatabaseService';
import { HederaTopic, HederaMessage } from './types';

const dbService = new DatabaseService('./data/hedera.db');

// Store a topic
const topic: HederaTopic = {
  id: 'unique-id',
  topicId: '0.0.123456',
  memo: 'My topic',
  userId: 12345,
  createdAt: new Date(),
  updatedAt: new Date()
};
await dbService.createHederaTopic(topic);

// Store a message
const message: HederaMessage = {
  id: 'unique-message-id',
  topicId: '0.0.123456',
  sequenceNumber: 1,
  message: 'Hello, Hedera!',
  userId: 12345,
  createdAt: new Date(),
  updatedAt: new Date()
};
await dbService.createHederaMessage(message);

// Query user's topics
const userTopics = await dbService.getUserHederaTopics(12345);

// Query topic messages
const topicMessages = await dbService.getTopicMessages('0.0.123456');
```

## Testing

### Run the Real Hedera Test

```bash
npm run test:hedera-real
```

This test will:
1. Connect to Hedera testnet
2. Create a new topic
3. Submit multiple messages
4. Query messages from Mirror Node
5. Test database operations
6. Demonstrate advanced filtering

### Sample Output

```
🌐 Testing Real Hedera Service with Testnet
==================================================

1️⃣ Setting operator account...
🌐 Operator set to account 0.0.123456

2️⃣ Testing connectivity...
🌐 Testnet connectivity OK

3️⃣ Creating a new topic...
🌐 Creating topic on Hedera Testnet...
🌐 Topic creation transaction submitted to testnet
🌐 Topic created with ID: 0.0.789012
✅ Topic created: 0.0.789012
✅ Topic stored in database

4️⃣ Submitting messages...
   Submitting: "Hello, Hedera Consensus Service!"
🌐 Submitting message to topic 0.0.789012 on testnet...
🌐 Message submission transaction submitted to testnet
🌐 Message submitted with sequence number: 1
   ✅ Message submitted with sequence number: 1
   ✅ Message stored in database

5️⃣ Querying messages from Mirror Node...
🌐 Querying topic messages from: https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.789012/messages
✅ Retrieved 3 messages from Mirror Node:
   1. Seq: 1, Content: "Hello, Hedera Consensus Service!"
      Timestamp: 2024-01-15T10:30:45.123Z
```

## API Reference

### HederaService Methods

#### `setOperator(accountId, privateKey)`
Sets the operator account for transactions.

#### `createTopic(memo?): Promise<TopicId>`
Creates a new topic on Hedera testnet.

#### `submitMessage(topicId, message): Promise<number>`
Submits a message to a topic and returns the sequence number.

#### `queryTopicMessages(topicId, options?): Promise<TopicMessage[]>`
Queries messages from Mirror Node API with optional filtering.

#### `queryTopicMessagesAdvanced(topicId, options?): Promise<TopicMessage[]>`
Advanced querying with greater than/less than filters.

#### `getMessageBySequence(topicId, sequenceNumber): Promise<TopicMessage | null>`
Gets a specific message by sequence number.

#### `testConnectivity(): Promise<boolean>`
Tests connectivity to Hedera testnet.

### DatabaseService Methods

#### Hedera Topic Operations
- `createHederaTopic(topic): Promise<void>`
- `getHederaTopic(topicId): Promise<HederaTopic | null>`
- `getUserHederaTopics(userId): Promise<HederaTopic[]>`

#### Hedera Message Operations
- `createHederaMessage(message): Promise<void>`
- `getHederaMessage(messageId): Promise<HederaMessage | null>`
- `getTopicMessages(topicId, limit?): Promise<HederaMessage[]>`
- `getUserHederaMessages(userId, limit?): Promise<HederaMessage[]>`
- `getMessageBySequence(topicId, sequenceNumber): Promise<HederaMessage | null>`

## Advanced Features

### Message Filtering

Query messages with advanced filters:

```typescript
// Get messages with sequence number >= 2
const messages = await hederaService.queryTopicMessagesAdvanced(topicId, {
  sequenceNumberGte: 2,
  limit: 10
});

// Get messages in a range
const rangeMessages = await hederaService.queryTopicMessagesAdvanced(topicId, {
  sequenceNumberGte: 1,
  sequenceNumberLte: 5
});
```

### Database Schema

The implementation creates two new tables:

```sql
-- Topics table
CREATE TABLE hedera_topics (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL UNIQUE,
  memo TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (telegram_id)
);

-- Messages table
CREATE TABLE hedera_messages (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  message TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  consensus_timestamp DATETIME,
  running_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (telegram_id),
  FOREIGN KEY (topic_id) REFERENCES hedera_topics (topic_id),
  UNIQUE(topic_id, sequence_number)
);
```

## Error Handling

The service includes comprehensive error handling:

- Network connectivity issues
- Invalid credentials
- Topic creation failures
- Message submission failures
- Mirror Node API errors
- Database operation errors

## Cost Considerations

- Topic creation: ~$0.01 USD
- Message submission: ~$0.0001 USD per message
- Querying: Free (Mirror Node API)

Make sure your testnet account has sufficient HBAR balance for testing.

## Integration Examples

### With Telegram Bot

```typescript
// In your bot command handler
async function handleCreateTopic(msg: TelegramBot.Message) {
  const userId = msg.from!.id;
  
  try {
    const topicId = await hederaService.createTopic(`Topic by ${userId}`);
    
    // Store in database
    await dbService.createHederaTopic({
      id: generateId(),
      topicId: topicId.toString(),
      memo: `Topic by ${userId}`,
      userId,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    bot.sendMessage(msg.chat.id, `✅ Topic created: ${topicId.toString()}`);
  } catch (error) {
    bot.sendMessage(msg.chat.id, `❌ Failed to create topic: ${error}`);
  }
}
```

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**
   - Ensure `HEDERA_ACCOUNT_ID` and `HEDERA_PRIVATE_KEY` are set
   - Check that the account ID is in the correct format (0.0.123456)

2. **Insufficient Balance**
   - Make sure your testnet account has HBAR for transaction fees
   - Visit the Hedera testnet faucet to get free testnet HBAR

3. **Network Issues**
   - Check your internet connection
   - Verify Hedera testnet is accessible

4. **Database Errors**
   - Ensure the data directory exists
   - Check file permissions for SQLite database

For more help, refer to the [Hedera documentation](https://docs.hedera.com/) or the test files in this project. 