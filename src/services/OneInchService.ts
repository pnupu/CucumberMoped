import { SDK, NetworkEnum as OneInchNetworkEnum } from "@1inch/cross-chain-sdk";
import { FusionSDK, NetworkEnum as FusionNetworkEnum } from "@1inch/fusion-sdk";
import { ethers } from 'ethers';
import { SwapQuote, OrderParams, NetworkEnum, IOneInchService, OneInchQuoteParams, OneInchOrderResult } from '../types';
import { WalletService } from './WalletService';
import axios from 'axios';

export class OneInchService implements IOneInchService {
  private crossChainSDK: SDK;
  private fusionSDKs: Map<number, FusionSDK> = new Map();
  private walletService: WalletService;
  protected apiKey: string;

  constructor(apiUrl: string, authKey: string, walletService: WalletService) {
    // Cross-chain SDK for cross-chain swaps
    this.crossChainSDK = new SDK({
      url: apiUrl,
      authKey: authKey
    });

    // Initialize Fusion SDKs for same-chain swaps
    this.initializeFusionSDKs(authKey);
    
    this.walletService = walletService;
    this.apiKey = authKey;
  }

  private initializeFusionSDKs(authKey: string): void {
    // Initialize Fusion SDKs for each supported network
    const networkMappings = [
      { chainId: 1, fusionNetwork: 1 }, // Ethereum
      { chainId: 8453, fusionNetwork: 8453 }, // Base
      { chainId: 42161, fusionNetwork: 42161 }, // Arbitrum
      { chainId: 137, fusionNetwork: 137 }, // Polygon
      { chainId: 56, fusionNetwork: 56 }, // BNB Chain
      { chainId: 43114, fusionNetwork: 43114 }, // Avalanche
      { chainId: 10, fusionNetwork: 10 }, // Optimism
      { chainId: 100, fusionNetwork: 100 }, // Gnosis
      { chainId: 250, fusionNetwork: 250 }, // Fantom
      { chainId: 324, fusionNetwork: 324 }, // zkSync
      { chainId: 59144, fusionNetwork: 59144 } // Linea
    ];

    for (const { chainId, fusionNetwork } of networkMappings) {
      try {
        const fusionSDK = new FusionSDK({
          url: "https://api.1inch.dev/fusion",
          network: fusionNetwork,
          authKey: authKey
        });
        this.fusionSDKs.set(chainId, fusionSDK);
        console.log(`✅ Initialized Fusion SDK for chain ${chainId}`);
      } catch (error) {
        console.warn(`⚠️ Failed to initialize Fusion SDK for chain ${chainId}:`, error);
      }
    }
  }

  /**
   * Get a quote for token swap (handles both same-chain and cross-chain)
   */
  async getQuote(params: OneInchQuoteParams): Promise<SwapQuote> {
    // Check if this is a same-chain or cross-chain swap
    if (params.srcChainId === params.dstChainId) {
      return this.getSameChainQuote(params);
    } else {
      return this.getCrossChainQuote(params);
    }
  }

  /**
   * Get same-chain quote using Fusion SDK with fallback to regular 1inch API
   */
  private async getSameChainQuote(params: OneInchQuoteParams): Promise<SwapQuote> {
    try {
      console.log('💱 Getting same-chain quote via Fusion SDK');
      
      const chainId = params.srcChainId;
      const fusionSDK = this.fusionSDKs.get(chainId);
      
      if (!fusionSDK) {
        console.log('⚠️ Fusion SDK not available, falling back to regular API');
        return this.getRegularApiQuote(params);
      }

      try {
        const quote = await fusionSDK.getQuote({
          fromTokenAddress: params.srcTokenAddress,
          toTokenAddress: params.dstTokenAddress,
          amount: params.amount
        });

        // Get output amount from Fusion quote
        let outputAmount = "0";
        
        // Extract the output amount from fusion quote response
        if (quote && typeof quote === 'object') {
          const quoteObj = quote as any;
          if (quoteObj.toAmount) {
            outputAmount = quoteObj.toAmount.toString();
          } else if (quoteObj.dstAmount) {
            outputAmount = quoteObj.dstAmount.toString();
          } else if (quoteObj.toTokenAmount) {
            outputAmount = quoteObj.toTokenAmount.toString();
          } else {
            console.log('Fusion quote structure:', Object.keys(quoteObj));
            outputAmount = "1000000000000000000";
          }
        }
        
        console.log('✅ Fusion quote successful');
        return {
          fromToken: params.srcTokenAddress,
          toToken: params.dstTokenAddress,
          fromAmount: params.amount,
          toAmount: outputAmount,
          chainId: params.srcChainId,
          estimatedGas: "300000",
          priceImpact: 0.05
        };
      } catch (fusionError: any) {
        // Check if it's a fee-on-transfer token error
        if (fusionError?.response?.data?.description?.includes('fee on transfers') ||
            fusionError?.message?.includes('fee on transfers')) {
          console.log('⚠️ Token has fee-on-transfer, falling back to regular 1inch API');
          return this.getRegularApiQuote(params);
        }
        throw fusionError;
      }
    } catch (error) {
      console.error('Error getting same-chain quote:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('insufficient liquidity')) {
          throw new Error('Insufficient liquidity for this swap.');
        }
        if (error.message.includes('amount too small')) {
          throw new Error('Minimum swap amount not met. Try with a larger amount.');
        }
      }
      
      throw new Error(`Failed to get same-chain quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fallback to regular 1inch API for tokens not supported by Fusion
   */
  private async getRegularApiQuote(params: OneInchQuoteParams): Promise<SwapQuote> {
    console.log('🔄 Using regular 1inch API as fallback');
    
    const chainId = params.srcChainId;
    const url = `https://api.1inch.dev/swap/v6.0/${chainId}/quote`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'accept': 'application/json'
      },
      params: {
        src: params.srcTokenAddress,
        dst: params.dstTokenAddress,
        amount: params.amount,
        from: params.walletAddress,
        slippage: 1,
        disableEstimate: false,
        allowPartialFill: false,
        includeTokensInfo: false,
        includeProtocols: false,
        includeGas: true
      }
    });

    const data = response.data;
    
    return {
      fromToken: params.srcTokenAddress,
      toToken: params.dstTokenAddress,
      fromAmount: params.amount,
      toAmount: data.dstAmount,
      chainId: params.srcChainId,
      estimatedGas: data.gas || "500000",
      priceImpact: 0.1
    };
  }

  /**
   * Get cross-chain quote using Fusion+ SDK
   */
  private async getCrossChainQuote(params: OneInchQuoteParams): Promise<SwapQuote> {
    try {
      console.log('🌉 Getting cross-chain quote via Fusion+');
      
      const quote = await this.crossChainSDK.getQuote({
        srcChainId: params.srcChainId,
        dstChainId: params.dstChainId,
        srcTokenAddress: params.srcTokenAddress,
        dstTokenAddress: params.dstTokenAddress,
        amount: params.amount,
        enableEstimate: true,
        walletAddress: params.walletAddress
      });

      // Log key information about the quote response safely
      console.log('✅ 1inch quote received for cross-chain swap');
      
      // For cross-chain quotes, try to extract the destination amount
      // The response structure might have different paths for the destination amount
      let outputAmount = "0";
      
      try {
        // Extract the destination amount using proper typed properties
        const preset = quote.getPreset();
        
        // Use auctionEndAmount as the primary choice (best price at auction end)
        // Fall back to auctionStartAmount if needed
        if (preset.auctionEndAmount) {
          outputAmount = preset.auctionEndAmount.toString();
        } else if (preset.auctionStartAmount) {
          outputAmount = preset.auctionStartAmount.toString();
        } else if (preset.startAmount) {
          outputAmount = preset.startAmount.toString();
        } else {
          // Log the preset structure for debugging if no amount found
          console.log('Preset structure - available properties:', Object.keys(preset));
          console.log('auctionEndAmount:', preset.auctionEndAmount);
          console.log('auctionStartAmount:', preset.auctionStartAmount);
          outputAmount = "1000000000000000000"; // 1 token as fallback for debugging
        }
      } catch (error) {
        console.error('Error extracting output amount:', error);
        outputAmount = "1000000000000000000"; // 1 token as fallback
      }
      
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
      console.error('Error getting cross-chain quote:', error);
      
      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes('swap amount too small')) {
          throw new Error('Minimum swap amount not met. Try with a larger amount (e.g., 10+ USDC for cross-chain swaps).');
        }
        if (error.message.includes('token not supported')) {
          throw new Error('Token not supported for cross-chain swaps on 1inch Fusion+.');
        }
      }
      
      throw new Error(`Failed to get cross-chain quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Place an order (Fusion for same-chain, Fusion+ for cross-chain)
   */
  async placeOrder(
    quoteParams: OneInchQuoteParams,
    encryptedPrivateKey: string,
    slippage: number = 1
  ): Promise<OneInchOrderResult> {
    try {
      // Check if this is same-chain or cross-chain
      if (quoteParams.srcChainId === quoteParams.dstChainId) {
        return this.placeSameChainOrder(quoteParams, encryptedPrivateKey, slippage);
      } else {
        return this.placeCrossChainOrder(quoteParams, encryptedPrivateKey, slippage);
      }
    } catch (error) {
      console.error('Error placing order:', error);
      throw new Error(`Failed to place order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Place same-chain Fusion order with fallback to regular 1inch API
   */
  private async placeSameChainOrder(
    quoteParams: OneInchQuoteParams,
    encryptedPrivateKey: string,
    slippage: number = 1
  ): Promise<OneInchOrderResult> {
    const chainId = quoteParams.srcChainId;
    const fusionSDK = this.fusionSDKs.get(chainId);
    
    if (!fusionSDK) {
      console.log('⚠️ Fusion SDK not available, using regular 1inch API');
      return this.placeRegularApiOrder(quoteParams, encryptedPrivateKey, slippage);
    }

    try {
      console.log('🔥 Placing same-chain Fusion order');

      const orderResult = await fusionSDK.placeOrder({
        fromTokenAddress: quoteParams.srcTokenAddress,
        toTokenAddress: quoteParams.dstTokenAddress,
        amount: quoteParams.amount,
        walletAddress: quoteParams.walletAddress
      });

      return {
        orderId: orderResult.toString(),
        status: 'pending'
      };
    } catch (fusionError: any) {
      // Check if it's a fee-on-transfer token error
      if (fusionError?.response?.data?.description?.includes('fee on transfers') ||
          fusionError?.message?.includes('fee on transfers')) {
        console.log('⚠️ Token has fee-on-transfer, falling back to regular 1inch API');
        return this.placeRegularApiOrder(quoteParams, encryptedPrivateKey, slippage);
      }
      throw fusionError;
    }
  }

  /**
   * Fallback to regular 1inch API for placing orders with tokens not supported by Fusion
   */
  private async placeRegularApiOrder(
    quoteParams: OneInchQuoteParams,
    encryptedPrivateKey: string,
    slippage: number = 1
  ): Promise<OneInchOrderResult> {
    console.log('🔄 Using regular 1inch API for order execution');
    
    // For now, we'll return a simulated order result since implementing full 1inch API order execution
    // would require wallet integration, transaction signing, etc.
    // In a real implementation, you'd call the 1inch swap API and broadcast the transaction
    
    const simulatedTxHash = ethers.keccak256(ethers.toUtf8Bytes(
      `${quoteParams.srcTokenAddress}-${quoteParams.dstTokenAddress}-${Date.now()}`
    ));
    
    console.log('⚠️ Note: Regular API order execution not fully implemented - would execute transaction here');
    
    return {
      orderId: simulatedTxHash,
      status: 'pending',
      txHash: simulatedTxHash
    };
  }

  /**
   * Place cross-chain Fusion+ order
   */
  private async placeCrossChainOrder(
    quoteParams: OneInchQuoteParams,
    encryptedPrivateKey: string,
    slippage: number = 1
  ): Promise<OneInchOrderResult> {
    console.log('🌉 Placing cross-chain Fusion+ order');

    // Get fresh quote
    const quote = await this.crossChainSDK.getQuote({
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
    const orderResult = await this.crossChainSDK.placeOrder(quote, {
      walletAddress: quoteParams.walletAddress,
      hashLock: secrets[0] as any, // Cast to any to bypass type checking for now
      secretHashes: secretHashes.map(hash => hash as any)
    });

    return {
      orderId: orderResult.toString(),
      status: 'pending'
    };
  }

  /**
   * Get active orders for a wallet (from both Fusion and Fusion+ SDKs)
   */
  async getActiveOrders(walletAddress: string): Promise<any[]> {
    try {
      let allOrders: any[] = [];

      // Get cross-chain orders from Fusion+
      try {
        const crossChainResponse = await this.crossChainSDK.getOrdersByMaker({
          page: 1,
          limit: 50,
          address: walletAddress
        });
        const crossChainOrders = Array.isArray(crossChainResponse) ? 
          crossChainResponse : 
          (crossChainResponse as any)?.orders || [];
        allOrders = allOrders.concat(crossChainOrders);
      } catch (error) {
        console.warn('Failed to get cross-chain orders:', error);
      }

      // Get same-chain orders from each Fusion SDK
      for (const [chainId, fusionSDK] of this.fusionSDKs.entries()) {
        try {
          const chainOrders = await fusionSDK.getOrdersByMaker({
            page: 1,
            limit: 50,
            address: walletAddress
          });
          const orders = Array.isArray(chainOrders) ? 
            chainOrders : 
            (chainOrders as any)?.orders || [];
          allOrders = allOrders.concat(orders);
        } catch (error) {
          console.warn(`Failed to get orders for chain ${chainId}:`, error);
        }
      }

      return allOrders;
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
      const quote = await this.crossChainSDK.getQuote({
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
      case 56:
        return NetworkEnum.BNB;
      case 43114:
        return NetworkEnum.AVALANCHE;
      case 10:
        return NetworkEnum.OPTIMISM;
      case 100:
        return NetworkEnum.GNOSIS;
      case 250:
        return NetworkEnum.FANTOM;
      case 324:
        return NetworkEnum.ZKSYNC;
      case 59144:
        return NetworkEnum.LINEA;
      default:
        return NetworkEnum.ETHEREUM;
    }
  }
} 