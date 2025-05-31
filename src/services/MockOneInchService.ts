import { ethers } from 'ethers';
import { SwapQuote, IOneInchService, OneInchQuoteParams, OneInchOrderResult } from '../types';
import { WalletService } from './WalletService';

export class MockOneInchService implements IOneInchService {
  private walletService: WalletService;

  constructor(apiUrl: string, authKey: string, walletService: WalletService) {
    this.walletService = walletService;
    console.log('🧪 Using Mock 1inch Service for testnet');
  }

  /**
   * Mock quote generation for testing
   */
  async getQuote(params: OneInchQuoteParams): Promise<SwapQuote> {
    try {
      console.log('🧪 Mock: Getting quote for', params);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mock exchange rate calculation (simplified)
      const fromAmount = BigInt(params.amount);
      let mockRate = 1800; // Default ETH/USDC rate
      
      // Simple mock rates for different pairs
      if (params.srcTokenAddress.toLowerCase().includes('usdc')) {
        if (params.dstTokenAddress.toLowerCase().includes('eth')) {
          mockRate = 0.00055; // USDC to ETH
        }
      } else if (params.srcTokenAddress.toLowerCase().includes('eth')) {
        if (params.dstTokenAddress.toLowerCase().includes('usdc')) {
          mockRate = 1800; // ETH to USDC
        }
      }

      // Calculate mock output amount with 0.3% slippage
      const outputAmount = (Number(fromAmount) * mockRate * 0.997).toFixed(0);
      
      return {
        fromToken: params.srcTokenAddress,
        toToken: params.dstTokenAddress,
        fromAmount: params.amount,
        toAmount: outputAmount,
        chainId: params.srcChainId,
        estimatedGas: "150000",
        priceImpact: 0.3
      };
    } catch (error) {
      console.error('Mock service error:', error);
      throw new Error(`Mock quote failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mock order placement for testing
   */
  async placeOrder(
    quoteParams: OneInchQuoteParams,
    encryptedPrivateKey: string,
    slippage: number = 1
  ): Promise<OneInchOrderResult> {
    try {
      console.log('🧪 Mock: Placing order for', quoteParams);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Generate mock order ID
      const mockOrderId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Mock transaction hash
      const mockTxHash = ethers.keccak256(ethers.toUtf8Bytes(mockOrderId)).slice(0, 42);

      console.log('🧪 Mock order placed:', { orderId: mockOrderId, txHash: mockTxHash });

      return {
        orderId: mockOrderId,
        status: 'pending',
        txHash: mockTxHash
      };
    } catch (error) {
      console.error('Mock order placement error:', error);
      throw new Error(`Mock order failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mock active orders for testing
   */
  async getActiveOrders(walletAddress: string): Promise<any[]> {
    console.log('🧪 Mock: Getting active orders for', walletAddress);
    
    // Return mock orders
    return [
      {
        id: 'mock_order_1',
        status: 'pending',
        fromToken: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        toToken: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
        fromAmount: '1000000000', // 1000 USDC
        timestamp: Date.now() - 300000 // 5 minutes ago
      }
    ];
  }

  /**
   * Mock order status for testing
   */
  async getOrderStatus(orderId: string): Promise<string> {
    console.log('🧪 Mock: Getting order status for', orderId);
    
    // Simulate different statuses based on order age
    if (orderId.includes('mock_')) {
      const orderTime = parseInt(orderId.split('_')[1]);
      const now = Date.now();
      const ageMinutes = (now - orderTime) / (1000 * 60);
      
      if (ageMinutes < 2) return 'pending';
      if (ageMinutes < 5) return 'filling';
      return 'completed';
    }
    
    return 'unknown';
  }

  /**
   * Mock gas estimation
   */
  async estimateGas(params: OneInchQuoteParams): Promise<string> {
    console.log('🧪 Mock: Estimating gas for', params);
    return "150000"; // Mock gas estimate
  }

  /**
   * Validate token address (same as real service)
   */
  isValidTokenAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  /**
   * Mock successful transaction simulation
   */
  async simulateSuccess(orderId: string): Promise<void> {
    console.log(`🧪 Mock: Simulating successful completion for order ${orderId}`);
    // In a real app, this would be called by a background job
    // that monitors transaction status
  }
} 