import { SupportedToken, NetworkEnum } from '../types';

export const SUPPORTED_TOKENS: SupportedToken[] = [
  // Ethereum Mainnet
  {
    symbol: 'ETH',
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    chainId: NetworkEnum.ETHEREUM,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'USDC',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    chainId: NetworkEnum.ETHEREUM,
    decimals: 6,
    isStablecoin: true
  },
  {
    symbol: 'WBTC',
    address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    chainId: NetworkEnum.ETHEREUM,
    decimals: 8,
    isStablecoin: false
  },
  {
    symbol: 'AAVE',
    address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
    chainId: NetworkEnum.ETHEREUM,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'PEPE',
    address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
    chainId: NetworkEnum.ETHEREUM,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'LINK',
    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    chainId: NetworkEnum.ETHEREUM,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'UNI',
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    chainId: NetworkEnum.ETHEREUM,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'SEI',
    address: '0xbdF43ecAdC5ceF51B7D1772F722E40596BC1788B',
    chainId: NetworkEnum.ETHEREUM,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'MOG',
    address: '0xaaeE1A9723aaDB7afA2810263653A34bA2C21C7a',
    chainId: NetworkEnum.ETHEREUM,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'SPX',
    address: '0xE0f63A424a4439cBE457D80E4f4b51aD25b2c56C',
    chainId: NetworkEnum.ETHEREUM,
    decimals: 8,
    isStablecoin: false
  },

  // Base
  {
    symbol: 'USDC',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    chainId: NetworkEnum.BASE,
    decimals: 6,
    isStablecoin: true
  },
  {
    symbol: 'ETH',
    address: '0x4200000000000000000000000000000000000006',
    chainId: NetworkEnum.BASE,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'WETH',
    address: '0x4200000000000000000000000000000000000006',
    chainId: NetworkEnum.BASE,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'USDT',
    address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    chainId: NetworkEnum.BASE,
    decimals: 6,
    isStablecoin: true
  },
  {
    symbol: 'cbBTC',
    address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    chainId: NetworkEnum.BASE,
    decimals: 8,
    isStablecoin: false
  },
  {
    symbol: 'BTC',
    address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    chainId: NetworkEnum.BASE,
    decimals: 8,
    isStablecoin: false
  },
  {
    symbol: 'VIRTUAL',
    address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
    chainId: NetworkEnum.BASE,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'DEGEN',
    address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
    chainId: NetworkEnum.BASE,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'BRETT',
    address: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
    chainId: NetworkEnum.BASE,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'TOSHI',
    address: '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4',
    chainId: NetworkEnum.BASE,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'AERO',
    address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
    chainId: NetworkEnum.BASE,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'ZORA',
    address: '0x1111111111166b7FE7bd91427724B487980aFc69',
    chainId: NetworkEnum.BASE,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'KAITO',
    address: '0x98d0baa52b2D063E780DE12F615f963Fe8537553',
    chainId: NetworkEnum.BASE,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'BGCI',
    address: '0x23418De10d422AD71C9D5713a2B8991a9c586443',
    chainId: NetworkEnum.BASE,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'MORPHO',
    address: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
    chainId: NetworkEnum.BASE,
    decimals: 18,
    isStablecoin: false
  },

  // Arbitrum
  {
    symbol: 'PENDLE',
    address: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8',
    chainId: NetworkEnum.ARBITRUM,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'CRV',
    address: '0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978',
    chainId: NetworkEnum.ARBITRUM,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'ZRO',
    address: '0x6985884C4392D348587B19cb9eAAf157F13271cd',
    chainId: NetworkEnum.ARBITRUM,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'ATH',
    address: '0xc87B37a581ec3257B734886d9d3a581F5A9d056c',
    chainId: NetworkEnum.ARBITRUM,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'GMX',
    address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
    chainId: NetworkEnum.ARBITRUM,
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'GRT',
    address: '0x9623063377AD1B27544C965cCd7342f7EA7e88C7',
    chainId: NetworkEnum.ARBITRUM,
    decimals: 18,
    isStablecoin: false
  },

  // Polygon
  {
    symbol: 'POL',
    address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    chainId: NetworkEnum.POLYGON,
    decimals: 18,
    isStablecoin: false
  }
];

export const getTokenBySymbol = (symbol: string, chainId: number): SupportedToken | undefined => {
  return SUPPORTED_TOKENS.find(token => 
    token.symbol.toLowerCase() === symbol.toLowerCase() && token.chainId === chainId
  );
};

export const getTokensByChain = (chainId: number): SupportedToken[] => {
  return SUPPORTED_TOKENS.filter(token => token.chainId === chainId);
};

export const getStablecoins = (): SupportedToken[] => {
  return SUPPORTED_TOKENS.filter(token => token.isStablecoin);
};

export const CHAIN_NAMES: Record<number, string> = {
  [NetworkEnum.ETHEREUM]: 'Ethereum',
  [NetworkEnum.BASE]: 'Base',
  [NetworkEnum.ARBITRUM]: 'Arbitrum',
  [NetworkEnum.POLYGON]: 'Polygon',
  [NetworkEnum.OPTIMISM]: 'Optimism',
  [NetworkEnum.GNOSIS]: 'Gnosis',
  [NetworkEnum.FANTOM]: 'Fantom',
  [NetworkEnum.ZKSYNC]: 'zkSync Era',
  [NetworkEnum.LINEA]: 'Linea'
}; 