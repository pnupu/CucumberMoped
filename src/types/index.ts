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

// Limit Order interfaces
export interface LimitOrderParams {
  makerAsset: string;      // Token being sold
  takerAsset: string;      // Token being bought
  maker: string;           // Wallet address of the order creator
  receiver?: string;       // Receiver address (optional, defaults to maker)
  makingAmount: string;    // Amount of makerAsset to sell
  takingAmount: string;    // Amount of takerAsset to receive
  salt?: string;           // Random salt for order uniqueness
  extension?: string;      // Extension data (optional)
  makerTraits?: string;    // Maker traits (optional)
}

export interface LimitOrderV4Data {
  makerAsset: string;
  takerAsset: string;
  maker: string;
  receiver: string;
  makingAmount: string;
  takingAmount: string;
  salt: string;
  extension: string;
  makerTraits?: string;
}

export interface LimitOrderV4Request {
  orderHash: string;
  signature: string;
  data: LimitOrderV4Data;
}

export interface LimitOrderV4Response {
  success: boolean;
}

export interface LimitOrderCreationParams {
  tokenSymbol: string;     // Token symbol (e.g., 'ETH', 'BTC')
  tokenAddress: string;    // Token contract address
  amount: string;          // Amount to buy/sell
  orderType: 'BUY' | 'SELL'; // Whether buying or selling the token
  chainId: number;         // Chain ID
  walletAddress: string;   // User's wallet address
  useEmaPrice?: boolean;   // Whether to use EMA price (default: true)
  priceMultiplier?: number; // Price multiplier for limit price (default: 1.0)
}

export interface LimitOrderResult {
  success: boolean;
  orderId?: string;
  orderHash?: string;
  emaPrice?: number;
  limitPrice?: number;
  error?: string;
  message?: string; // Optional message field for additional information
}

// Pyth interfaces
export interface PythPriceData {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
  ema_price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}

export interface IPythService {
  getEmaPrice(tokenSymbol: string): Promise<number>;
  getMultipleEmaPrices(tokenSymbols: string[]): Promise<Map<string, number>>;
  getPriceUpdateData(tokenSymbol: string): Promise<string[]>;
  isTokenSupported(tokenSymbol: string): boolean;
  getSupportedTokens(): string[];
  addPriceFeed(tokenSymbol: string, priceId: string): void;
}

// Extended OneInch service interface for limit orders
export interface IOneInchServiceWithLimitOrders extends IOneInchService {
  createLimitOrder(params: LimitOrderCreationParams, encryptedPrivateKey: string): Promise<LimitOrderResult>;
  getLimitOrders(walletAddress: string, chainId: number): Promise<any[]>;
  cancelLimitOrder(orderHash: string, encryptedPrivateKey: string): Promise<boolean>;
  getSupportedPythTokens(): string[];
  addPythPriceFeed(tokenSymbol: string, priceId: string): void;
}

// Hedera-specific types for database storage
export interface HederaTopic {
  id: string;
  topicId: string; // Hedera topic ID (e.g., "0.0.1234")
  memo: string;
  userId: number; // Foreign key to users table
  createdAt: Date;
  updatedAt: Date;
}

export interface HederaMessage {
  id: string;
  topicId: string; // Hedera topic ID (e.g., "0.0.1234")
  sequenceNumber: number;
  message: string;
  userId: number; // Foreign key to users table
  consensusTimestamp?: Date;
  runningHash?: string;
  createdAt: Date;
  updatedAt: Date;
} 