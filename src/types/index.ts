export interface User {
  telegramId: number;
  username?: string;
  walletAddress: string;
  encryptedPrivateKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenBalance {
  userId: number;
  tokenAddress: string;
  tokenSymbol: string;
  balance: string;
  chainId: number;
  updatedAt: Date;
}

export interface Transaction {
  id: string;
  userId: number;
  type: 'deposit' | 'withdraw' | 'swap';
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount?: string;
  chainId: number;
  status: 'pending' | 'completed' | 'failed';
  txHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupportedToken {
  symbol: string;
  address: string;
  chainId: number;
  decimals: number;
  isStablecoin: boolean;
}

export interface SwapQuote {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  chainId: number;
  estimatedGas: string;
  priceImpact: number;
}

export interface WalletInfo {
  address: string;
  privateKey: string;
  mnemonic?: string;
}

export enum NetworkEnum {
  ETHEREUM = 1,
  BASE = 8453,
  ARBITRUM = 42161,
  POLYGON = 137
}

export interface TradingPair {
  fromToken: SupportedToken;
  toToken: SupportedToken;
  chainId: number;
}

export interface OrderParams {
  walletAddress: string;
  fromToken: string;
  toToken: string;
  amount: string;
  chainId: number;
  slippage?: number;
}

export interface BotCommand {
  command: string;
  description: string;
  handler: string;
} 