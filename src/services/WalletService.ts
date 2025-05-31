import { ethers } from 'ethers';
import * as crypto from 'crypto';
import { WalletInfo } from '../types';

export class WalletService {
  private encryptionKey: string;
  private cipherAlgorithm: string;

  constructor(encryptionKey: string) {
    this.encryptionKey = encryptionKey;
    // Choose cipher based on key length
    // 32 hex chars = 16 bytes = 128-bit key -> aes-128-cbc
    // 64 hex chars = 32 bytes = 256-bit key -> aes-256-cbc
    this.cipherAlgorithm = encryptionKey.length === 32 ? 'aes-128-cbc' : 'aes-256-cbc';
  }

  /**
   * Generate a new random wallet
   */
  generateWallet(): WalletInfo {
    const wallet = ethers.Wallet.createRandom();
    
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase
    };
  }

  /**
   * Encrypt sensitive data using AES-CBC (128 or 256 bit depending on key)
   */
  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.cipherAlgorithm, Buffer.from(this.encryptionKey, 'hex'), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt encrypted data
   */
  decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(this.cipherAlgorithm, Buffer.from(this.encryptionKey, 'hex'), iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Get wallet instance from encrypted private key
   */
  getWalletFromEncrypted(encryptedPrivateKey: string, provider?: ethers.Provider): ethers.Wallet {
    const privateKey = this.decrypt(encryptedPrivateKey);
    return new ethers.Wallet(privateKey, provider);
  }

  /**
   * Sign a message with wallet
   */
  async signMessage(encryptedPrivateKey: string, message: string): Promise<string> {
    const wallet = this.getWalletFromEncrypted(encryptedPrivateKey);
    return await wallet.signMessage(message);
  }

  /**
   * Sign typed data (EIP-712)
   */
  async signTypedData(
    encryptedPrivateKey: string,
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, any>
  ): Promise<string> {
    const wallet = this.getWalletFromEncrypted(encryptedPrivateKey);
    return await wallet.signTypedData(domain, types, value);
  }

  /**
   * Validate if address matches the encrypted private key
   */
  validateWallet(address: string, encryptedPrivateKey: string): boolean {
    try {
      const wallet = this.getWalletFromEncrypted(encryptedPrivateKey);
      return wallet.address.toLowerCase() === address.toLowerCase();
    } catch (error) {
      return false;
    }
  }
} 