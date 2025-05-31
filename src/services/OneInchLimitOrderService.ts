import { OneInchService } from './OneInchService';
import { PythService } from './PythService';
import { WalletService } from './WalletService';
import { 
  LimitOrderCreationParams, 
  LimitOrderResult, 
  IOneInchServiceWithLimitOrders,
  NetworkEnum
} from '../types';
import { ethers } from 'ethers';

export class OneInchLimitOrderService extends OneInchService implements IOneInchServiceWithLimitOrders {
  private pythService: PythService;
  
  // Common USDC addresses for different chains
  private readonly USDC_ADDRESSES = {
    [NetworkEnum.ETHEREUM]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    [NetworkEnum.BASE]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    [NetworkEnum.ARBITRUM]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    [NetworkEnum.POLYGON]: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
  };

  // 1inch Limit Order Protocol v4 contract addresses
  private readonly LIMIT_ORDER_PROTOCOL_ADDRESSES: Record<number, string> = {
    [NetworkEnum.ETHEREUM]: '0x111111125421ca6dc452d289314280a0f8842a65',
    [NetworkEnum.BASE]: '0x111111125421ca6dc452d289314280a0f8842a65',
    [NetworkEnum.ARBITRUM]: '0x111111125421ca6dc452d289314280a0f8842a65',
    [NetworkEnum.POLYGON]: '0x111111125421ca6dc452d289314280a0f8842a65'
  };

  constructor(
    apiUrl: string, 
    authKey: string, 
    walletService: WalletService,
    pythService?: PythService
  ) {
    super(apiUrl, authKey, walletService);
    this.pythService = pythService || new PythService();
  }

  async createLimitOrder(
    params: LimitOrderCreationParams, 
    encryptedPrivateKey: string
  ): Promise<LimitOrderResult> {
    try {
      console.log(`🎯 Creating ${params.orderType} limit order for ${params.amount} ${params.tokenSymbol}...`);
      
      // Step 1: Get the private key
      const privateKey = await this.getPrivateKey(encryptedPrivateKey);
      if (!privateKey.startsWith('0x')) {
        throw new Error('Private key must start with 0x');
      }

      // Step 2: Get token information
      const token = this.getTokenInfo(params.tokenSymbol, params.chainId);
      if (!token) {
        throw new Error(`Token ${params.tokenSymbol} not found on ${this.getChainName(params.chainId)} network.`);
      }

      // Step 3: Get USDC address for the chain
      const usdcAddress = this.USDC_ADDRESSES[params.chainId as keyof typeof this.USDC_ADDRESSES];
      if (!usdcAddress) {
        throw new Error(`USDC not supported on chain ${params.chainId}`);
      }

      // Step 4: Get EMA price from Pyth
      console.log(`📊 Fetching EMA price for ${params.tokenSymbol}...`);
      const emaPrice = await this.getEmaPrice(params.tokenSymbol, params.useEmaPrice !== false);
      const limitPrice = emaPrice * (params.priceMultiplier || 1.0);
      console.log(`📊 EMA Price: $${emaPrice.toFixed(6)}, Limit Price: $${limitPrice.toFixed(6)} (${(params.priceMultiplier || 1.0)}x)`);

      // Step 5: Calculate order amounts and determine maker/taker assets
      const { makerAsset, takerAsset, makingAmount, takingAmount } = this.calculateOrderAmounts(
        params, 
        limitPrice, 
        usdcAddress, 
        token.address
      );

      // Step 6: Get contract address
      const contractAddress = this.LIMIT_ORDER_PROTOCOL_ADDRESSES[params.chainId];
      if (!contractAddress) {
        throw new Error(`1inch contracts not deployed on chain ${params.chainId}`);
      }

      // Step 7: Create simplified limit order data
      const expiration = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours
      const salt = Date.now().toString();
      
      const limitOrderData = {
        salt: salt,
        maker: params.walletAddress,
        receiver: '0x0000000000000000000000000000000000000000', // Zero address for self
        makerAsset: makerAsset,
        takerAsset: takerAsset,
        makingAmount: makingAmount,
        takingAmount: takingAmount,
        makerTraits: '0', // Basic traits
      };

      // Step 8: Create EIP-712 typed data
      const domain = {
        name: '1inch Limit Order Protocol',
        version: '3',
        chainId: params.chainId,
        verifyingContract: contractAddress,
      };

      const types = {
        Order: [
          { name: 'salt', type: 'uint256' },
          { name: 'maker', type: 'address' },
          { name: 'receiver', type: 'address' },
          { name: 'makerAsset', type: 'address' },
          { name: 'takerAsset', type: 'address' },
          { name: 'makingAmount', type: 'uint256' },
          { name: 'takingAmount', type: 'uint256' },
          { name: 'makerTraits', type: 'uint256' },
        ],
      };

      // Step 9: Sign the order
      const wallet = new ethers.Wallet(privateKey);
      const signature = await wallet.signTypedData(domain, types, limitOrderData);

      // Step 10: Create order hash
      const orderHash = ethers.keccak256(
        ethers.TypedDataEncoder.encode(domain, types, limitOrderData)
      );

      // Step 11: Store order locally
      const orderData = {
        hash: orderHash,
        order: limitOrderData,
        signature: signature,
        chainId: params.chainId,
        walletAddress: params.walletAddress,
        tokenSymbol: params.tokenSymbol,
        orderType: params.orderType,
        amount: params.amount,
        emaPrice: emaPrice,
        limitPrice: limitPrice,
        expiration: expiration,
        createdAt: new Date().toISOString(),
        contractAddress: contractAddress
      };

      this.storeLimitOrder(orderData);

      console.log(`✅ ${params.orderType} limit order created successfully!`);
      console.log(`📝 Order Hash: ${orderHash}`);
      console.log(`💰 ${params.orderType === 'BUY' ? 'Buying' : 'Selling'} ${params.amount} ${params.tokenSymbol} at $${limitPrice.toFixed(6)}`);
      console.log(`⏰ Expires: ${new Date(expiration * 1000).toLocaleString()}`);

      return {
        success: true,
        orderId: orderHash,
        orderHash: orderHash,
        emaPrice: emaPrice,
        limitPrice: limitPrice,
        message: `${params.orderType} order created for ${params.amount} ${params.tokenSymbol} at $${limitPrice.toFixed(6)}`
      };

    } catch (error) {
      console.error('❌ Failed to create limit order:', error);
      return {
        success: false,
        error: `Failed to create limit order: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async getPrivateKey(encryptedPrivateKey: string): Promise<string> {
    // Access the protected walletService from parent class and use the decrypt method
    return (this as any).walletService.decrypt(encryptedPrivateKey);
  }

  private getTokenInfo(tokenSymbol: string, chainId: number) {
    // Import here to avoid circular dependencies
    const { getTokenBySymbol } = require('../config/tokens');
    return getTokenBySymbol(tokenSymbol, chainId);
  }

  private async getEmaPrice(tokenSymbol: string, useEmaPrice: boolean): Promise<number> {
    try {
      if (!useEmaPrice) {
        // Return a mock price if EMA is disabled
        const mockPrices: Record<string, number> = {
          'BTC': 95000,
          'ETH': 3500,
          'USDC': 1.0,
          'USDT': 1.0
        };
        return mockPrices[tokenSymbol.toUpperCase()] || 100;
      }

      if (!this.pythService.isTokenSupported(tokenSymbol)) {
        throw new Error(`Token ${tokenSymbol} not supported by Pyth Network`);
      }

      const price = await this.pythService.getEmaPrice(tokenSymbol);
      console.log(`📈 Pyth EMA price for ${tokenSymbol}: $${price.toFixed(6)}`);
      return price;
    } catch (error) {
      console.error(`Failed to get EMA price for ${tokenSymbol}:`, error);
      throw error;
    }
  }

  private calculateOrderAmounts(
    params: LimitOrderCreationParams,
    limitPrice: number,
    usdcAddress: string,
    tokenAddress: string
  ): { makerAsset: string; takerAsset: string; makingAmount: string; takingAmount: string } {
    
    const amount = parseFloat(params.amount);
    
    if (params.orderType === 'BUY') {
      // BUY: Selling USDC (maker) to get Token (taker)
      const usdcAmount = amount * limitPrice; // How much USDC we're willing to spend
      const makingAmount = ethers.parseUnits(usdcAmount.toFixed(6), 6).toString(); // USDC has 6 decimals
      const takingAmount = ethers.parseUnits(amount.toString(), 18).toString(); // Assuming 18 decimals for token
      
      return {
        makerAsset: usdcAddress,     // Selling USDC
        takerAsset: tokenAddress,    // Buying Token
        makingAmount: makingAmount,  // USDC amount
        takingAmount: takingAmount   // Token amount
      };
    } else {
      // SELL: Selling Token (maker) to get USDC (taker)
      const usdcAmount = amount * limitPrice; // How much USDC we want to receive
      const makingAmount = ethers.parseUnits(amount.toString(), 18).toString(); // Assuming 18 decimals for token
      const takingAmount = ethers.parseUnits(usdcAmount.toFixed(6), 6).toString(); // USDC has 6 decimals
      
      return {
        makerAsset: tokenAddress,    // Selling Token
        takerAsset: usdcAddress,     // Buying USDC
        makingAmount: makingAmount,  // Token amount
        takingAmount: takingAmount   // USDC amount
      };
    }
  }

  private getChainName(chainId: number): string {
    const chainNames: Record<number, string> = {
      [NetworkEnum.ETHEREUM]: 'Ethereum',
      [NetworkEnum.BASE]: 'Base',
      [NetworkEnum.ARBITRUM]: 'Arbitrum',
      [NetworkEnum.POLYGON]: 'Polygon'
    };
    return chainNames[chainId] || `Chain ${chainId}`;
  }

  // Store limit orders locally since we can't submit them directly to 1inch API
  private storedOrders: any[] = [];

  private storeLimitOrder(order: any): void {
    this.storedOrders.push(order);
    // Keep only last 100 orders to prevent memory issues
    if (this.storedOrders.length > 100) {
      this.storedOrders = this.storedOrders.slice(-100);
    }
  }

  async getLimitOrders(walletAddress: string, chainId: number): Promise<any[]> {
    // Return stored orders for this wallet and chain
    return this.storedOrders.filter(order => 
      order.walletAddress.toLowerCase() === walletAddress.toLowerCase() && 
      order.chainId === chainId
    );
  }

  async cancelLimitOrder(orderHash: string, encryptedPrivateKey: string): Promise<boolean> {
    try {
      // Find the order
      const orderIndex = this.storedOrders.findIndex(order => order.hash === orderHash);
      if (orderIndex === -1) {
        throw new Error('Order not found');
      }

      // Remove from stored orders (simulating cancellation)
      this.storedOrders.splice(orderIndex, 1);
      
      console.log(`✅ Limit order ${orderHash.substring(0, 10)}... cancelled successfully`);
      return true;
    } catch (error) {
      console.error('❌ Failed to cancel limit order:', error);
      return false;
    }
  }

  getSupportedPythTokens(): string[] {
    return this.pythService.getSupportedTokens();
  }

  addPythPriceFeed(tokenSymbol: string, priceId: string): void {
    this.pythService.addPriceFeed(tokenSymbol, priceId);
  }
} 