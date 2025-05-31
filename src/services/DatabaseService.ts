import sqlite3 from 'sqlite3';
import { User, Transaction, TokenBalance, HederaTopic, HederaMessage } from '../types';
import path from 'path';
import fs from 'fs';

export class DatabaseService {
  private db: sqlite3.Database;

  constructor(dbPath: string) {
    // Ensure data directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new sqlite3.Database(dbPath);
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.serialize(() => {
      // Users table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          telegram_id INTEGER PRIMARY KEY,
          username TEXT,
          wallet_address TEXT NOT NULL UNIQUE,
          encrypted_private_key TEXT NOT NULL,
          world_id_verified BOOLEAN DEFAULT FALSE,
          world_id_nullifier_hash TEXT,
          world_id_proof TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Token balances table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS token_balances (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          token_address TEXT NOT NULL,
          token_symbol TEXT NOT NULL,
          balance TEXT NOT NULL,
          chain_id INTEGER NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (telegram_id),
          UNIQUE(user_id, token_address, chain_id)
        )
      `);

      // Transactions table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw', 'swap')),
          from_token TEXT NOT NULL,
          to_token TEXT NOT NULL,
          from_amount TEXT NOT NULL,
          to_amount TEXT,
          chain_id INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
          tx_hash TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (telegram_id)
        )
      `);

      // Hedera topics table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS hedera_topics (
          id TEXT PRIMARY KEY,
          topic_id TEXT NOT NULL UNIQUE,
          memo TEXT NOT NULL,
          user_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (telegram_id)
        )
      `);

      // Hedera messages table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS hedera_messages (
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
        )
      `);
    });
  }

  // User operations
  async createUser(telegramId: number, username: string | undefined, walletAddress: string, encryptedPrivateKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO users (telegram_id, username, wallet_address, encrypted_private_key) VALUES (?, ?, ?, ?)',
        [telegramId, username, walletAddress, encryptedPrivateKey],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getUser(telegramId: number): Promise<User | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE telegram_id = ?',
        [telegramId],
        (err, row: any) => {
          if (err) reject(err);
          else if (row) {
            resolve({
              telegramId: row.telegram_id,
              username: row.username,
              walletAddress: row.wallet_address,
              encryptedPrivateKey: row.encrypted_private_key,
              worldIdVerified: Boolean(row.world_id_verified),
              worldIdNullifierHash: row.world_id_nullifier_hash,
              worldIdProof: row.world_id_proof,
              createdAt: new Date(row.created_at),
              updatedAt: new Date(row.updated_at)
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  async updateUser(telegramId: number, updates: Partial<User>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.username !== undefined) {
      fields.push('username = ?');
      values.push(updates.username);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(telegramId);

    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE users SET ${fields.join(', ')} WHERE telegram_id = ?`,
        values,
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // World ID verification operations
  async updateUserWorldIdVerification(
    telegramId: number, 
    verified: boolean, 
    nullifierHash?: string, 
    proof?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE users SET 
         world_id_verified = ?, 
         world_id_nullifier_hash = ?, 
         world_id_proof = ?,
         updated_at = CURRENT_TIMESTAMP 
         WHERE telegram_id = ?`,
        [verified, nullifierHash, proof, telegramId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getUserWorldIdStatus(telegramId: number): Promise<{verified: boolean, nullifierHash?: string} | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT world_id_verified, world_id_nullifier_hash FROM users WHERE telegram_id = ?',
        [telegramId],
        (err, row: any) => {
          if (err) reject(err);
          else if (row) {
            resolve({
              verified: Boolean(row.world_id_verified),
              nullifierHash: row.world_id_nullifier_hash
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  // Token balance operations
  async updateTokenBalance(userId: number, tokenAddress: string, tokenSymbol: string, balance: string, chainId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO token_balances 
         (user_id, token_address, token_symbol, balance, chain_id, updated_at) 
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [userId, tokenAddress, tokenSymbol, balance, chainId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getTokenBalances(userId: number): Promise<TokenBalance[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM token_balances WHERE user_id = ?',
        [userId],
        (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const balances = rows.map(row => ({
              userId: row.user_id,
              tokenAddress: row.token_address,
              tokenSymbol: row.token_symbol,
              balance: row.balance,
              chainId: row.chain_id,
              updatedAt: new Date(row.updated_at)
            }));
            resolve(balances);
          }
        }
      );
    });
  }

  // Transaction operations
  async createTransaction(transaction: Transaction): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO transactions 
         (id, user_id, type, from_token, to_token, from_amount, to_amount, chain_id, status, tx_hash) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transaction.id,
          transaction.userId,
          transaction.type,
          transaction.fromToken,
          transaction.toToken,
          transaction.fromAmount,
          transaction.toAmount,
          transaction.chainId,
          transaction.status,
          transaction.txHash
        ],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async updateTransactionStatus(id: string, status: 'pending' | 'completed' | 'failed', txHash?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE transactions SET status = ?, tx_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, txHash, id],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getUserTransactions(userId: number, limit: number = 50): Promise<Transaction[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        [userId, limit],
        (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const transactions = rows.map(row => ({
              id: row.id,
              userId: row.user_id,
              type: row.type as 'deposit' | 'withdraw' | 'swap',
              fromToken: row.from_token,
              toToken: row.to_token,
              fromAmount: row.from_amount,
              toAmount: row.to_amount,
              chainId: row.chain_id,
              status: row.status as 'pending' | 'completed' | 'failed',
              txHash: row.tx_hash,
              createdAt: new Date(row.created_at),
              updatedAt: new Date(row.updated_at)
            }));
            resolve(transactions);
          }
        }
      );
    });
  }

  // Alias for getUserTransactions for consistency
  async getTransactionHistory(userId: number, limit: number = 50): Promise<Transaction[]> {
    return this.getUserTransactions(userId, limit);
  }

  // Get transaction by ID
  async getTransactionById(transactionId: string): Promise<Transaction | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM transactions WHERE id = ?',
        [transactionId],
        (err, row: any) => {
          if (err) reject(err);
          else if (row) {
            resolve({
              id: row.id,
              userId: row.user_id,
              type: row.type as 'deposit' | 'withdraw' | 'swap',
              fromToken: row.from_token,
              toToken: row.to_token,
              fromAmount: row.from_amount,
              toAmount: row.to_amount,
              chainId: row.chain_id,
              status: row.status as 'pending' | 'completed' | 'failed',
              txHash: row.tx_hash,
              createdAt: new Date(row.created_at),
              updatedAt: new Date(row.updated_at)
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  close(): void {
    this.db.close();
  }

  // Hedera topic operations
  async createHederaTopic(topic: HederaTopic): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO hedera_topics (id, topic_id, memo, user_id) VALUES (?, ?, ?, ?)`,
        [topic.id, topic.topicId, topic.memo, topic.userId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getHederaTopic(topicId: string): Promise<HederaTopic | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM hedera_topics WHERE topic_id = ?',
        [topicId],
        (err, row: any) => {
          if (err) reject(err);
          else if (row) {
            resolve({
              id: row.id,
              topicId: row.topic_id,
              memo: row.memo,
              userId: row.user_id,
              createdAt: new Date(row.created_at),
              updatedAt: new Date(row.updated_at)
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  async getUserHederaTopics(userId: number): Promise<HederaTopic[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM hedera_topics WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const topics = rows.map(row => ({
              id: row.id,
              topicId: row.topic_id,
              memo: row.memo,
              userId: row.user_id,
              createdAt: new Date(row.created_at),
              updatedAt: new Date(row.updated_at)
            }));
            resolve(topics);
          }
        }
      );
    });
  }

  // Hedera message operations
  async createHederaMessage(message: HederaMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO hedera_messages 
         (id, topic_id, sequence_number, message, user_id, consensus_timestamp, running_hash) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          message.id,
          message.topicId,
          message.sequenceNumber,
          message.message,
          message.userId,
          message.consensusTimestamp?.toISOString(),
          message.runningHash
        ],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getHederaMessage(messageId: string): Promise<HederaMessage | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM hedera_messages WHERE id = ?',
        [messageId],
        (err, row: any) => {
          if (err) reject(err);
          else if (row) {
            resolve({
              id: row.id,
              topicId: row.topic_id,
              sequenceNumber: row.sequence_number,
              message: row.message,
              userId: row.user_id,
              consensusTimestamp: row.consensus_timestamp ? new Date(row.consensus_timestamp) : undefined,
              runningHash: row.running_hash,
              createdAt: new Date(row.created_at),
              updatedAt: new Date(row.updated_at)
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  async getTopicMessages(topicId: string, limit: number = 50): Promise<HederaMessage[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM hedera_messages WHERE topic_id = ? ORDER BY sequence_number ASC LIMIT ?',
        [topicId, limit],
        (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const messages = rows.map(row => ({
              id: row.id,
              topicId: row.topic_id,
              sequenceNumber: row.sequence_number,
              message: row.message,
              userId: row.user_id,
              consensusTimestamp: row.consensus_timestamp ? new Date(row.consensus_timestamp) : undefined,
              runningHash: row.running_hash,
              createdAt: new Date(row.created_at),
              updatedAt: new Date(row.updated_at)
            }));
            resolve(messages);
          }
        }
      );
    });
  }

  async getUserHederaMessages(userId: number, limit: number = 50): Promise<HederaMessage[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM hedera_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        [userId, limit],
        (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const messages = rows.map(row => ({
              id: row.id,
              topicId: row.topic_id,
              sequenceNumber: row.sequence_number,
              message: row.message,
              userId: row.user_id,
              consensusTimestamp: row.consensus_timestamp ? new Date(row.consensus_timestamp) : undefined,
              runningHash: row.running_hash,
              createdAt: new Date(row.created_at),
              updatedAt: new Date(row.updated_at)
            }));
            resolve(messages);
          }
        }
      );
    });
  }

  async getMessageBySequence(topicId: string, sequenceNumber: number): Promise<HederaMessage | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM hedera_messages WHERE topic_id = ? AND sequence_number = ?',
        [topicId, sequenceNumber],
        (err, row: any) => {
          if (err) reject(err);
          else if (row) {
            resolve({
              id: row.id,
              topicId: row.topic_id,
              sequenceNumber: row.sequence_number,
              message: row.message,
              userId: row.user_id,
              consensusTimestamp: row.consensus_timestamp ? new Date(row.consensus_timestamp) : undefined,
              runningHash: row.running_hash,
              createdAt: new Date(row.created_at),
              updatedAt: new Date(row.updated_at)
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  // CucumberMoped Index specific methods
  async findHederaTopicByMemo(memo: string): Promise<HederaTopic | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM hedera_topics WHERE memo = ? ORDER BY created_at DESC LIMIT 1',
        [memo],
        (err, row: any) => {
          if (err) reject(err);
          else if (row) {
            resolve({
              id: row.id,
              topicId: row.topic_id,
              memo: row.memo,
              userId: row.user_id,
              createdAt: new Date(row.created_at),
              updatedAt: new Date(row.updated_at)
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  async getLatestMessageFromTopic(topicId: string): Promise<HederaMessage | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM hedera_messages WHERE topic_id = ? ORDER BY sequence_number DESC LIMIT 1',
        [topicId],
        (err, row: any) => {
          if (err) reject(err);
          else if (row) {
            resolve({
              id: row.id,
              topicId: row.topic_id,
              sequenceNumber: row.sequence_number,
              message: row.message,
              userId: row.user_id,
              consensusTimestamp: row.consensus_timestamp ? new Date(row.consensus_timestamp) : undefined,
              runningHash: row.running_hash,
              createdAt: new Date(row.created_at),
              updatedAt: new Date(row.updated_at)
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }
} 