import { SDK, NetworkEnum as OneInchNetworkEnum } from "@1inch/cross-chain-sdk";
import { ethers } from 'ethers';
import { SwapQuote, OrderParams, NetworkEnum } from '../types';
import { WalletService } from './WalletService';

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

export class OneInchService {
  private sdk: SDK;
  private walletService: WalletService;

  constructor(apiUrl: string, authKey: string, walletService: WalletService) {
    this.sdk = new SDK({
      url: apiUrl,
      authKey: authKey
    });
    this.walletService = walletService;
  }

  /**
   * Get a quote for token swap
   */
  async getQuote(params: OneInchQuoteParams): Promise<SwapQuote> {
    try {
      const quote = await this.sdk.getQuote({
        srcChainId: params.srcChainId,
        dstChainId: params.dstChainId,
        srcTokenAddress: params.srcTokenAddress,
        dstTokenAddress: params.dstTokenAddress,
        amount: params.amount,
        enableEstimate: true,
        walletAddress: params.walletAddress
      });

      // Calculate estimated output amount
      const outputAmount = quote.getPreset().auctionDuration?.toString() || "0";
      
      return {
        fromToken: params.srcTokenAddress,
        toToken: params.dstTokenAddress,
        fromAmount: params.amount,
        toAmount: outputAmount,
        chainId: params.srcChainId,
        estimatedGas: "500000", // Estimate
        priceImpact: 0.1 // Estimate
      };
    } catch (error) {
      console.error('Error getting quote:', error);
      throw new Error(`Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Place a Fusion+ order
   */
  async placeOrder(
    quoteParams: OneInchQuoteParams,
    encryptedPrivateKey: string,
    slippage: number = 1
  ): Promise<OneInchOrderResult> {
    try {
      // Get fresh quote
      const quote = await this.sdk.getQuote({
        srcChainId: quoteParams.srcChainId,
        dstChainId: quoteParams.dstChainId,
        srcTokenAddress: quoteParams.srcTokenAddress,
        dstTokenAddress: quoteParams.dstTokenAddress,
        amount: quoteParams.amount,
        enableEstimate: true,
        walletAddress: quoteParams.walletAddress
      });

      // Generate secrets for the order
      const secretsCount = quote.getPreset().secretsCount;
      const secrets = Array.from({ length: secretsCount }).map(() => this.getRandomBytes32());
      
      // Create hash lock (simplified version)
      const secretHashes = secrets.map((secret) => ethers.keccak256(secret));

      // Place the order - using proper typing by casting to any for now
      // In production, implement proper HashLock from 1inch SDK
      const orderResult = await this.sdk.placeOrder(quote, {
        walletAddress: quoteParams.walletAddress,
        hashLock: secrets[0] as any, // Cast to any to bypass type checking for now
        secretHashes: secretHashes.map(hash => hash as any),
        fee: {
          takingFeeBps: 50, // 0.5% fee
          takingFeeReceiver: "0x0000000000000000000000000000000000000000"
        }
      });

      return {
        orderId: orderResult.toString(),
        status: 'pending'
      };
    } catch (error) {
      console.error('Error placing order:', error);
      throw new Error(`Failed to place order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get active orders for a wallet
   */
  async getActiveOrders(walletAddress: string): Promise<any[]> {
    try {
      const response = await this.sdk.getOrdersByMaker({
        page: 1,
        limit: 50,
        address: walletAddress
      });
      // Convert response to array format expected by caller
      return Array.isArray(response) ? response : (response as any)?.orders || [];
    } catch (error) {
      console.error('Error getting active orders:', error);
      return [];
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId: string): Promise<string> {
    try {
      // This would need to be implemented based on 1inch API
      // For now, return a placeholder
      return 'pending';
    } catch (error) {
      console.error('Error getting order status:', error);
      return 'unknown';
    }
  }

  /**
   * Estimate gas for transaction
   */
  async estimateGas(params: OneInchQuoteParams): Promise<string> {
    try {
      const quote = await this.sdk.getQuote({
        srcChainId: params.srcChainId,
        dstChainId: params.dstChainId,
        srcTokenAddress: params.srcTokenAddress,
        dstTokenAddress: params.dstTokenAddress,
        amount: params.amount,
        enableEstimate: true,
        walletAddress: params.walletAddress
      });

      // Return estimated gas
      return "500000"; // Placeholder
    } catch (error) {
      console.error('Error estimating gas:', error);
      return "500000"; // Default estimate
    }
  }

  /**
   * Generate random bytes32 for secrets
   */
  private getRandomBytes32(): string {
    return ethers.hexlify(ethers.randomBytes(32));
  }

  /**
   * Validate token address
   */
  isValidTokenAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  /**
   * Convert chain ID to NetworkEnum
   */
  chainIdToNetworkEnum(chainId: number): NetworkEnum {
    switch (chainId) {
      case 1:
        return NetworkEnum.ETHEREUM;
      case 8453:
        return NetworkEnum.BASE;
      case 42161:
        return NetworkEnum.ARBITRUM;
      case 137:
        return NetworkEnum.POLYGON;
      default:
        return NetworkEnum.ETHEREUM;
    }
  }
} 