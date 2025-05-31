export interface User {
  telegramId: number;
  username?: string;
  walletAddress: string;
  encryptedPrivateKey: string;
  // World ID verification fields
  worldIdVerified: boolean;
  worldIdNullifierHash?: string;
  worldIdProof?: string;
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

// OneInch service interfaces
export interface OneInchQuoteParams {
  srcChainId: number;
  dstChainId: number;
  srcTokenAddress: string;
  dstTokenAddress: string;
  amount: string;
  walletAddress: string;
}

export interface OneInchOrderResult {
  orderId: string;
  status: string;
  txHash?: string;
}

export interface IOneInchService {
  getQuote(params: OneInchQuoteParams): Promise<SwapQuote>;
  placeOrder(quoteParams: OneInchQuoteParams, encryptedPrivateKey: string, slippage?: number): Promise<OneInchOrderResult>;
  getActiveOrders(walletAddress: string): Promise<any[]>;
  getOrderStatus(orderId: string): Promise<string>;
  estimateGas(params: OneInchQuoteParams): Promise<string>;
  isValidTokenAddress(address: string): boolean;
}

// World ID interfaces
export interface WorldIdVerificationParams {
  action: string;
  signal?: string;
}

export interface WorldIdProof {
  nullifier_hash: string;
  merkle_root: string;
  proof: string;
  verification_level: 'orb' | 'device';
}

export interface WorldIdVerificationResult {
  success: boolean;
  proof?: WorldIdProof;
  error?: string;
}

export interface IWorldIdService {
  initializeVerification(userId: number, action?: string): Promise<string>;
  verifyProof(proof: WorldIdProof, userId: number): Promise<WorldIdVerificationResult>;
  isUserVerified(userId: number): Promise<boolean>;
  generateWorldIdUrl(userId: number, action?: string): Promise<string>;
  getVerificationUrlString(userId: number, action?: string): string;
  generateVerificationQRCode(userId: number, action?: string): Promise<string>;
  generateVerificationQRCodeBase64(userId: number, action?: string): Promise<string>;
  generateVerificationQRCodeSVG(userId: number, action?: string): Promise<string>;
  generateVerificationQRCodeBuffer(userId: number, action?: string): Promise<Buffer>;
} 