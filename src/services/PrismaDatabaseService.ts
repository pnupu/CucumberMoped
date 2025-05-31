import { PrismaClient, User as PrismaUser, Transaction as PrismaTransaction, TokenBalance as PrismaTokenBalance, HederaTopic as PrismaHederaTopic, HederaMessage as PrismaHederaMessage } from '@prisma/client';
import { User, Transaction, TokenBalance, HederaTopic, HederaMessage } from '../types';

export class PrismaDatabaseService {
  public prisma: PrismaClient;

  constructor(databaseUrl?: string) {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl || process.env.DATABASE_URL
        }
      }
    });
  }

  // Helper methods to convert between Prisma types and our interface types
  private convertUser(prismaUser: PrismaUser): User {
    return {
      telegramId: prismaUser.telegramId,
      username: prismaUser.username || undefined,
      walletAddress: prismaUser.walletAddress,
      encryptedPrivateKey: prismaUser.encryptedPrivateKey,
      worldIdVerified: prismaUser.worldIdVerified,
      worldIdNullifierHash: prismaUser.worldIdNullifierHash || undefined,
      worldIdProof: prismaUser.worldIdProof || undefined,
      createdAt: prismaUser.createdAt,
      updatedAt: prismaUser.updatedAt
    };
  }

  private convertTransaction(prismaTransaction: PrismaTransaction): Transaction {
    return {
      id: prismaTransaction.id,
      userId: prismaTransaction.userId,
      type: prismaTransaction.type as 'deposit' | 'withdraw' | 'swap',
      fromToken: prismaTransaction.fromToken,
      toToken: prismaTransaction.toToken,
      fromAmount: prismaTransaction.fromAmount,
      toAmount: prismaTransaction.toAmount || undefined,
      chainId: prismaTransaction.chainId,
      status: prismaTransaction.status as 'pending' | 'completed' | 'failed',
      txHash: prismaTransaction.txHash || undefined,
      createdAt: prismaTransaction.createdAt,
      updatedAt: prismaTransaction.updatedAt
    };
  }

  private convertTokenBalance(prismaBalance: PrismaTokenBalance): TokenBalance {
    return {
      userId: prismaBalance.userId,
      tokenAddress: prismaBalance.tokenAddress,
      tokenSymbol: prismaBalance.tokenSymbol,
      balance: prismaBalance.balance,
      chainId: prismaBalance.chainId,
      updatedAt: prismaBalance.updatedAt
    };
  }

  private convertHederaTopic(prismaTopic: PrismaHederaTopic): HederaTopic {
    return {
      id: prismaTopic.id,
      topicId: prismaTopic.topicId,
      memo: prismaTopic.memo,
      userId: prismaTopic.userId,
      createdAt: prismaTopic.createdAt,
      updatedAt: prismaTopic.updatedAt
    };
  }

  private convertHederaMessage(prismaMessage: PrismaHederaMessage): HederaMessage {
    return {
      id: prismaMessage.id,
      topicId: prismaMessage.topicId,
      sequenceNumber: prismaMessage.sequenceNumber,
      message: prismaMessage.message,
      userId: prismaMessage.userId,
      consensusTimestamp: prismaMessage.consensusTimestamp || undefined,
      runningHash: prismaMessage.runningHash || undefined,
      createdAt: prismaMessage.createdAt,
      updatedAt: prismaMessage.updatedAt
    };
  }

  // User operations
  async createUser(telegramId: number, username: string | undefined, walletAddress: string, encryptedPrivateKey: string): Promise<void> {
    await this.prisma.user.create({
      data: {
        telegramId,
        username,
        walletAddress,
        encryptedPrivateKey
      }
    });
  }

  async getUser(telegramId: number): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { telegramId }
    });
    
    return user ? this.convertUser(user) : null;
  }

  async updateUser(telegramId: number, updates: Partial<User>): Promise<void> {
    const updateData: any = {};
    
    if (updates.username !== undefined) {
      updateData.username = updates.username;
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.user.update({
        where: { telegramId },
        data: updateData
      });
    }
  }

  // World ID verification operations
  async updateUserWorldIdVerification(
    telegramId: number, 
    verified: boolean, 
    nullifierHash?: string, 
    proof?: string
  ): Promise<void> {
    await this.prisma.user.update({
      where: { telegramId },
      data: {
        worldIdVerified: verified,
        worldIdNullifierHash: nullifierHash,
        worldIdProof: proof
      }
    });
  }

  async getUserWorldIdStatus(telegramId: number): Promise<{verified: boolean, nullifierHash?: string} | null> {
    const user = await this.prisma.user.findUnique({
      where: { telegramId },
      select: {
        worldIdVerified: true,
        worldIdNullifierHash: true
      }
    });

    if (!user) return null;

    return {
      verified: user.worldIdVerified,
      nullifierHash: user.worldIdNullifierHash || undefined
    };
  }

  // Token balance operations
  async updateTokenBalance(userId: number, tokenAddress: string, tokenSymbol: string, balance: string, chainId: number): Promise<void> {
    await this.prisma.tokenBalance.upsert({
      where: {
        userId_tokenAddress_chainId: {
          userId,
          tokenAddress,
          chainId
        }
      },
      update: {
        balance,
        tokenSymbol
      },
      create: {
        userId,
        tokenAddress,
        tokenSymbol,
        balance,
        chainId
      }
    });
  }

  async getTokenBalances(userId: number): Promise<TokenBalance[]> {
    const balances = await this.prisma.tokenBalance.findMany({
      where: { userId }
    });

    return balances.map(this.convertTokenBalance);
  }

  // Transaction operations
  async createTransaction(transaction: Transaction): Promise<void> {
    await this.prisma.transaction.create({
      data: {
        id: transaction.id,
        userId: transaction.userId,
        type: transaction.type,
        fromToken: transaction.fromToken,
        toToken: transaction.toToken,
        fromAmount: transaction.fromAmount,
        toAmount: transaction.toAmount,
        chainId: transaction.chainId,
        status: transaction.status,
        txHash: transaction.txHash
      }
    });
  }

  async updateTransactionStatus(id: string, status: 'pending' | 'completed' | 'failed', txHash?: string): Promise<void> {
    await this.prisma.transaction.update({
      where: { id },
      data: {
        status,
        txHash
      }
    });
  }

  async getUserTransactions(userId: number, limit: number = 50): Promise<Transaction[]> {
    const transactions = await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return transactions.map(this.convertTransaction);
  }

  // Alias for getUserTransactions for consistency
  async getTransactionHistory(userId: number, limit: number = 50): Promise<Transaction[]> {
    return this.getUserTransactions(userId, limit);
  }

  // Get transaction by ID
  async getTransactionById(transactionId: string): Promise<Transaction | null> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId }
    });

    return transaction ? this.convertTransaction(transaction) : null;
  }

  // Hedera topic operations
  async createHederaTopic(topic: HederaTopic): Promise<void> {
    await this.prisma.hederaTopic.create({
      data: {
        id: topic.id,
        topicId: topic.topicId,
        memo: topic.memo,
        userId: topic.userId
      }
    });
  }

  async getHederaTopic(topicId: string): Promise<HederaTopic | null> {
    const topic = await this.prisma.hederaTopic.findUnique({
      where: { topicId }
    });

    return topic ? this.convertHederaTopic(topic) : null;
  }

  async getUserHederaTopics(userId: number): Promise<HederaTopic[]> {
    const topics = await this.prisma.hederaTopic.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return topics.map(this.convertHederaTopic);
  }

  // Hedera message operations
  async createHederaMessage(message: HederaMessage): Promise<void> {
    await this.prisma.hederaMessage.create({
      data: {
        id: message.id,
        topicId: message.topicId,
        sequenceNumber: message.sequenceNumber,
        message: message.message,
        userId: message.userId,
        consensusTimestamp: message.consensusTimestamp,
        runningHash: message.runningHash
      }
    });
  }

  async getHederaMessage(messageId: string): Promise<HederaMessage | null> {
    const message = await this.prisma.hederaMessage.findUnique({
      where: { id: messageId }
    });

    return message ? this.convertHederaMessage(message) : null;
  }

  async getTopicMessages(topicId: string, limit: number = 50): Promise<HederaMessage[]> {
    const messages = await this.prisma.hederaMessage.findMany({
      where: { topicId },
      orderBy: { sequenceNumber: 'asc' },
      take: limit
    });

    return messages.map(this.convertHederaMessage);
  }

  async getUserHederaMessages(userId: number, limit: number = 50): Promise<HederaMessage[]> {
    const messages = await this.prisma.hederaMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return messages.map(this.convertHederaMessage);
  }

  async getMessageBySequence(topicId: string, sequenceNumber: number): Promise<HederaMessage | null> {
    const message = await this.prisma.hederaMessage.findUnique({
      where: {
        topicId_sequenceNumber: {
          topicId,
          sequenceNumber
        }
      }
    });

    return message ? this.convertHederaMessage(message) : null;
  }

  // CucumberMoped Index specific methods
  async findHederaTopicByMemo(memo: string): Promise<HederaTopic | null> {
    const topic = await this.prisma.hederaTopic.findFirst({
      where: { memo },
      orderBy: { createdAt: 'desc' }
    });

    return topic ? this.convertHederaTopic(topic) : null;
  }

  async getLatestMessageFromTopic(topicId: string): Promise<HederaMessage | null> {
    const message = await this.prisma.hederaMessage.findFirst({
      where: { topicId },
      orderBy: { sequenceNumber: 'desc' }
    });

    return message ? this.convertHederaMessage(message) : null;
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }

  // Additional utility methods for easier data access with relations
  async getUserWithRelations(telegramId: number) {
    return this.prisma.user.findUnique({
      where: { telegramId },
      include: {
        tokenBalances: true,
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        hederaTopics: {
          orderBy: { createdAt: 'desc' }
        },
        hederaMessages: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });
  }

  async getTopicWithMessages(topicId: string) {
    return this.prisma.hederaTopic.findUnique({
      where: { topicId },
      include: {
        messages: {
          orderBy: { sequenceNumber: 'asc' }
        },
        user: true
      }
    });
  }
} 