import { SupportedToken, NetworkEnum } from '../types';

// Testnet Network Enum
export enum TestnetNetworkEnum {
  SEPOLIA = 11155111,
  BASE_SEPOLIA = 84532,
  ARBITRUM_SEPOLIA = 421614,
  POLYGON_MUMBAI = 80001
}

export const TESTNET_SUPPORTED_TOKENS: SupportedToken[] = [
  // Sepolia Testnet
  {
    symbol: 'ETH',
    address: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14', // WETH on Sepolia
    chainId: TestnetNetworkEnum.SEPOLIA,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'USDC',
    address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Sepolia
    chainId: TestnetNetworkEnum.SEPOLIA,
    decimals: 6,
    isStablecoin: true
  },
  {
    symbol: 'LINK',
    address: '0x779877A7B0D9E8603169DdbD7836e478b4624789', // LINK on Sepolia
    chainId: TestnetNetworkEnum.SEPOLIA,
    decimals: 18,
    isStablecoin: false
  },

  // Base Sepolia
  {
    symbol: 'ETH',
    address: '0x4200000000000000000000000000000000000006', // WETH on Base Sepolia
    chainId: TestnetNetworkEnum.BASE_SEPOLIA,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'USDC',
    address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
    chainId: TestnetNetworkEnum.BASE_SEPOLIA,
    decimals: 6,
    isStablecoin: true
  },

  // Arbitrum Sepolia
  {
    symbol: 'ETH',
    address: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73', // WETH on Arbitrum Sepolia
    chainId: TestnetNetworkEnum.ARBITRUM_SEPOLIA,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'USDC',
    address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // USDC on Arbitrum Sepolia
    chainId: TestnetNetworkEnum.ARBITRUM_SEPOLIA,
    decimals: 6,
    isStablecoin: true
  },

  // Polygon Mumbai
  {
    symbol: 'MATIC',
    address: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889', // WMATIC on Mumbai
    chainId: TestnetNetworkEnum.POLYGON_MUMBAI,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'USDC',
    address: '0x0FA8781a83E46826621b3BC094Ea2A0212e71B23', // USDC on Mumbai
    chainId: TestnetNetworkEnum.POLYGON_MUMBAI,
    decimals: 6,
    isStablecoin: true
  }
];

export const getTestnetTokenBySymbol = (symbol: string, chainId: number): SupportedToken | undefined => {
  return TESTNET_SUPPORTED_TOKENS.find(token => 
    token.symbol.toLowerCase() === symbol.toLowerCase() && token.chainId === chainId
  );
};

export const getTestnetTokensByChain = (chainId: number): SupportedToken[] => {
  return TESTNET_SUPPORTED_TOKENS.filter(token => token.chainId === chainId);
};

export const getTestnetStablecoins = (): SupportedToken[] => {
  return TESTNET_SUPPORTED_TOKENS.filter(token => token.isStablecoin);
};

export const TESTNET_CHAIN_NAMES: Record<number, string> = {
  [TestnetNetworkEnum.SEPOLIA]: 'Sepolia Testnet',
  [TestnetNetworkEnum.BASE_SEPOLIA]: 'Base Sepolia',
  [TestnetNetworkEnum.ARBITRUM_SEPOLIA]: 'Arbitrum Sepolia',
  [TestnetNetworkEnum.POLYGON_MUMBAI]: 'Polygon Mumbai'
};

export const TESTNET_RPC_URLS: Record<number, string> = {
  [TestnetNetworkEnum.SEPOLIA]: 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY',
  [TestnetNetworkEnum.BASE_SEPOLIA]: 'https://sepolia.base.org',
  [TestnetNetworkEnum.ARBITRUM_SEPOLIA]: 'https://sepolia-rollup.arbitrum.io/rpc',
  [TestnetNetworkEnum.POLYGON_MUMBAI]: 'https://polygon-mumbai.g.alchemy.com/v2/YOUR_ALCHEMY_KEY'
};

export const TESTNET_BLOCK_EXPLORERS: Record<number, string> = {
  [TestnetNetworkEnum.SEPOLIA]: 'https://sepolia.etherscan.io',
  [TestnetNetworkEnum.BASE_SEPOLIA]: 'https://sepolia.basescan.org',
  [TestnetNetworkEnum.ARBITRUM_SEPOLIA]: 'https://sepolia.arbiscan.io',
  [TestnetNetworkEnum.POLYGON_MUMBAI]: 'https://mumbai.polygonscan.com'
}; 