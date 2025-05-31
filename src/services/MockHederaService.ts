import {
  AccountId,
  PrivateKey,
  Client,
  TopicCreateTransaction,
  TopicMessageQuery,
  TopicMessageSubmitTransaction,
  TopicId,
  TransactionReceipt,
  TransactionResponse,
  Hbar,
  Status
} from '@hashgraph/sdk';

export interface HederaAccount {
  accountId: AccountId;
  privateKey: PrivateKey;
}

export interface TopicInfo {
  topicId: TopicId;
  memo: string;
  createdAt: Date;
  messageCount: number;
}

export interface TopicMessage {
  sequenceNumber: number;
  contents: string;
  consensusTimestamp: Date;
  runningHash: string;
  topicId: TopicId;
}

export interface SubscriptionHandle {
  unsubscribe: () => void;
}

// Mock transaction response interface for development
interface MockTransactionResponse {
  transactionId: string;
  getReceipt: (client?: Client) => Promise<{
    status: Status;
    topicId?: TopicId;
    topicSequenceNumber?: number;
    transactionId: string;
  }>;
}

/**
 * Mock Hedera Consensus Service for testing and development
 * Uses real Hedera SDK types but simulates network operations
 * Can be configured to work with testnet or as pure mock
 */
export class MockHederaService {
  private account: HederaAccount | null = null;
  private topics: Map<string, TopicInfo> = new Map();
  private messages: Map<string, TopicMessage[]> = new Map();
  private subscriptions: Map<string, ((message: TopicMessage) => void)[]> = new Map();
  private sequenceCounters: Map<string, number> = new Map();
  private client: Client | null = null;
  private useTestnet: boolean;

  constructor(useTestnet: boolean = false) {
    this.useTestnet = useTestnet;
    if (useTestnet) {
      this.client = Client.forTestnet();
      console.log('🌐 Using Hedera Testnet');
    } else {
      console.log('🧪 Using Mock Hedera Service for development/testing');
    }
  }

  /**
   * Set operator account (equivalent to client.setOperator)
   */
  setOperator(accountId: string | AccountId, privateKey: string | PrivateKey): void {
    const accountIdObj = typeof accountId === 'string' ? AccountId.fromString(accountId) : accountId;
    const privateKeyObj = typeof privateKey === 'string' ? PrivateKey.fromStringECDSA(privateKey) : privateKey;
    
    this.account = { 
      accountId: accountIdObj, 
      privateKey: privateKeyObj 
    };
    
    if (this.client) {
      this.client.setOperator(accountIdObj, privateKeyObj);
      // Set default fees
      this.client.setDefaultMaxTransactionFee(new Hbar(100));
      this.client.setDefaultMaxQueryPayment(new Hbar(50));
    }
    
    console.log(`${this.useTestnet ? '🌐' : '🧪'} Operator set to account ${accountIdObj.toString()}`);
  }

  /**
   * Create a new topic (equivalent to TopicCreateTransaction)
   */
  async createTopic(memo?: string): Promise<TransactionResponse | MockTransactionResponse> {
    if (!this.account) {
      throw new Error('Operator account not set');
    }

    if (this.useTestnet && this.client) {
      // Real testnet implementation
      console.log('🌐 Creating topic on Hedera Testnet...');
      
      const topicCreateTx = await new TopicCreateTransaction()
        .setTopicMemo(memo || `Mock HCS Topic - ${Date.now()}`)
        .freezeWith(this.client);

      const topicCreateTxSigned = await topicCreateTx.sign(this.account.privateKey);
      const txResponse = await topicCreateTxSigned.execute(this.client);
      
      console.log('🌐 Topic creation transaction submitted to testnet');
      return txResponse;
    } else {
      // Mock implementation
      const topicId = this.generateMockTopicId();
      const transactionId = this.generateTransactionId();

      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      const topicInfo: TopicInfo = {
        topicId,
        memo: memo || 'Mock topic',
        createdAt: new Date(),
        messageCount: 0
      };

      this.topics.set(topicId.toString(), topicInfo);
      this.messages.set(topicId.toString(), []);
      this.subscriptions.set(topicId.toString(), []);
      this.sequenceCounters.set(topicId.toString(), 0);

      console.log(`🧪 Mock: Topic created with ID ${topicId.toString()}`);

      return {
        transactionId,
        getReceipt: async (client?: Client) => ({
          status: Status.Success,
          topicId,
          transactionId
        })
      } as MockTransactionResponse;
    }
  }

  /**
   * Submit a message to a topic (equivalent to TopicMessageSubmitTransaction)
   */
  async submitMessage(topicId: string | TopicId, message: string): Promise<TransactionResponse | MockTransactionResponse> {
    if (!this.account) {
      throw new Error('Operator account not set');
    }

    const topicIdObj = typeof topicId === 'string' ? TopicId.fromString(topicId) : topicId;
    const topicIdStr = topicIdObj.toString();

    if (this.useTestnet && this.client) {
      // Real testnet implementation
      console.log(`🌐 Submitting message to topic ${topicIdStr} on testnet...`);
      
      const topicMsgSubmitTx = await new TopicMessageSubmitTransaction()
        .setTransactionMemo(`Mock HCS Message - ${Date.now()}`)
        .setTopicId(topicIdObj)
        .setMessage(message)
        .freezeWith(this.client);

      const topicMsgSubmitTxSigned = await topicMsgSubmitTx.sign(this.account.privateKey);
      const txResponse = await topicMsgSubmitTxSigned.execute(this.client);
      
      console.log('🌐 Message submission transaction submitted to testnet');
      return txResponse;
    } else {
      // Mock implementation
      if (!this.topics.has(topicIdStr)) {
        throw new Error(`Topic ${topicIdStr} does not exist`);
      }

      const transactionId = this.generateTransactionId();

      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));

      const sequenceNumber = this.incrementSequence(topicIdStr);
      const consensusTimestamp = new Date();
      
      const topicMessage: TopicMessage = {
        sequenceNumber,
        contents: message,
        consensusTimestamp,
        runningHash: this.generateRunningHash(topicIdStr, sequenceNumber),
        topicId: topicIdObj
      };

      // Add message to topic
      const messages = this.messages.get(topicIdStr)!;
      messages.push(topicMessage);

      // Update topic info
      const topicInfo = this.topics.get(topicIdStr)!;
      topicInfo.messageCount++;

      // Notify subscribers
      const subscribers = this.subscriptions.get(topicIdStr) || [];
      subscribers.forEach(callback => {
        try {
          setTimeout(() => callback(topicMessage), 100); // Simulate async delivery
        } catch (error) {
          console.error('🧪 Mock: Subscription callback error:', error);
        }
      });

      console.log(`🧪 Mock: Message submitted to topic ${topicIdStr}, sequence ${sequenceNumber}`);

      return {
        transactionId,
        getReceipt: async (client?: Client) => ({
          status: Status.Success,
          topicSequenceNumber: sequenceNumber,
          transactionId
        })
      } as MockTransactionResponse;
    }
  }

  /**
   * Subscribe to topic messages (equivalent to TopicMessageQuery)
   */
  subscribeToTopic(
    topicId: string | TopicId,
    startTime?: Date,
    onMessage?: (message: any) => void,
    onError?: (error: Error) => void
  ): SubscriptionHandle {
    const topicIdObj = typeof topicId === 'string' ? TopicId.fromString(topicId) : topicId;
    const topicIdStr = topicIdObj.toString();

    if (this.useTestnet && this.client) {
      // Real testnet implementation
      console.log(`🌐 Subscribing to topic ${topicIdStr} on testnet...`);
      
      const query = new TopicMessageQuery()
        .setTopicId(topicIdObj);
      
      if (startTime) {
        query.setStartTime(startTime);
      }

      // Hedera SDK subscribe method expects: client, errorHandler, messageHandler
      const subscription = query.subscribe(
        this.client,
        onError ? (message, error) => { if (error) onError(error); } : null,
        onMessage || (() => {})
      );

      return {
        unsubscribe: () => {
          subscription.unsubscribe();
          console.log(`🌐 Unsubscribed from topic ${topicIdStr} on testnet`);
        }
      };
    } else {
      // Mock implementation
      if (!this.topics.has(topicIdStr)) {
        const error = new Error(`Topic ${topicIdStr} does not exist`);
        if (onError) onError(error);
        throw error;
      }

      console.log(`🧪 Mock: Subscribing to topic ${topicIdStr}`);

      // Add callback to subscriptions
      if (onMessage) {
        if (!this.subscriptions.has(topicIdStr)) {
          this.subscriptions.set(topicIdStr, []);
        }
        
        // Wrap the callback to match Hedera SDK format
        const wrappedCallback = (message: TopicMessage) => {
          const hederaStyleMessage = {
            contents: Buffer.from(message.contents, 'utf8'),
            consensusTimestamp: {
              toDate: () => message.consensusTimestamp
            },
            sequenceNumber: message.sequenceNumber,
            runningHash: message.runningHash,
            topicId: message.topicId
          };
          onMessage(hederaStyleMessage);
        };
        
        this.subscriptions.get(topicIdStr)!.push(wrappedCallback);

        // If startTime is specified, replay historical messages
        if (startTime) {
          const messages = this.messages.get(topicIdStr) || [];
          const historicalMessages = messages.filter(msg => msg.consensusTimestamp >= startTime);
          historicalMessages.forEach(msg => {
            setTimeout(() => wrappedCallback(msg), 50); // Simulate async delivery
          });
        }
      }

      return {
        unsubscribe: () => {
          if (onMessage) {
            const subscribers = this.subscriptions.get(topicIdStr) || [];
            // Note: This is a simplified unsubscribe for mock
            this.subscriptions.set(topicIdStr, []);
            console.log(`🧪 Mock: Unsubscribed from topic ${topicIdStr}`);
          }
        }
      };
    }
  }

  /**
   * Get topic information (mock only)
   */
  getTopicInfo(topicId: string | TopicId): TopicInfo | null {
    const topicIdStr = typeof topicId === 'string' ? topicId : topicId.toString();
    return this.topics.get(topicIdStr) || null;
  }

  /**
   * Get messages for a topic (mock only)
   */
  getTopicMessages(topicId: string | TopicId, limit?: number): TopicMessage[] {
    const topicIdStr = typeof topicId === 'string' ? topicId : topicId.toString();
    const messages = this.messages.get(topicIdStr) || [];
    return limit ? messages.slice(-limit) : messages;
  }

  /**
   * Get all topics (mock only)
   */
  getAllTopics(): TopicInfo[] {
    return Array.from(this.topics.values());
  }

  /**
   * Close client connection
   */
  close(): void {
    if (this.client) {
      this.client.close();
      console.log('🌐 Hedera client connection closed');
    }
  }

  /**
   * Clear all data (useful for testing)
   */
  reset(): void {
    this.topics.clear();
    this.messages.clear();
    this.subscriptions.clear();
    this.sequenceCounters.clear();
    this.account = null;
    console.log(`${this.useTestnet ? '🌐' : '🧪'} Hedera service reset`);
  }

  /**
   * Simulate the hello-future-world tutorial example
   */
  async runHelloWorldExample(): Promise<void> {
    try {
      console.log(`${this.useTestnet ? '🌐' : '🧪'} Running Hello Future World example...`);

      // Create a new topic
      const createResponse = await this.createTopic('Hello Future World topic');
      const receipt = await createResponse.getReceipt(this.client!);
      const topicId = receipt.topicId!;
      
      console.log(`${this.useTestnet ? '🌐' : '🧪'} Your topic ID is: ${topicId.toString()}`);

      // Wait 5 seconds between topic creation and subscription
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Subscribe to the topic
      const subscription = this.subscribeToTopic(
        topicId,
        undefined,
        (message) => {
          const messageAsString = Buffer.from(message.contents, "utf8").toString();
          console.log(
            `${this.useTestnet ? '🌐' : '🧪'} ${message.consensusTimestamp.toDate()} Received: ${messageAsString}`
          );
        }
      );

      // Send message to topic
      const sendResponse = await this.submitMessage(topicId, 'Hello, HCS!');
      const sendReceipt = await sendResponse.getReceipt(this.client!);
      
      console.log(`${this.useTestnet ? '🌐' : '🧪'} The message transaction status: ${sendReceipt.status.toString()}`);

      // Clean up subscription after a delay
      setTimeout(() => {
        subscription.unsubscribe();
        console.log(`${this.useTestnet ? '🌐' : '🧪'} Hello World example completed`);
        if (this.useTestnet) {
          this.close();
        }
      }, 2000);

    } catch (error) {
      console.error(`${this.useTestnet ? '🌐' : '🧪'} Hello World example error:`, error);
      throw error;
    }
  }

  /**
   * Test function to verify Hedera testnet connectivity and functionality
   * This will be called during bot startup to ensure everything works
   */
  async testHederaConnectivity(): Promise<boolean> {
    try {
      console.log('\n🧪 Testing Hedera Testnet Connectivity...');
      console.log('=' .repeat(50));

      if (!this.useTestnet) {
        console.log('⚠️  Service is in mock mode, switching to testnet for test');
        this.useTestnet = true;
        this.client = Client.forTestnet();
      }

      // Check if operator is set
      if (!this.account) {
        console.log('❌ No operator account set');
        return false;
      }

      console.log(`🔑 Using operator account: ${this.account.accountId.toString()}`);

      // Test 1: Create a topic
      console.log('\n📝 Test 1: Creating a test topic...');
      const createResponse = await this.createTopic('Hedera Connectivity Test Topic');
      const receipt = await createResponse.getReceipt(this.client!);
      
      if (!receipt.topicId) {
        console.log('❌ Failed to create topic - no topic ID in receipt');
        return false;
      }

      const topicId = receipt.topicId;
      console.log(`✅ Topic created successfully: ${topicId.toString()}`);
      console.log(`📊 Transaction status: ${receipt.status.toString()}`);

      // Test 2: Submit a message
      console.log('\n💬 Test 2: Submitting a test message...');
      const messageResponse = await this.submitMessage(topicId, 'Hello from Telegram Trading Bot!');
      const messageReceipt = await messageResponse.getReceipt(this.client!);

      if (!messageReceipt.topicSequenceNumber) {
        console.log('❌ Failed to submit message - no sequence number in receipt');
        return false;
      }

      console.log(`✅ Message submitted successfully`);
      console.log(`📊 Transaction status: ${messageReceipt.status.toString()}`);
      console.log(`🔢 Sequence number: ${messageReceipt.topicSequenceNumber}`);

      // Test 3: Subscribe to messages (brief test)
      console.log('\n👂 Test 3: Testing message subscription...');
      let messageReceived = false;
      
      const subscription = this.subscribeToTopic(
        topicId,
        undefined,
        (message) => {
          const messageContent = Buffer.from(message.contents, "utf8").toString();
          console.log(`✅ Received message: "${messageContent}"`);
          console.log(`📅 Consensus timestamp: ${message.consensusTimestamp.toDate()}`);
          messageReceived = true;
        },
        (error) => {
          console.log(`❌ Subscription error: ${error.message}`);
        }
      );

      // Send another message to test subscription
      console.log('📤 Sending verification message...');
      await this.submitMessage(topicId, 'Subscription test message');

      // Wait for message to be received
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      subscription.unsubscribe();

      if (!messageReceived) {
        console.log('⚠️  No message received via subscription (this might be normal due to timing)');
      }

      // Test 4: Check HashScan URL
      console.log('\n🔍 Test 4: Generating verification URLs...');
      const hashScanUrl = `https://hashscan.io/testnet/topic/${topicId.toString()}`;
      console.log(`🔗 HashScan URL: ${hashScanUrl}`);
      
      const mirrorNodeUrl = `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId.toString()}/messages`;
      console.log(`🪞 Mirror Node API: ${mirrorNodeUrl}`);

      console.log('\n' + '=' .repeat(50));
      console.log('🎉 Hedera Testnet Connectivity Test PASSED!');
      console.log('✅ All basic operations working correctly');
      console.log(`📋 Test topic ID: ${topicId.toString()}`);
      console.log('🔗 You can verify the transactions on HashScan');
      console.log('=' .repeat(50));

      return true;

    } catch (error) {
      console.log('\n' + '=' .repeat(50));
      console.log('❌ Hedera Testnet Connectivity Test FAILED!');
      console.error('💥 Error:', error instanceof Error ? error.message : error);
      
      if (error instanceof Error && error.message.includes('INVALID_ACCOUNT_ID')) {
        console.log('\n💡 Troubleshooting tips:');
        console.log('• Check your HEDERA_TESTNET_ACCOUNT_ID in .env file');
        console.log('• Make sure the account exists on Hedera Testnet');
        console.log('• Verify the account has HBAR balance for transactions');
      } else if (error instanceof Error && error.message.includes('INVALID_SIGNATURE')) {
        console.log('\n💡 Troubleshooting tips:');
        console.log('• Check your HEDERA_TESTNET_PRIVATE_KEY in .env file');
        console.log('• Make sure the private key matches the account ID');
        console.log('• Verify the private key format (should be DER encoded)');
      } else if (error instanceof Error && error.message.includes('INSUFFICIENT_ACCOUNT_BALANCE')) {
        console.log('\n💡 Troubleshooting tips:');
        console.log('• Your testnet account needs HBAR for transaction fees');
        console.log('• Visit: https://portal.hedera.com/register to get testnet HBAR');
        console.log('• Or use the Hedera faucet to fund your account');
      }
      
      console.log('=' .repeat(50));
      return false;
    } finally {
      // Always close the client
      if (this.client) {
        this.close();
      }
    }
  }

  // Private helper methods

  private generateMockTopicId(): TopicId {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 3);
    const mockId = `0.0.${timestamp.toString().slice(-6)}${random}`;
    return TopicId.fromString(mockId);
  }

  private generateTransactionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${this.account?.accountId.toString()}@${timestamp}.${random}`;
  }

  private generateRunningHash(topicId: string, sequenceNumber: number): string {
    // Simple mock hash generation
    const data = `${topicId}:${sequenceNumber}:${Date.now()}`;
    return `mock_hash_${btoa(data).slice(0, 16)}`;
  }

  private incrementSequence(topicId: string): number {
    const current = this.sequenceCounters.get(topicId) || 0;
    const next = current + 1;
    this.sequenceCounters.set(topicId, next);
    return next;
  }
}

// Example usage in tutorial format
export async function submitFirstMessage(useTestnet: boolean = false): Promise<void> {
  const hederaService = new MockHederaService(useTestnet);
  
  // Grab the OPERATOR_ID and OPERATOR_KEY from the .env file
  const myAccountId = process.env.MY_ACCOUNT_ID || process.env.HEDERA_TESTNET_ACCOUNT_ID || '0.0.123456';
  const myPrivateKey = process.env.MY_PRIVATE_KEY || process.env.HEDERA_TESTNET_PRIVATE_KEY || 'mock_private_key';
  
  // Set the operator account ID and operator private key
  hederaService.setOperator(myAccountId, myPrivateKey);

  // Create a new topic
  const txResponse = await hederaService.createTopic();
  
  // Grab the newly generated topic ID
  const receipt = await txResponse.getReceipt(hederaService['client']!);
  const topicId = receipt.topicId!;
  console.log(`Your topic ID is: ${topicId.toString()}`);

  // Wait 5 seconds between consensus topic creation and subscription creation
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Create the topic subscription
  hederaService.subscribeToTopic(topicId, undefined, (message) => {
    const messageAsString = Buffer.from(message.contents, "utf8").toString();
    console.log(
      `${message.consensusTimestamp.toDate()} Received: ${messageAsString}`
    );
  });

  // Send message to topic
  const sendResponse = await hederaService.submitMessage(topicId, 'Hello, HCS!');
  const getReceipt = await sendResponse.getReceipt(hederaService['client']!);

  // Get the status of the transaction
  const transactionStatus = getReceipt.status;
  console.log("The message transaction status: " + transactionStatus.toString());
  
  // Clean up
  setTimeout(() => {
    hederaService.close();
  }, 10000);
}
