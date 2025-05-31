import { ethers } from 'ethers';
import { TestnetNetworkEnum, TESTNET_SUPPORTED_TOKENS } from '../config/tokens.testnet';
import { SUPPORTED_TOKENS } from '../config/tokens';
import { SupportedToken, NetworkEnum, OneInchQuoteParams } from '../types';
import { OneInchService } from './OneInchService';
import { WalletService } from './WalletService';

export interface RealBalance {
  tokenSymbol: string;
  tokenAddress: string;
  balance: string;
  chainId: number;
  formatted: string;
}

export interface BlockscoutWalletResponse {
  coin_balance?: string;
  [key: string]: any;
}

export interface BlockscoutTokenBalance {
  value: string;
  token?: {
    symbol: string;
    name: string;
    decimals: string;
    address: string;
  };
}

export interface BlockscoutBalance {
  value: string;
  token?: {
    symbol: string;
    name: string;
    decimals: string;
    address: string;
  };
}

export interface TokenInfo {
  cataloged: boolean;
  contractAddress: string;
  decimals: string;
  name: string;
  symbol: string;
  totalSupply: string;
  type: string;
}

export interface TokenInfoResponse {
  message: string;
  result: TokenInfo;
  status: string;
}

export class BlockchainService {
  private isTestnet: boolean;
  private blockscoutUrls: Map<number, string> = new Map();
  private oneInchService: OneInchService;
  private walletService: WalletService;

  constructor(isTestnet: boolean = false, oneInchService?: OneInchService, walletService?: WalletService) {
    this.isTestnet = isTestnet;
    this.initializeBlockscoutUrls();
    
    // Initialize WalletService with encryption key from environment
    const encryptionKey = process.env.WALLET_ENCRYPTION_KEY || 'default-encryption-key';
    const ws = walletService || new WalletService(encryptionKey);
    
    this.oneInchService = oneInchService || new OneInchService(
      "https://api.1inch.dev",
      process.env.ONEINCH_API_KEY || "",
      ws
    );
    this.walletService = ws;
  }

  private initializeBlockscoutUrls(): void {
    if (this.isTestnet) {
      this.blockscoutUrls.set(TestnetNetworkEnum.SEPOLIA, 'https://eth-sepolia.blockscout.com/api/v2');
      this.blockscoutUrls.set(TestnetNetworkEnum.BASE_SEPOLIA, 'https://base-sepolia.blockscout.com/api/v2');
      this.blockscoutUrls.set(TestnetNetworkEnum.ARBITRUM_SEPOLIA, 'https://arbitrum-sepolia.blockscout.com/api/v2');
      this.blockscoutUrls.set(TestnetNetworkEnum.POLYGON_MUMBAI, 'https://mumbai.blockscout.com/api/v2');
    } else {
      this.blockscoutUrls.set(NetworkEnum.ETHEREUM, 'https://eth.blockscout.com/api/v2');
      this.blockscoutUrls.set(NetworkEnum.BASE, 'https://base.blockscout.com/api/v2');
      this.blockscoutUrls.set(NetworkEnum.ARBITRUM, 'https://arbitrum.blockscout.com/api/v2');
      this.blockscoutUrls.set(NetworkEnum.POLYGON, 'https://polygon.blockscout.com/api/v2');
      this.blockscoutUrls.set(NetworkEnum.OPTIMISM, 'https://optimism.blockscout.com/api/v2');
      this.blockscoutUrls.set(NetworkEnum.GNOSIS, 'https://gnosis.blockscout.com/api/v2');
      this.blockscoutUrls.set(NetworkEnum.FANTOM, 'https://ftm.blockscout.com/api/v2');
      this.blockscoutUrls.set(NetworkEnum.ZKSYNC, 'https://zksync.blockscout.com/api/v2');
      this.blockscoutUrls.set(NetworkEnum.LINEA, 'https://linea.blockscout.com/api/v2');
    }

    console.log(`✅ Initialized Blockscout APIs for ${this.isTestnet ? 'testnet' : 'mainnet'}`);
  }

  /**
   * Get wallet balance data from Blockscout API
   */
  async getWalletFromBlockscout(walletAddress: string, chainId: number): Promise<BlockscoutBalance[]> {
    const apiUrl = this.blockscoutUrls.get(chainId);
    if (!apiUrl) {
      throw new Error(`No Blockscout API URL found for chain ${chainId}`);
    }

    try {
      const url = `${apiUrl}/addresses/${walletAddress}`;
      console.log(`🔍 Fetching wallet data from: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Blockscout API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as BlockscoutWalletResponse;
      console.log(`📊 Blockscout response:`, JSON.stringify(data, null, 2));

      // Extract balance information
      const balances: BlockscoutBalance[] = [];

      // Add native token balance if available
      if (data.coin_balance) {
        balances.push({
          value: data.coin_balance,
        });
      }

      return balances;
    } catch (error) {
      console.error(`Error fetching from Blockscout API for chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Get token balances from Blockscout API
   */
  async getTokenBalancesFromBlockscout(walletAddress: string, chainId: number): Promise<BlockscoutBalance[]> {
    const apiUrl = this.blockscoutUrls.get(chainId);
    if (!apiUrl) {
      throw new Error(`No Blockscout API URL found for chain ${chainId}`);
    }

    try {
      const url = `${apiUrl}/addresses/${walletAddress}/token-balances`;
      console.log(`🔍 Fetching token balances from: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Blockscout API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as BlockscoutTokenBalance[];
      console.log(`📊 Token balances response:`, JSON.stringify(data, null, 2));

      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(`Error fetching token balances from Blockscout API for chain ${chainId}:`, error);
      return [];
    }
  }

  /**
   * Get Sepolia balances using Blockscout API
   */
  async getSepoliaBalances(walletAddress: string): Promise<RealBalance[]> {
    const balances: RealBalance[] = [];
    const chainId = TestnetNetworkEnum.SEPOLIA;

    try {
      console.log(`🔍 Checking Sepolia balances via Blockscout for ${walletAddress}...`);
      
      // Get wallet info including native balance
      const walletData = await this.getWalletFromBlockscout(walletAddress, chainId);
      
      // Process native ETH balance
      for (const balance of walletData) {
        if (balance.value && balance.value !== '0') {
          const ethBalance = ethers.formatEther(balance.value);
          if (parseFloat(ethBalance) > 0) {
            balances.push({
              tokenSymbol: 'ETH',
              tokenAddress: 'native',
              balance: ethBalance,
              chainId: chainId,
              formatted: `${parseFloat(ethBalance).toFixed(6)} ETH`
            });
            console.log(`✅ Found ETH balance: ${ethBalance}`);
          }
        }
      }

      // Get token balances
      try {
        const tokenBalances = await this.getTokenBalancesFromBlockscout(walletAddress, chainId);
        for (const tokenBalance of tokenBalances) {
          if (tokenBalance.token && tokenBalance.value && tokenBalance.value !== '0') {
            const decimals = parseInt(tokenBalance.token.decimals);
            const formattedBalance = ethers.formatUnits(tokenBalance.value, decimals);
            
            if (parseFloat(formattedBalance) > 0) {
              balances.push({
                tokenSymbol: tokenBalance.token.symbol,
                tokenAddress: tokenBalance.token.address,
                balance: formattedBalance,
                chainId: chainId,
                formatted: `${parseFloat(formattedBalance).toFixed(6)} ${tokenBalance.token.symbol}`
              });
              console.log(`✅ Found token balance: ${formattedBalance} ${tokenBalance.token.symbol}`);
            }
          }
        }
      } catch (tokenError) {
        console.warn('Could not fetch token balances, but native balance is available:', tokenError);
      }

      console.log(`Found ${balances.length} total balances on Sepolia`);
    } catch (error) {
      console.error('Error checking Sepolia balances via Blockscout:', error);
    }

    return balances;
  }

  /**
   * Get all balances using Blockscout APIs
   */
  async getAllBalances(walletAddress: string): Promise<RealBalance[]> {
    const balances: RealBalance[] = [];
    const chainsToCheck = Array.from(this.blockscoutUrls.keys());

    for (const chainId of chainsToCheck) {
      try {
        console.log(`🔍 Checking balances on ${this.getChainName(chainId)}...`);
        
        // Get wallet info including native balance
        const walletData = await this.getWalletFromBlockscout(walletAddress, chainId);
        
        // Process native token balance
        for (const balance of walletData) {
          if (balance.value && balance.value !== '0') {
            const nativeSymbol = this.getNativeTokenSymbol(chainId);
            const nativeBalance = ethers.formatEther(balance.value);
            
            if (parseFloat(nativeBalance) > 0) {
              balances.push({
                tokenSymbol: nativeSymbol,
                tokenAddress: 'native',
                balance: nativeBalance,
                chainId: chainId,
                formatted: `${parseFloat(nativeBalance).toFixed(6)} ${nativeSymbol}`
              });
            }
          }
        }

        // Get token balances
        try {
          const tokenBalances = await this.getTokenBalancesFromBlockscout(walletAddress, chainId);
          for (const tokenBalance of tokenBalances) {
            if (tokenBalance.token && tokenBalance.value && tokenBalance.value !== '0') {
              const decimals = parseInt(tokenBalance.token.decimals);
              const formattedBalance = ethers.formatUnits(tokenBalance.value, decimals);
              
              if (parseFloat(formattedBalance) > 0) {
                balances.push({
                  tokenSymbol: tokenBalance.token.symbol,
                  tokenAddress: tokenBalance.token.address,
                  balance: formattedBalance,
                  chainId: chainId,
                  formatted: `${parseFloat(formattedBalance).toFixed(6)} ${tokenBalance.token.symbol}`
                });
              }
            }
          }
        } catch (tokenError) {
          console.warn(`Could not fetch token balances for ${this.getChainName(chainId)}:`, tokenError);
        }

      } catch (error) {
        console.error(`Error checking balances on ${this.getChainName(chainId)}:`, error);
      }
    }

    return balances;
  }

  /**
   * Get native token symbol for a chain
   */
  public getNativeTokenSymbol(chainId: number): string {
    if (this.isTestnet) {
      switch (chainId) {
        case TestnetNetworkEnum.SEPOLIA:
        case TestnetNetworkEnum.BASE_SEPOLIA:
        case TestnetNetworkEnum.ARBITRUM_SEPOLIA:
          return 'ETH';
        case TestnetNetworkEnum.POLYGON_MUMBAI:
          return 'MATIC';
        default:
          return 'ETH';
      }
    } else {
      switch (chainId) {
        case NetworkEnum.ETHEREUM:
        case NetworkEnum.BASE:
        case NetworkEnum.ARBITRUM:
        case NetworkEnum.OPTIMISM:
        case NetworkEnum.ZKSYNC:
        case NetworkEnum.LINEA:
          return 'ETH';
        case NetworkEnum.POLYGON:
          return 'POL';
        case NetworkEnum.GNOSIS:
          return 'xDAI';
        case NetworkEnum.FANTOM:
          return 'FTM';
        default:
          return 'ETH';
      }
    }
  }

  /**
   * Get chain name for display
   */
  getChainName(chainId: number): string {
    if (this.isTestnet) {
      switch (chainId) {
        case TestnetNetworkEnum.SEPOLIA:
          return 'Sepolia Testnet';
        case TestnetNetworkEnum.BASE_SEPOLIA:
          return 'Base Sepolia';
        case TestnetNetworkEnum.ARBITRUM_SEPOLIA:
          return 'Arbitrum Sepolia';
        case TestnetNetworkEnum.POLYGON_MUMBAI:
          return 'Polygon Mumbai';
        default:
          return 'Unknown Network';
      }
    } else {
      switch (chainId) {
        case NetworkEnum.ETHEREUM:
          return 'Ethereum';
        case NetworkEnum.BASE:
          return 'Base';
        case NetworkEnum.ARBITRUM:
          return 'Arbitrum';
        case NetworkEnum.POLYGON:
          return 'Polygon';
        default:
          return 'Unknown Network';
      }
    }
  }

  /**
   * Get Blockscout explorer URL for a transaction or address
   */
  getExplorerUrl(chainId: number, txHash?: string, address?: string): string {
    let baseUrls: Record<number, string>;
    
    if (this.isTestnet) {
      baseUrls = {
        [TestnetNetworkEnum.SEPOLIA]: 'https://eth-sepolia.blockscout.com',
        [TestnetNetworkEnum.BASE_SEPOLIA]: 'https://base-sepolia.blockscout.com',
        [TestnetNetworkEnum.ARBITRUM_SEPOLIA]: 'https://arbitrum-sepolia.blockscout.com',
        [TestnetNetworkEnum.POLYGON_MUMBAI]: 'https://mumbai.blockscout.com'
      };
    } else {
      baseUrls = {
        [NetworkEnum.ETHEREUM]: 'https://eth.blockscout.com',
        [NetworkEnum.BASE]: 'https://base.blockscout.com',
        [NetworkEnum.ARBITRUM]: 'https://arbitrum.blockscout.com',
        [NetworkEnum.POLYGON]: 'https://polygon.blockscout.com',
        [NetworkEnum.OPTIMISM]: 'https://optimism.blockscout.com',
        [NetworkEnum.GNOSIS]: 'https://gnosis.blockscout.com',
        [NetworkEnum.FANTOM]: 'https://ftm.blockscout.com',
        [NetworkEnum.ZKSYNC]: 'https://zksync.blockscout.com',
        [NetworkEnum.LINEA]: 'https://linea.blockscout.com'
      };
    }

    const baseUrl = baseUrls[chainId] || baseUrls[this.isTestnet ? TestnetNetworkEnum.SEPOLIA : NetworkEnum.ETHEREUM];
    
    if (txHash) {
      return `${baseUrl}/tx/${txHash}`;
    } else if (address) {
      return `${baseUrl}/address/${address}`;
    }
    return baseUrl;
  }

  /**
   * Get a direct link to view the wallet address on Blockscout
   */
  getWalletExplorerUrl(walletAddress: string, chainId?: number): string {
    const targetChainId = chainId || (this.isTestnet ? TestnetNetworkEnum.SEPOLIA : NetworkEnum.ETHEREUM);
    return this.getExplorerUrl(targetChainId, undefined, walletAddress);
  }

  /**
   * Get token information from Blockscout API
   */
  async getTokenInfo(chainId: number, contractAddress: string): Promise<TokenInfo | null> {
    const apiUrl = this.blockscoutUrls.get(chainId);
    if (!apiUrl) {
      throw new Error(`No Blockscout API URL found for chain ${chainId}`);
    }

    try {
      const url = `${apiUrl.replace('/api/v2', '/api')}?module=token&action=getToken&contractaddress=${contractAddress}`;
      console.log(`🔍 Fetching token info from: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Blockscout API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as TokenInfoResponse;
      
      if (data.status === '1' && data.message === 'OK') {
        return data.result;
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching token info from Blockscout API for chain ${chainId}:`, error);
      return null;
    }
  }

  /**
   * Buy token by contract address and add it to supported tokens
   */
  async buyTokenByContract(
    chainId: number,
    contractAddress: string,
    amount: string,
    walletAddress: string,
    encryptedPrivateKey: string
  ): Promise<{ success: boolean; token?: SupportedToken; txHash?: string; error?: string }> {
    try {
      // 1. Get token info from Blockscout
      const tokenInfo = await this.getTokenInfo(chainId, contractAddress);
      
      if (!tokenInfo) {
        return {
          success: false,
          error: 'Token not found on Blockscout'
        };
      }

      // 2. Create new supported token
      const newToken: SupportedToken = {
        symbol: tokenInfo.symbol,
        address: tokenInfo.contractAddress,
        chainId: chainId,
        decimals: parseInt(tokenInfo.decimals),
        isStablecoin: false // Default to false as requested
      };

      // 3. Add token to SUPPORTED_TOKENS if it doesn't exist
      const existingToken = SUPPORTED_TOKENS.find(
        token => token.address.toLowerCase() === contractAddress.toLowerCase() && token.chainId === chainId
      );

      if (!existingToken) {
        SUPPORTED_TOKENS.push(newToken);
        console.log(`✅ Added new token ${tokenInfo.symbol} to supported tokens`);
      }

      // 4. Setup cross-chain swap from Base USDC to target token
      const sourceChainId = 8453; // Always use Base as source
      const baseUsdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC

      // 5. Create quote parameters for cross-chain swap
      const quoteParams: OneInchQuoteParams = {
        srcChainId: sourceChainId, // Base
        dstChainId: chainId, // Target chain (e.g., Arbitrum)
        srcTokenAddress: baseUsdcAddress, // Base USDC
        dstTokenAddress: contractAddress, // Target token on destination chain
        amount: ethers.parseUnits(amount, 6).toString(), // USDC has 6 decimals
        walletAddress: walletAddress
      };

      console.log('🔧 Quote parameters:', {
        srcChainId: quoteParams.srcChainId,
        dstChainId: quoteParams.dstChainId,
        srcTokenAddress: quoteParams.srcTokenAddress,
        dstTokenAddress: quoteParams.dstTokenAddress,
        amount: quoteParams.amount,
        walletAddress: quoteParams.walletAddress,
        isCrossChain: quoteParams.srcChainId !== quoteParams.dstChainId
      });

      // 6. Get quote from 1inch
      const quote = await this.oneInchService.getQuote(quoteParams);

      // 7. Place the order
      const orderResult = await this.oneInchService.placeOrder(
        quoteParams,
        encryptedPrivateKey,
        1 // 1% slippage
      );

      return {
        success: true,
        token: newToken,
        txHash: orderResult.orderId
      };

    } catch (error) {
      console.error('Error in buyTokenByContract:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
} 