import { SDK, NetworkEnum as OneInchNetworkEnum, PrivateKeyProviderConnector } from "@1inch/cross-chain-sdk";
import { FusionSDK, NetworkEnum as FusionNetworkEnum } from "@1inch/fusion-sdk";
import { ethers } from 'ethers';
import { SwapQuote, OrderParams, NetworkEnum, IOneInchService, OneInchQuoteParams, OneInchOrderResult } from '../types';
import { WalletService } from './WalletService';
import { CHAIN_NAMES } from '../config/tokens';
import axios from 'axios';

export class OneInchService implements IOneInchService {
  private crossChainSDK: SDK;
  private fusionSDKs: Map<number, FusionSDK> = new Map();
  private walletService: WalletService;
  protected apiKey: string;

  constructor(apiUrl: string, authKey: string, walletService: WalletService) {
    // Note: We'll initialize the SDK without blockchain provider for quotes
    // and create a new instance with provider when needed for order submission
    this.crossChainSDK = new SDK({
      url: 'https://api.1inch.dev/fusion-plus',
      authKey: authKey
      // blockchainProvider will be set dynamically when needed
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
      { chainId: 10, fusionNetwork: 10 }, // Optimism
      { chainId: 100, fusionNetwork: 100 }, // Gnosis
      { chainId: 250, fusionNetwork: 250 }, // Fantom
      { chainId: 324, fusionNetwork: 324 }, // zkSync
      { chainId: 59144, fusionNetwork: 59144 } // Linea
    ];
  
    for (const { chainId, fusionNetwork } of networkMappings) {
      try {
        const fusionSDK = new FusionSDK({
          url: 'https://api.1inch.dev/fusion',
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
   * Get same-chain quote using direct API calls through localhost proxy
   */
  private async getSameChainQuote(params: OneInchQuoteParams): Promise<SwapQuote> {
    try {
      console.log('💱 Getting same-chain quote via localhost proxy');
      
      const chainId = params.srcChainId;
      const proxyUrl = 'http://localhost:3013';
      const apiUrl = `https://api.1inch.dev/fusion/quoter/v1.0/${chainId}/quote/receive`;
      const url = `${proxyUrl}/?url=${encodeURIComponent(apiUrl)}`;

      const headers: Record<string, string> = {
        'accept': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      };

      try {
        const response = await axios.get(url, {
          headers,
          params: {
            fromTokenAddress: params.srcTokenAddress,
            toTokenAddress: params.dstTokenAddress,
            amount: params.amount,
            walletAddress: params.walletAddress
          }
        });

        const data = response.data;
        
        // Get output amount from Fusion quote
        let outputAmount = "0";
        
        // Extract the output amount from fusion quote response
        if (data && typeof data === 'object') {
          if (data.toAmount) {
            outputAmount = data.toAmount.toString();
          } else if (data.dstAmount) {
            outputAmount = data.dstAmount.toString();
          } else if (data.toTokenAmount) {
            outputAmount = data.toTokenAmount.toString();
          } else {
            console.log('Fusion quote structure:', Object.keys(data));
            outputAmount = "1000000000000000000";
          }
        }
        
        console.log('✅ Fusion quote successful via proxy');
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
    const proxyUrl = 'http://localhost:3013';
    const url = `${proxyUrl}/?url=https://api.1inch.dev/swap/v6.0/${chainId}/quote`;
    
    const headers: Record<string, string> = {
      'accept': 'application/json',
      'Authorization': `Bearer ${this.apiKey}` // Include auth header for localhost proxy
    };
    
    const response = await axios.get(url, {
      headers,
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
   * Get cross-chain quote using direct API calls through localhost proxy - FIXED VERSION
   */
  private async getCrossChainQuote(params: OneInchQuoteParams): Promise<SwapQuote> {
    try {
      console.log('🌉 Getting cross-chain quote via localhost proxy');
      
      // Build query parameters for GET request
      const queryParams = new URLSearchParams({
        srcChain: params.srcChainId.toString(),
        dstChain: params.dstChainId.toString(),
        srcTokenAddress: params.srcTokenAddress,
        dstTokenAddress: params.dstTokenAddress,
        amount: params.amount,
        walletAddress: params.walletAddress,
        enableEstimate: 'true',
        source: 'sdk'
      });

      const proxyUrl = 'http://localhost:3013';
      const apiUrl = `https://api.1inch.dev/fusion-plus/quoter/v1.0/quote/receive?${queryParams.toString()}`;
      const url = `${proxyUrl}/?url=${encodeURIComponent(apiUrl)}`;

      const headers: Record<string, string> = {
        'accept': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      };

      console.log('🔍 API request details (GET):', {
        url,
        queryParams: Object.fromEntries(queryParams)
      });

      // Use GET request instead of POST
      const quoteResponse = await axios.get(url, {
        headers
      });

      const data = quoteResponse.data;
      console.log('✅ Cross-chain quote received via proxy');
      
      // Check if the response contains an error
      if (data && typeof data === 'object' && data.error) {
        console.error('🚨 1inch API error:', data);
        throw new Error(`1inch API error: ${data.description || data.error}`);
      }
      
      // Extract output amount from the response
      let outputAmount = "0";
      
      try {
        // For Fusion+ quotes, the structure typically includes presets
        if (data.dstTokenAmount) {
          outputAmount = data.dstTokenAmount.toString();
        } else if (data.presets?.fast?.auctionEndAmount) {
          outputAmount = data.presets.fast.auctionEndAmount.toString();
        } else if (data.presets?.fast?.auctionStartAmount) {
          outputAmount = data.presets.fast.auctionStartAmount.toString();
        } else if (data.auctionEndAmount) {
          outputAmount = data.auctionEndAmount.toString();
        } else if (data.auctionStartAmount) {
          outputAmount = data.auctionStartAmount.toString();
        } else if (data.dstAmount) {
          outputAmount = data.dstAmount.toString();
        } else if (data.toAmount) {
          outputAmount = data.toAmount.toString();
        } else {
          console.log('Response structure:', Object.keys(data));
          outputAmount = "1000000000000000000"; // 1 token as fallback
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
        if (error.message.includes('walletAddress has not provided')) {
          throw new Error('Invalid wallet address parameter. Please check that the wallet address is properly formatted and valid.');
        }
      }

      // Handle HTTP errors
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        if (axiosError.response?.status === 400) {
          const errorData = axiosError.response?.data;
          console.error('🚨 Localhost proxy 400 error:', errorData);
          
          if (typeof errorData === 'string' && errorData.includes('Include `url`')) {
            throw new Error('❌ Proxy configuration error: URL parameter format issue');
          }
          
          if (errorData?.description?.includes('walletAddress')) {
            throw new Error('❌ Invalid wallet address parameter. Please check that the wallet address is properly formatted and valid.');
          }
          
          throw new Error(`Invalid parameters: ${errorData?.description || 'Bad request'}`);
        }
        if (axiosError.response?.status === 404) {
          throw new Error(`❌ Cross-chain route not available: ${CHAIN_NAMES[params.srcChainId] || 'source chain'} → ${CHAIN_NAMES[params.dstChainId] || 'target chain'}\n\n1inch Fusion+ doesn't support this token pair for cross-chain swaps.`);
        }
        if (axiosError.response?.status === 403) {
          throw new Error('Authentication failed. Check your API key configuration.');
        }
        if (axiosError.response?.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
        }
      }
      
      throw new Error(`Failed to get cross-chain quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Place an order based on quote parameters
   */
  async placeOrder(quoteParams: OneInchQuoteParams, encryptedPrivateKey: string): Promise<OneInchOrderResult> {
    console.log('📋 Placing order...');
    console.log('📊 Order details:');
    console.log(`  From Chain: ${quoteParams.srcChainId}`);
    console.log(`  To Chain: ${quoteParams.dstChainId}`);
    console.log(`  From Token: ${quoteParams.srcTokenAddress}`);
    console.log(`  To Token: ${quoteParams.dstTokenAddress}`);
    console.log(`  Amount: ${quoteParams.amount}`);
    console.log(`  Wallet: ${quoteParams.walletAddress}`);

    try {
      // Determine if this is a cross-chain or same-chain order
      if (quoteParams.srcChainId !== quoteParams.dstChainId) {
        console.log('🌉 Cross-chain order detected, using Fusion+ SDK');
        return await this.placeCrossChainOrder(quoteParams, encryptedPrivateKey);
      } else {
        console.log('🔄 Same-chain order detected, using Fusion mode');
        return await this.placeSameChainOrder(quoteParams, encryptedPrivateKey);
      }
    } catch (error) {
      console.error('❌ Error placing order:', error);
      
      // Re-throw with more context
      if (error instanceof Error) {
        throw new Error(`Order placement failed: ${error.message}`);
      }
      throw new Error('Order placement failed: Unknown error');
    }
  }

  /**
   * Place same-chain Fusion order using direct API calls through localhost proxy
   */
  private async placeSameChainOrder(
    quoteParams: OneInchQuoteParams,
    encryptedPrivateKey: string,
    slippage: number = 1
  ): Promise<OneInchOrderResult> {
    const chainId = quoteParams.srcChainId;
    
    try {
      console.log('🔥 Placing same-chain Fusion order via localhost proxy');

      // Get fresh quote first via proxy
      const proxyUrl = 'http://localhost:3013';
      const apiUrl = `https://api.1inch.dev/fusion/quoter/v1.0/${chainId}/quote/receive`;
      const url = `${proxyUrl}/?url=${encodeURIComponent(apiUrl)}`;

      const headers: Record<string, string> = {
        'accept': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      };

      const quoteResponse = await axios.get(url, {
        headers,
        params: {
          fromTokenAddress: quoteParams.srcTokenAddress,
          toTokenAddress: quoteParams.dstTokenAddress,
          amount: quoteParams.amount,
          walletAddress: quoteParams.walletAddress
        }
      });

      console.log('✅ Fresh same-chain quote received for order placement');

      // For now, return a simulated order result
      // In a real implementation, you would:
      // 1. Extract the quote data
      // 2. Call the Fusion order placement API via proxy
      // 3. Return the actual order ID
      
      const simulatedOrderId = ethers.keccak256(ethers.toUtf8Bytes(
        `${quoteParams.srcTokenAddress}-${quoteParams.dstTokenAddress}-${Date.now()}`
      ));
      
      console.log('⚠️ Note: Same-chain order placement not fully implemented - would place order here');

      return {
        orderId: simulatedOrderId,
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
   * Place cross-chain Fusion+ order with proper signature generation
   */
  private async placeCrossChainOrder(
    quoteParams: OneInchQuoteParams,
    encryptedPrivateKey: string,
    slippage: number = 1
  ): Promise<OneInchOrderResult> {
    console.log('🌉 Placing cross-chain Fusion+ order via SDK + Manual Submission');

    try {
      // Step 1: Decrypt the private key
      const privateKey = this.walletService.decrypt(encryptedPrivateKey);
      const wallet = new ethers.Wallet(privateKey);
      
      console.log(`📝 Using wallet address: ${wallet.address}`);

      // Step 2: Create SDK instance with blockchain provider
      console.log('🔧 Creating SDK instance with blockchain provider...');
      const sdkWithProvider = this.createSDKWithProvider(privateKey, quoteParams.srcChainId);
    
      // Step 3: Get quote using the SDK with provider
      console.log('🔍 Getting fresh quote for order placement via SDK...');

      const sdkQuote = await sdkWithProvider.getQuote({
        srcChainId: quoteParams.srcChainId,
        dstChainId: quoteParams.dstChainId,
        srcTokenAddress: quoteParams.srcTokenAddress,
        dstTokenAddress: quoteParams.dstTokenAddress,
        amount: quoteParams.amount,
        walletAddress: quoteParams.walletAddress,
        enableEstimate: true
      });

      console.log('✅ SDK Quote received, preparing order...');

      // Step 4: Get preset information
      const preset = sdkQuote.getPreset();
      const secretsCount = preset.secretsCount || 1;
      
      console.log(`🔐 Generating ${secretsCount} secrets for hash lock...`);
      
      // Step 5: Generate secrets and create hash lock
      const secrets = Array.from({ length: secretsCount }).map(() => this.getRandomBytes32());
      
      // Import HashLock and PresetEnum from the SDK
      const { HashLock, PresetEnum } = await import('@1inch/cross-chain-sdk');
      
      // Create hash lock based on the number of secrets
      let hashLock;
      if (secretsCount === 1) {
        hashLock = HashLock.forSingleFill(secrets[0]);
      } else {
        // For multiple fills, create merkle leaves
        const merkleLeaves = HashLock.getMerkleLeaves(secrets);
        hashLock = HashLock.forMultipleFills(merkleLeaves);
      }
      
      // Create secret hashes
      const secretHashes = secrets.map((secret) => HashLock.hashSecret(secret));

      console.log('🎯 Hash lock created, creating order...');

      // Step 6: Create the order using the SDK
      const orderParams = {
        walletAddress: quoteParams.walletAddress,
        hashLock: hashLock,
        preset: PresetEnum.fast,
        source: 'sdk',
        secretHashes: secretHashes
      };

      const { hash, quoteId, order } = await sdkWithProvider.createOrder(sdkQuote, orderParams);
    
    console.log('📋 Order created with hash:', hash);

      // Step 7: Try multiple signing approaches
      console.log('✍️ Generating order signature...');
      let signature: string;
      
      try {
        // First, try SDK built-in signing
        signature = await this.signOrderWithSDK(order, wallet);
        console.log('✅ Order signed using SDK method');
      } catch (sdkSignError) {
        console.log('⚠️ SDK signing failed, trying manual EIP-712 signing...');
        // Fallback to manual signing
        signature = await this.signOrder(order, wallet, quoteParams.srcChainId);
        console.log('✅ Order signed using manual method');
      }
      
      // Add signature to the order
      const signedOrder = {
        ...order,
        signature: signature
      };

      console.log('✅ Order signed successfully');

      // Step 8: Submit the order manually through proxy
      console.log('📤 Submitting signed order to network via proxy...');
      
      const orderSubmissionResult = await this.submitOrderViaProxy(
        signedOrder,
        quoteId,
        secretHashes,
        quoteParams.srcChainId
      );
    
      console.log('✅ Order submitted successfully via proxy!', { hash });

      // Step 9: Start the secret sharing process
      this.startSecretSharingProcess(hash, secrets, sdkWithProvider).catch(error => {
        console.error('❌ Error in secret sharing process:', error);
      });

      const result: OneInchOrderResult = {
        orderId: hash,
        status: 'submitted'
      };

      // Store secrets as additional properties
      (result as any).secrets = secrets;
      (result as any).secretHashes = secretHashes.map(h => h.toString());

      return result;

    } catch (error) {
      console.error('❌ Error placing cross-chain order:', error);
      
      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes('insufficient balance')) {
          throw new Error('Insufficient balance for cross-chain swap. Please check your wallet balance.');
        }
        if (error.message.includes('insufficient allowance')) {
          throw new Error('Insufficient token allowance. Please approve the token for the 1inch Limit Order Protocol contract.');
        }
        if (error.message.includes('token not supported')) {
          throw new Error('Token not supported for cross-chain swaps on 1inch Fusion+.');
        }
        if (error.message.includes('chain not supported')) {
          throw new Error('Chain combination not supported for cross-chain swaps.');
        }
        if (error.message.includes('amount too small')) {
          throw new Error('Minimum swap amount not met. Try with a larger amount.');
        }
        if (error.message.includes('blockchainProvider has not set')) {
          throw new Error('Blockchain provider configuration error. Unable to sign transactions.');
        }
      }
      
      throw new Error(`Failed to place cross-chain order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async submitOrderViaProxy(
    order: any,
    quoteId: string,
    secretHashes: any[],
    srcChainId: number
  ): Promise<any> {
    try {
      console.log('🔄 Submitting signed order via localhost proxy...');
      
      // Extract and properly serialize the order data
      const orderData = this.serializeOrderForSubmission(order);
      
      // Extract the actual extension data from the order
      const extension = this.extractAndSerializeExtension(order);
      
      // Create the submission payload
      const submitPayload = {
        order: orderData,
        quoteId: quoteId,
        secretHashes: secretHashes.map(h => h.toString()),
        signature: order.signature,
        extension: extension
      };

      // Use custom serializer to handle BigInt values
      const serializedPayload = this.serializeWithBigInt(submitPayload);
      
      console.log('📤 Serialized order submission payload:', serializedPayload);

      // Submit via proxy
      const proxyUrl = 'http://localhost:3013';
      const submitApiUrl = 'https://api.1inch.dev/fusion-plus/relayer/v1.0/submit';
      const url = `${proxyUrl}/?url=${encodeURIComponent(submitApiUrl)}`;

      const headers = {
        'accept': 'application/json',
        'content-type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      };

      // Send the pre-serialized JSON string
      const response = await axios.post(url, serializedPayload, { 
        headers,
        transformRequest: [(data) => data] // Prevent axios from re-serializing
      });
      
      console.log('✅ Order submitted successfully via proxy:', response.data);
      return response.data;

    } catch (error) {
      console.error('❌ Error submitting order via proxy:', error);
      
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        console.error('📋 Full error response:', axiosError.response?.data);
        console.error('📋 Status:', axiosError.response?.status);
        console.error('📋 Headers:', axiosError.response?.headers);
      }
      
      throw error;
    }
  }

  /**
   * Serialize order data for submission, handling BigInt values
   */
  private serializeOrderForSubmission(order: any): any {
    // Extract the inner order data
    const innerOrder = order.inner?.inner || order.inner || order;
    
    // Create a clean order object with proper field names
    const cleanOrder = {
      salt: this.toBigIntString(innerOrder._salt || innerOrder.salt),
      maker: innerOrder.maker?.val || innerOrder.maker,
      receiver: innerOrder.receiver?.val || innerOrder.receiver || '0x0000000000000000000000000000000000000000',
      makerAsset: innerOrder.makerAsset?.val || innerOrder.makerAsset,
      takerAsset: innerOrder.takerAsset?.val || innerOrder.takerAsset,
      makingAmount: this.toBigIntString(innerOrder.makingAmount),
      takingAmount: this.toBigIntString(innerOrder.takingAmount),
      makerTraits: this.toBigIntString(innerOrder.makerTraits?.value?.value || innerOrder.makerTraits?.value || innerOrder.makerTraits)
    };
    
    return cleanOrder;
  }

  /**
   * Extract and serialize extension data
   */
  private extractAndSerializeExtension(order: any): string {
    try {
      // The extension is likely in the order's extension field
      const extensionObj = order.inner?.inner?.extension || order.inner?.extension || order.extension;
      
      if (!extensionObj) {
        console.warn('⚠️ No extension found in order');
        return '0x';
      }
      
      // If it's already a hex string, return it
      if (typeof extensionObj === 'string' && extensionObj.startsWith('0x')) {
        return extensionObj;
      }
      
      // If it's an Extension object, we need to encode it
      if (extensionObj && typeof extensionObj === 'object') {
        // The extension needs to be ABI encoded. For now, we'll concatenate the hex values
        const parts = [
          extensionObj.makerAssetSuffix || '0x',
          extensionObj.takerAssetSuffix || '0x',
          extensionObj.makingAmountData || '0x',
          extensionObj.takingAmountData || '0x',
          extensionObj.predicate || '0x',
          extensionObj.makerPermit || '0x',
          extensionObj.preInteraction || '0x',
          extensionObj.postInteraction || '0x',
          extensionObj.customData || '0x'
        ];
        
        // Remove '0x' prefix from each part and concatenate
        const encoded = '0x' + parts.map(p => p.slice(2)).join('');
        console.log('📋 Encoded extension:', encoded);
        return encoded;
      }
      
      return '0x';
    } catch (error) {
      console.error('❌ Error extracting extension:', error);
      return '0x';
    }
  }

  /**
   * Convert BigInt to string
   */
  private toBigIntString(value: any): string {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (value && typeof value === 'object' && 'toString' in value) {
      return value.toString();
    }
    return String(value);
  }

  /**
   * Custom JSON serializer that handles BigInt values
   */
  private serializeWithBigInt(obj: any): string {
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      if (value && typeof value === 'object' && 'value' in value && typeof value.value === 'bigint') {
        return value.value.toString();
      }
      return value;
    });
  }

  /**
   * Sign the order using EIP-712 typed data signing - FIXED VERSION
   */
  private async signOrder(order: any, wallet: ethers.Wallet, chainId: number): Promise<string> {
    try {
      console.log('🔍 Checking if order has getTypedData method...');
      
      // First, try to use the SDK's built-in signing method if available
      if (typeof order.getTypedData === 'function') {
        console.log('✅ Using order.getTypedData() method');
        const typedData = order.getTypedData();
        
        // Remove EIP712Domain from types to fix ethers v6 compatibility
        const types = { ...typedData.types };
        delete types.EIP712Domain;
        
        // Sign using the SDK's typed data
        const signature = await wallet.signTypedData(
          typedData.domain,
          types,
          typedData.message
        );
        
        console.log('📝 Order signature generated via SDK method:', signature);
        return signature;
      }
      
      console.log('⚠️ Order does not have getTypedData method, constructing manually...');
      
      // Extract order data for signing
      const orderData = this.extractOrderDataForSigning(order);
      console.log('📋 Order data extracted:', orderData);
      
      // Construct the EIP-712 typed data manually
      const domain = {
        name: '1inch Fusion+',
        version: '1',
        chainId: chainId,
        verifyingContract: '0xa7bcb4eac8964306f9e3764f67db6a7af6ddf99a' // Settlement contract
      };
      
      // Define the Order type structure (without EIP712Domain)
      const types = {
        Order: [
          { name: 'salt', type: 'uint256' },
          { name: 'maker', type: 'address' },
          { name: 'receiver', type: 'address' },
          { name: 'makerAsset', type: 'address' },
          { name: 'takerAsset', type: 'address' },
          { name: 'makingAmount', type: 'uint256' },
          { name: 'takingAmount', type: 'uint256' },
          { name: 'makerTraits', type: 'uint256' }
        ]
      };
      
      console.log('📝 Signing with domain:', domain);
      console.log('📝 Signing with types:', types);
      console.log('📝 Signing with message:', orderData);
      
      // Sign the typed data
      const signature = await wallet.signTypedData(domain, types, orderData);
      
      console.log('📝 Order signature generated manually:', signature);
      return signature;

    } catch (error) {
      console.error('❌ Error signing order:', error);
      
      // If manual signing fails, try a simplified approach
      console.log('🔄 Attempting simplified signing approach...');
      
      try {
        // Use the SDK's order hash and sign it directly
        const orderHash = this.getOrderHash(order, chainId);
        const signature = await wallet.signMessage(ethers.getBytes(orderHash));
        
        console.log('📝 Order signature generated via message signing:', signature);
        return signature;
        
      } catch (fallbackError) {
        console.error('❌ Fallback signing also failed:', fallbackError);
        throw new Error(`Failed to sign order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Alternative: Try to use the SDK's built-in signing if available - IMPROVED
   */
  private async signOrderWithSDK(order: any, wallet: ethers.Wallet): Promise<string> {
    try {
      // Check various methods that might exist
      if (typeof order.sign === 'function') {
        console.log('✅ Using order.sign() method');
        return await order.sign(wallet.privateKey);
      }
      
      if (typeof order.signTypedData === 'function') {
        console.log('✅ Using order.signTypedData() method');
        return await order.signTypedData(wallet);
      }
      
      if (typeof order.getSignature === 'function') {
        console.log('✅ Using order.getSignature() method');
        return await order.getSignature(wallet);
      }
      
      throw new Error('No built-in signing method available');
      
    } catch (error) {
      console.error('❌ SDK signing not available:', error);
      throw error;
    }
  }

  /**
   * Get order hash for fallback signing
   */
  private getOrderHash(order: any, chainId: number): string {
    try {
      // If the order has a hash method, use it
      if (typeof order.hash === 'function') {
        return order.hash();
      }
      
      // If the order has a getTypedDataHash method, use it
      if (typeof order.getTypedDataHash === 'function') {
        return order.getTypedDataHash();
      }
      
      // Otherwise, create a simple hash from order data
      const orderData = this.extractOrderDataForSigning(order);
      const dataString = JSON.stringify(orderData);
      return ethers.keccak256(ethers.toUtf8Bytes(dataString));
      
    } catch (error) {
      console.error('❌ Error getting order hash:', error);
      // Fallback to a hash of the entire order object
      return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(order)));
    }
  }

  /**
   * Extract order data for EIP-712 signing - IMPROVED VERSION
   */
  private extractOrderDataForSigning(order: any): any {
    try {
      // Extract the core order data for signing
      const orderData = {
        salt: order.inner?.inner?._salt || order._salt || order.salt || "0",
        maker: order.inner?.inner?.maker?.val || order.maker?.val || order.maker || ethers.ZeroAddress,
        receiver: order.inner?.inner?.receiver?.val || order.receiver?.val || order.receiver || ethers.ZeroAddress,
        makerAsset: order.inner?.inner?.makerAsset?.val || order.makerAsset?.val || order.makerAsset || ethers.ZeroAddress,
        takerAsset: order.inner?.inner?.takerAsset?.val || order.takerAsset?.val || order.takerAsset || ethers.ZeroAddress,
        makingAmount: order.inner?.inner?.makingAmount || order.makingAmount || "0",
        takingAmount: order.inner?.inner?.takingAmount || order.takingAmount || "0",
        makerTraits: order.inner?.inner?.makerTraits?.value?.value || order.makerTraits?.value || order.makerTraits || "0"
      };

      // Ensure all numeric values are strings
      orderData.salt = orderData.salt.toString();
      orderData.makingAmount = orderData.makingAmount.toString();
      orderData.takingAmount = orderData.takingAmount.toString();
      orderData.makerTraits = orderData.makerTraits.toString();

      console.log('📋 Extracted and formatted order data for signing:', orderData);
      return orderData;

    } catch (error) {
      console.error('❌ Error extracting order data:', error);
      throw error;
    }
  }

  /**
   * Format order for 1inch API submission
   */
  private formatOrderForAPI(order: any): any {
    try {
      // Extract the core order fields that the API expects
      const apiOrder = {
        maker: order.inner?.inner?.maker?.val || order.maker?.val || order.maker,
        makerAsset: order.inner?.inner?.makerAsset?.val || order.makerAsset?.val || order.makerAsset,
        takerAsset: order.inner?.inner?.takerAsset?.val || order.takerAsset?.val || order.takerAsset,
        makingAmount: order.inner?.inner?.makingAmount || order.makingAmount,
        takingAmount: order.inner?.inner?.takingAmount || order.takingAmount,
        salt: order.inner?.inner?._salt || order._salt || order.salt,
        makerTraits: order.inner?.inner?.makerTraits?.value?.value || order.makerTraits?.value || order.makerTraits,
        receiver: order.inner?.inner?.receiver?.val || order.receiver?.val || order.receiver || '0x0000000000000000000000000000000000000000'
      };

      console.log('📋 Formatted order for API:', apiOrder);
      return apiOrder;

    } catch (error) {
      console.error('❌ Error formatting order for API:', error);
      throw error;
    }
  }

  /**
   * Extract extension data from order
   */
  private extractExtensionFromOrder(order: any): string {
    try {
      // Try to extract extension from various possible locations
      const extension = order.inner?.inner?.extension || 
                       order.extension || 
                       order.inner?.fusionExtension || 
                       '0x';

      // If extension is an object, we need to serialize it properly
      if (typeof extension === 'object' && extension !== null) {
        // This would need proper encoding based on the 1inch extension format
        return '0x'; // For now, return empty extension
      }

      return extension || '0x';

    } catch (error) {
      console.error('❌ Error extracting extension:', error);
      return '0x';
    }
  }

  /**
   * Background process to share secrets as escrows are deployed - UPDATED TO USE PROXY
   */
  private async startSecretSharingProcess(orderHash: string, secrets: string[], sdk: SDK): Promise<void> {
    console.log('🔄 Starting secret sharing process for order:', orderHash);
    
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        // Check for ready-to-accept secret fills via proxy instead of SDK
        let secretsToShare;
        try {
          secretsToShare = await this.getReadyToAcceptSecretFillsViaProxy(orderHash);
        } catch (secretError) {
          console.log('⚠️ Could not check for secret fills, continuing...');
          secretsToShare = { fills: [] };
        }
        
        if (secretsToShare.fills && secretsToShare.fills.length > 0) {
          console.log(`🔓 Found ${secretsToShare.fills.length} fills ready for secrets`);
          
          // Submit secrets for each ready fill via proxy
          for (const { idx } of secretsToShare.fills) {
            try {
              await this.submitSecretViaProxy(orderHash, secrets[idx]);
              console.log(`✅ Shared secret for fill index ${idx}`);
            } catch (secretError) {
              console.error(`❌ Failed to share secret for fill ${idx}:`, secretError);
            }
          }
        }
        
        // Check order status via proxy with enhanced handling
        const statusResult = await this.getOrderStatusViaProxy(orderHash);
        const status = statusResult.status;
        
        console.log(`📊 Order ${orderHash} status: ${status}`);
        
        // Check for completion statuses (more flexible matching)
        const completedStatuses = ['executed', 'completed', 'filled', 'expired', 'cancelled', 'refunded'];
        const isCompleted = completedStatuses.some(s => 
          status.toLowerCase().includes(s.toLowerCase())
        );
        
        if (isCompleted) {
          console.log('🏁 Order completed with status:', status);
          break;
        }
        
        // Log progress every 10 attempts (50 seconds)
        if (attempts % 10 === 0) {
          console.log(`🕒 Secret sharing progress: ${attempts}/${maxAttempts} attempts, status: ${status}`);
        }
        
        // Wait 5 seconds before next check
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
        
      } catch (error) {
        console.error('❌ Error in secret sharing iteration:', error);
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    if (attempts >= maxAttempts) {
      console.warn('⚠️ Secret sharing process timed out for order:', orderHash);
      console.log('ℹ️ The order may still complete - check the 1inch dashboard for updates');
    }
  }

  /**
   * Get ready-to-accept secret fills via proxy
   */
  private async getReadyToAcceptSecretFillsViaProxy(orderHash: string): Promise<any> {
    try {
      const proxyUrl = 'http://localhost:3013';
      const apiUrl = `https://api.1inch.dev/fusion-plus/orders/v1.0/order/ready-to-accept-secret-fills/${orderHash}`;
      const url = `${proxyUrl}/?url=${encodeURIComponent(apiUrl)}`;

      const headers = {
        'accept': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      };

      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error) {
      console.error('❌ Error getting ready-to-accept secret fills via proxy:', error);
      throw error;
    }
  }

  /**
   * Submit secret via proxy
   */
  private async submitSecretViaProxy(orderHash: string, secret: string): Promise<any> {
    try {
      const proxyUrl = 'http://localhost:3013';
      const apiUrl = `https://api.1inch.dev/fusion-plus/orders/v1.0/order/submit-secret`;
      const url = `${proxyUrl}/?url=${encodeURIComponent(apiUrl)}`;

      const headers = {
        'accept': 'application/json',
        'content-type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      };

      const payload = {
        orderHash: orderHash,
        secret: secret
      };

      const response = await axios.post(url, payload, { headers });
      return response.data;
    } catch (error) {
      console.error('❌ Error submitting secret via proxy:', error);
      throw error;
    }
  }

  /**
   * Get order status via proxy - IMPROVED VERSION
   */
  private async getOrderStatusViaProxy(orderHash: string): Promise<any> {
    // Try multiple status endpoints in order of preference
    const statusEndpoints = [
      `https://api.1inch.dev/fusion-plus/orders/v1.0/order/status/${orderHash}`,
      `https://api.1inch.dev/fusion-plus/orders/v1.0/order/${orderHash}`,
      `https://api.1inch.dev/fusion-plus/orders/v1.0/orders/${orderHash}`,
      `https://api.1inch.dev/fusion-plus/relayer/v1.0/order/${orderHash}/status`,
      `https://api.1inch.dev/fusion-plus/relayer/v1.0/orders/${orderHash}`
    ];
  
    for (const apiUrl of statusEndpoints) {
      try {
        console.log(`🔍 Trying status endpoint: ${apiUrl}`);
        
        const proxyUrl = 'http://localhost:3013';
        const proxyParams = new URLSearchParams({
          url: apiUrl
        });
        const fullProxyUrl = `${proxyUrl}?${proxyParams.toString()}`;
  
        const headers = {
          'accept': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        };
  
        const response = await axios.get(fullProxyUrl, { headers });
        
        console.log(`✅ Status response from ${apiUrl}:`, response.data);
        
        // Extract status from various possible response formats
        let status = 'pending';
        
        if (response.data) {
          if (typeof response.data === 'string') {
            status = response.data;
          } else if (response.data.status) {
            status = response.data.status;
          } else if (response.data.state) {
            status = response.data.state;
          } else if (response.data.orderStatus) {
            status = response.data.orderStatus;
          } else if (response.data.order?.status) {
            status = response.data.order.status;
          } else if (response.data.data?.status) {
            status = response.data.data.status;
          } else {
            // If we get a response but no clear status, log the structure
            console.log('📋 Status response structure:', Object.keys(response.data));
            status = 'submitted'; // Assume submitted if we get any response
          }
        }
        
        return { status, raw: response.data };
        
      } catch (error: unknown) {
        if (error instanceof Error && 'response' in error) {
          const axiosError = error as { response?: { status: number; data: any } };
          console.log(`❌ Status endpoint ${apiUrl} failed:`, axiosError.response?.status, axiosError.response?.data);
        } else {
          console.log(`❌ Status endpoint ${apiUrl} failed:`, error);
        }
        continue; // Try next endpoint
      }
    }
    // If all endpoints fail, return pending
    console.warn('⚠️ All status endpoints failed, returning pending');
    return { status: 'pending' };
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
   * Generate random 32 bytes for secrets
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

  /**
   * Create SDK instance with blockchain provider for order creation (submission handled manually via proxy)
   */
  private createSDKWithProvider(privateKey: string, chainId: number): SDK {
    // Use the source chain's RPC provider
    const provider = new ethers.JsonRpcProvider(this.getRpcUrl(chainId));
    
    // Create Web3-like connector for the SDK
    const web3Like = {
      eth: {
        call: async (transactionConfig: any) => {
          try {
            return await provider.call(transactionConfig);
          } catch (error) {
            console.error('Error in provider call:', error);
            throw error;
          }
        }
      },
      extend: () => {
        // Required by the interface but can be empty
      }
    };
    
    try {
      // Create blockchain provider connector
      const blockchainProvider = new PrivateKeyProviderConnector(privateKey, web3Like);
      
      // Return new SDK instance with blockchain provider
      const sdk = new SDK({
        url: 'https://api.1inch.dev/fusion-plus',
        authKey: this.apiKey,
        blockchainProvider: blockchainProvider
      });
      
      console.log(`✅ SDK with blockchain provider created for chain ${chainId}`);
      return sdk;
      
    } catch (error) {
      console.error('❌ Error creating SDK with provider:', error);
      throw new Error(`Failed to create SDK with blockchain provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get RPC URL for a given chain ID - UPDATED WITH MORE RELIABLE ENDPOINTS
   */
  private getRpcUrl(chainId: number): string {
    const rpcUrls: Record<number, string> = {
      1: 'https://eth.llamarpc.com',
      8453: 'https://base.llamarpc.com', 
      42161: 'https://arbitrum.llamarpc.com',
      137: 'https://polygon.llamarpc.com',
      10: 'https://optimism.llamarpc.com',
      100: 'https://rpc.gnosischain.com',
      250: 'https://rpc.ftm.tools',
      324: 'https://mainnet.era.zksync.io',
      59144: 'https://rpc.linea.build'
    };
    
    const rpcUrl = rpcUrls[chainId] || rpcUrls[1]; // Default to Ethereum
    console.log(`🔗 Using RPC URL for chain ${chainId}: ${rpcUrl}`);
    return rpcUrl;
  }
} 