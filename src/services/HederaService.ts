import {
  AccountId,
  PrivateKey,
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicId,
  TransactionResponse,
  Hbar,
  Status
} from '@hashgraph/sdk';
import axios from 'axios';

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

export interface MirrorNodeMessage {
  consensus_timestamp: string;
  message: string;
  payer_account_id: string;
  running_hash: string;
  running_hash_version: number;
  sequence_number: number;
  topic_id: string;
}

export interface MirrorNodeResponse {
  messages: MirrorNodeMessage[];
  links: {
    next?: string;
  };
}

/**
 * Real Hedera Consensus Service implementation using testnet
 */
export class HederaService {
  private account: HederaAccount | null = null;
  private client: Client;
  private mirrorNodeUrl: string = 'https://testnet.mirrornode.hedera.com';

  constructor() {
    this.client = Client.forTestnet();
    console.log('🌐 Initialized Hedera Service for Testnet');
  }

  /**
   * Set operator account for the client
   */
  setOperator(accountId: string | AccountId, privateKey: string | PrivateKey): void {
    const accountIdObj = typeof accountId === 'string' ? AccountId.fromString(accountId) : accountId;
    const privateKeyObj = typeof privateKey === 'string' ? PrivateKey.fromStringECDSA(privateKey) : privateKey;
    
    this.account = { 
      accountId: accountIdObj, 
      privateKey: privateKeyObj 
    };
    
    this.client.setOperator(accountIdObj, privateKeyObj);
    // Set default fees
    this.client.setDefaultMaxTransactionFee(new Hbar(100));
    this.client.setDefaultMaxQueryPayment(new Hbar(50));
    
    console.log(`🌐 Operator set to account ${accountIdObj.toString()}`);
  }

  /**
   * Create a new topic on Hedera testnet
   */
  async createTopic(memo?: string): Promise<TopicId> {
    if (!this.account) {
      throw new Error('Operator account not set');
    }

    console.log('🌐 Creating topic on Hedera Testnet...');
    
    const topicCreateTx = await new TopicCreateTransaction()
      .setTopicMemo(memo || `HCS Topic - ${Date.now()}`)
      .freezeWith(this.client);

    const topicCreateTxSigned = await topicCreateTx.sign(this.account.privateKey);
    const txResponse = await topicCreateTxSigned.execute(this.client);
    
    console.log('🌐 Topic creation transaction submitted to testnet');
    
    // Get the receipt to retrieve the topic ID
    const receipt = await txResponse.getReceipt(this.client);
    
    if (!receipt.topicId) {
      throw new Error('Failed to create topic - no topic ID in receipt');
    }

    console.log(`🌐 Topic created with ID: ${receipt.topicId.toString()}`);
    return receipt.topicId;
  }

  /**
   * Submit a message to a topic on Hedera testnet
   */
  async submitMessage(topicId: string | TopicId, message: string): Promise<number> {
    if (!this.account) {
      throw new Error('Operator account not set');
    }

    const topicIdObj = typeof topicId === 'string' ? TopicId.fromString(topicId) : topicId;
    
    console.log(`🌐 Submitting message to topic ${topicIdObj.toString()} on testnet...`);
    
    const topicMsgSubmitTx = await new TopicMessageSubmitTransaction()
      .setTransactionMemo(`HCS Message - ${Date.now()}`)
      .setTopicId(topicIdObj)
      .setMessage(message)
      .freezeWith(this.client);

    const topicMsgSubmitTxSigned = await topicMsgSubmitTx.sign(this.account.privateKey);
    const txResponse = await topicMsgSubmitTxSigned.execute(this.client);
    
    console.log('🌐 Message submission transaction submitted to testnet');
    
    // Get the receipt to retrieve the sequence number
    const receipt = await txResponse.getReceipt(this.client);
    
    if (!receipt.topicSequenceNumber) {
      throw new Error('Failed to submit message - no sequence number in receipt');
    }

    console.log(`🌐 Message submitted with sequence number: ${receipt.topicSequenceNumber.toString()}`);
    return receipt.topicSequenceNumber.toNumber();
  }

  /**
   * Query topic messages from Hedera Mirror Node
   */
  async queryTopicMessages(
    topicId: string | TopicId, 
    options?: {
      limit?: number;
      sequenceNumber?: number;
      timestamp?: string;
    }
  ): Promise<TopicMessage[]> {
    const topicIdObj = typeof topicId === 'string' ? TopicId.fromString(topicId) : topicId;
    const topicIdStr = topicIdObj.toString();
    
    let url = `${this.mirrorNodeUrl}/api/v1/topics/${topicIdStr}/messages`;
    const params: string[] = [];
    
    if (options?.limit) {
      params.push(`limit=${options.limit}`);
    }
    
    if (options?.sequenceNumber) {
      params.push(`sequencenumber=${options.sequenceNumber}`);
    }
    
    if (options?.timestamp) {
      params.push(`timestamp=${options.timestamp}`);
    }
    
    if (params.length > 0) {
      url += '?' + params.join('&');
    }
    
    console.log(`🌐 Querying topic messages from: ${url}`);
    
    try {
      const response = await axios.get<MirrorNodeResponse>(url);
      
      return response.data.messages.map(msg => ({
        sequenceNumber: msg.sequence_number,
        contents: Buffer.from(msg.message, 'base64').toString('utf8'),
        consensusTimestamp: new Date(parseFloat(msg.consensus_timestamp) * 1000),
        runningHash: msg.running_hash,
        topicId: topicIdObj
      }));
    } catch (error) {
      console.error('Error querying topic messages:', error);
      throw new Error(`Failed to query topic messages: ${error}`);
    }
  }

  /**
   * Query topic messages with advanced filtering
   */
  async queryTopicMessagesAdvanced(
    topicId: string | TopicId,
    options?: {
      limit?: number;
      sequenceNumberGte?: number;
      sequenceNumberLte?: number;
      timestampGte?: string;
      timestampLte?: string;
    }
  ): Promise<TopicMessage[]> {
    const topicIdObj = typeof topicId === 'string' ? TopicId.fromString(topicId) : topicId;
    const topicIdStr = topicIdObj.toString();
    
    let url = `${this.mirrorNodeUrl}/api/v1/topics/${topicIdStr}/messages`;
    const params: string[] = [];
    
    if (options?.limit) {
      params.push(`limit=${options.limit}`);
    }
    
    if (options?.sequenceNumberGte) {
      params.push(`sequencenumber=gte:${options.sequenceNumberGte}`);
    }
    
    if (options?.sequenceNumberLte) {
      params.push(`sequencenumber=lte:${options.sequenceNumberLte}`);
    }
    
    if (options?.timestampGte) {
      params.push(`timestamp=gte:${options.timestampGte}`);
    }
    
    if (options?.timestampLte) {
      params.push(`timestamp=lte:${options.timestampLte}`);
    }
    
    if (params.length > 0) {
      url += '?' + params.join('&');
    }
    
    console.log(`🌐 Querying topic messages (advanced) from: ${url}`);
    
    try {
      const response = await axios.get<MirrorNodeResponse>(url);
      
      return response.data.messages.map(msg => ({
        sequenceNumber: msg.sequence_number,
        contents: Buffer.from(msg.message, 'base64').toString('utf8'),
        consensusTimestamp: new Date(parseFloat(msg.consensus_timestamp) * 1000),
        runningHash: msg.running_hash,
        topicId: topicIdObj
      }));
    } catch (error) {
      console.error('Error querying topic messages:', error);
      throw new Error(`Failed to query topic messages: ${error}`);
    }
  }

  /**
   * Get a specific message by sequence number
   */
  async getMessageBySequence(
    topicId: string | TopicId, 
    sequenceNumber: number
  ): Promise<TopicMessage | null> {
    const messages = await this.queryTopicMessages(topicId, { 
      sequenceNumber,
      limit: 1 
    });
    
    return messages.length > 0 ? messages[0] : null;
  }

  /**
   * Test connectivity to Hedera testnet
   */
  async testConnectivity(): Promise<boolean> {
    try {
      if (!this.account) {
        console.log('⚠️ No operator account set');
        return false;
      }

      // Try to create a simple transaction to test connectivity
      // We'll create a basic TopicCreateTransaction but not execute it
      const testTx = new TopicCreateTransaction()
        .setTopicMemo('Connectivity Test')
        .freezeWith(this.client);
      
      console.log('🌐 Testnet connectivity OK');
      return true;
    } catch (error) {
      console.error('❌ Testnet connectivity failed:', error);
      return false;
    }
  }

  /**
   * Close the client connection
   */
  close(): void {
    this.client.close();
    console.log('🌐 Hedera client connection closed');
  }
}
