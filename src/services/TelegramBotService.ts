import TelegramBot from 'node-telegram-bot-api';
import { PrismaDatabaseService } from './PrismaDatabaseService';
import { WalletService } from './WalletService';
import { BlockchainService } from './BlockchainService';
import { WorldIdService } from './WorldIdService';
import { HederaService } from './HederaService';
import { StrategyService } from './StrategyService';
import { MeritEligibilityService } from './meritEligibilityService';
import { HederaAgentService, ChatMessage } from './HederaAgentService';
import { IOneInchServiceWithLimitOrders, OneInchQuoteParams, HederaTopic, HederaMessage, LimitOrderCreationParams } from '../types';

import { getTokenBySymbol, getTokensByChain, CHAIN_NAMES, SUPPORTED_TOKENS } from '../config/tokens';
import { ethers } from 'ethers';

export class TelegramBotService {
  private bot: TelegramBot;
  private db: PrismaDatabaseService;
  private walletService: WalletService;
  private oneInchService: IOneInchServiceWithLimitOrders;
  private blockchainService?: BlockchainService;
  private worldIdService?: WorldIdService;
  private hederaService?: HederaService;
  private strategyService?: StrategyService;
  private hederaAgentService?: HederaAgentService;
  private meritEligibilityService: MeritEligibilityService;
  private quoteStorage: Map<string, OneInchQuoteParams> = new Map();
  private chatHistories: Map<number, ChatMessage[]> = new Map(); // Store chat histories by user ID

  constructor(
    token: string,
    db: PrismaDatabaseService,
    walletService: WalletService,
    oneInchService: IOneInchServiceWithLimitOrders,
    blockchainService?: BlockchainService,
    worldIdService?: WorldIdService,
    hederaService?: HederaService,
    strategyService?: StrategyService,
    hederaAgentService?: HederaAgentService
  ) {
    this.bot = new TelegramBot(token, { polling: true });
    this.db = db;
    this.walletService = walletService;
    this.oneInchService = oneInchService;
    this.blockchainService = blockchainService;
    this.worldIdService = worldIdService;
    this.hederaService = hederaService;
    this.strategyService = strategyService;
    this.hederaAgentService = hederaAgentService;
    this.meritEligibilityService = new MeritEligibilityService(db.prisma);

    this.setupCommands();
    this.setupCallbackHandlers();
  }

  private generateQuoteId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private storeQuote(quoteParams: OneInchQuoteParams): string {
    const quoteId = this.generateQuoteId();
    this.quoteStorage.set(quoteId, quoteParams);
    
    // Clean up old quotes after 10 minutes
    setTimeout(() => {
      this.quoteStorage.delete(quoteId);
    }, 10 * 60 * 1000);
    
    return quoteId;
  }

  private setupCommands(): void {
    this.bot.setMyCommands([
      { command: 'start', description: 'Start using the bot' },
      { command: 'verify', description: 'Verify your humanity with World ID' },
      { command: 'wallet', description: 'Show wallet information' },
      { command: 'balance', description: 'Show token balances' },
      { command: 'buy', description: 'Buy tokens (e.g. /buy 100 USDC ETH)' },
      { command: 'buycontract', description: 'Buy tokens by contract address (e.g. /buycontract 0x123... 100 USDC)' },
      { command: 'sell', description: 'Sell tokens (e.g. /sell 0.1 ETH USDC)' },
      { command: 'limitbuy', description: 'Create limit buy order (e.g. /limitbuy 1 ETH)' },
      { command: 'limitsell', description: 'Create limit sell order (e.g. /limitsell 1 ETH)' },
      { command: 'limitorders', description: 'View your active limit orders' },
      { command: 'cancellimit', description: 'Cancel a limit order' },
      { command: 'pythprice', description: 'Get EMA price from Pyth (e.g. /pythprice ETH)' },
      { command: 'pythtest', description: 'Test Pyth service with all supported tokens' },
      { command: 'pythall', description: 'Get all Pyth EMA prices at once' },
      { command: 'pythcompare', description: 'Compare Pyth prices over time' },
      { command: 'quote', description: 'Get price quote with instant buy option' },
      { command: 'orders', description: 'Check active/recent orders' },
      { command: 'status', description: 'Check specific order status' },
      { command: 'tokens', description: 'Show supported tokens' },
      { command: 'charts', description: 'View token price charts' },
      { command: 'history', description: 'Show transaction history' },
      { command: 'meriteligibility', description: 'Check Blockscout merit eligibility status' },
      { command: 'blindex', description: 'Acquires data about index constructed with Black-Litterman model' },
      { command: 'ai', description: 'Chat with Hedera AI Agent (e.g. /ai What is my portfolio?)' },
      { command: 'aihelp', description: 'Get help about AI agent capabilities' },
      { command: 'help', description: 'Show help' }
    ]);
  }

  private setupCallbackHandlers(): void {
    // Start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const username = msg.from?.username;

      if (!userId) {
        this.bot.sendMessage(chatId, 'Error: User information not found.');
        return;
      }

      try {
        // Check if user already exists
        const existingUser = await this.db.getUser(userId);
        if (existingUser) {
          const verificationStatus = existingUser.worldIdVerified ? 
            '✅ World ID Verified' : 
            '❌ Not verified - Use /verify to get verified';
            
          this.bot.sendMessage(chatId, 
            `Welcome back! 🎉\n\n` +
            `Your wallet address: \`${existingUser.walletAddress}\`\n` +
            `Verification status: ${verificationStatus}\n\n` +
            `${existingUser.worldIdVerified ? 
              'Use /help to see available commands.' : 
              'Use /verify to verify your humanity and unlock trading features!'}`,
            { parse_mode: 'Markdown' }
          );
          return;
        }

        // Create new wallet
        const wallet = this.walletService.generateWallet();
        const encryptedPrivateKey = this.walletService.encrypt(wallet.privateKey);

        // Save user to database
        await this.db.createUser(userId, username, wallet.address, encryptedPrivateKey);

        this.bot.sendMessage(chatId,
          `Welcome to Trading Bot! 🚀\n\n` +
          `New wallet created:\n` +
          `Address: \`${wallet.address}\`\n\n` +
          `⚠️ *IMPORTANT:* Save this mnemonic phrase in a secure place:\n` +
          `\`${wallet.mnemonic}\`\n\n` +
          `Use /help to see available commands.`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('Error in start command:', error);
        this.bot.sendMessage(chatId, 'Error creating wallet. Please try again.');
      }
    });

    // /verify command for World ID verification
    this.bot.onText(/\/verify/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (!userId) {
        this.bot.sendMessage(chatId, 'Error: Could not identify user.');
        return;
      }

      if (!this.worldIdService) {
        this.bot.sendMessage(chatId, 'World ID verification is not available.');
        return;
      }

      try {
        // Check if user is already verified
        const isVerified = await this.worldIdService.isUserVerified(userId);
        if (isVerified) {
          this.bot.sendMessage(chatId, '✅ You are already verified with World ID!');
          return;
        }

        // Get or create user first
        let user = await this.db.getUser(userId);
        if (!user) {
          // Create new wallet for user
          const walletInfo = this.walletService.generateWallet();
          const encryptedPrivateKey = this.walletService.encrypt(walletInfo.privateKey);
          
          await this.db.createUser(
            userId,
            msg.from?.username,
            walletInfo.address,
            encryptedPrivateKey
          );
          
          user = await this.db.getUser(userId);
        }

        if (!user) {
          this.bot.sendMessage(chatId, 'Error creating user account.');
          return;
        }

        // Direct users to the Mini App for World ID verification
        const instructions = `🌍 **World ID Verification Required**

To use this trading bot, you need to verify your humanity with World ID.

**How to verify:**
1. **Open our Mini App** by clicking the button below
2. **Complete verification** with World ID directly in the app
3. **Return to this chat** to start trading

**What is World ID?**
• Proves you're a unique human
• Privacy-preserving verification
• No personal data required
• One verification per person globally

Ready to verify? 🚀`;

        const verifyKeyboard = {
          inline_keyboard: [
            [
              { text: '🌍 Open Verification App', web_app: { url: process.env.MINIAPP_URL || 'http://localhost:3001' } }
            ],
            [
              { text: '✅ I completed verification', callback_data: `worldid_completed_${userId}` }
            ],
            [
              { text: '❓ Help', callback_data: `worldid_help_${userId}` }
            ]
          ]
        };

        await this.bot.sendMessage(chatId, instructions, {
          reply_markup: verifyKeyboard,
          parse_mode: 'Markdown'
        });
        
      } catch (error) {
        console.error('Error in /verify command:', error);
        this.bot.sendMessage(chatId, 'Error setting up World ID verification. Please try again.');
      }
    });

    // /charts command for viewing token price charts
    this.bot.onText(/\/charts(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const tokenSymbol = match?.[1]?.trim().toUpperCase() || '';

      if (!userId) {
        this.bot.sendMessage(chatId, 'Error: Could not identify user.');
        return;
      }

      try {
        // Build the charts mini app URL
        const baseUrl = process.env.MINIAPP_URL || 'http://localhost:3001';
        const chartsUrl = tokenSymbol ? 
          `${baseUrl}/charts/${tokenSymbol.toLowerCase()}` : 
          `${baseUrl}/charts`;

        const chartKeyboard = {
          inline_keyboard: [
            [
              { text: '📊 Open Charts', web_app: { url: chartsUrl } }
            ]
          ]
        };

        let message = '📊 **Token Price Charts**\n\n';
        
        if (tokenSymbol) {
          message += `Opening chart for **${tokenSymbol}**\n\n`;
        } else {
          message += 'View real-time price charts for all supported tokens:\n\n';
          message += '• **Search & Filter** - Find tokens by symbol or chain\n';
          message += '• **Multiple Chains** - Ethereum, Base, Arbitrum, Polygon\n';
          message += '• **Live Data** - Real-time charts from GeckoTerminal\n\n';
          message += '**Popular tokens:**\n';
          message += '🔷 ETH, WBTC, AAVE, PEPE, LINK\n';
          message += '🔵 VIRTUAL, DEGEN, BRETT, AERO\n';
          message += '🔴 PENDLE, GMX, ZRO\n\n';
        }
        
        message += 'Click the button below to open the charts! 👇';

        await this.bot.sendMessage(chatId, message, {
          reply_markup: chartKeyboard,
          parse_mode: 'Markdown'
        });
        
      } catch (error) {
        console.error('Error in /charts command:', error);
        this.bot.sendMessage(chatId, 'Error opening charts. Please try again.');
      }
    });

    // Helper method to check World ID verification status
    const checkWorldIdVerification = async (userId: number, chatId: number): Promise<boolean> => {
      if (!this.worldIdService) {
        return true; // If World ID service is not available, allow trading
      }

      try {
        const isVerified = await this.worldIdService.isUserVerified(userId);
        if (!isVerified) {
          const keyboard = {
            inline_keyboard: [
              [{ text: '🌍 Get Verified', callback_data: 'start_verification' }]
            ]
          };

          this.bot.sendMessage(chatId, 
            '🚫 **Verification Required**\n\n' +
            'You must verify your humanity with World ID to use this feature.\n\n' +
            '**Why verification?**\n' +
            '• Prevents bot abuse\n' +
            '• Ensures fair access\n' +
            '• Protects real users\n\n' +
            'Click the button below to get verified! 👇',
            { 
              parse_mode: 'Markdown',
              reply_markup: keyboard 
            }
          );
          return false;
        }
        return true;
      } catch (error) {
        console.error('Error checking World ID verification:', error);
        return true; // On error, allow trading to continue
      }
    };

    // Wallet info command
    this.bot.onText(/\/wallet/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (!userId) return;

      try {
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }

        this.bot.sendMessage(chatId,
          ` Wallet Information:\n\n` +
          `Address: \`${user.walletAddress}\`\n` +
          `Created: ${user.createdAt.toLocaleDateString('en-US')}\n\n` +
          `Use /balance to see your balances.`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('Error in wallet command:', error);
        this.bot.sendMessage(chatId, 'Error retrieving wallet information.');
      }
    });

    // Balance command
    this.bot.onText(/\/balance/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (!userId) return;

      try {
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }

        // If blockchain service is available, get real balances
        if (this.blockchainService) {
          this.bot.sendMessage(chatId, '🔍 Checking your mainnet balances...');
          
          try {
            // Get real balances from all supported mainnet chains
            const realBalances = await this.blockchainService.getAllBalances(user.walletAddress);
            
            if (realBalances.length === 0) {
              this.bot.sendMessage(chatId, 
                `💰 Mainnet Balances:\n\nNo balances found on any mainnet chains.\n\n` +
                `Wallet address:\n\`${user.walletAddress}\`\n\n` +
                `🔗 [View on Blockscout](${this.blockchainService.getWalletExplorerUrl(user.walletAddress)})\n\n` +
                `💡 Send USDC to your wallet to start trading!\n` +
                `💰 **Recommended**: Send USDC on Base for best trading experience\n` +
                `• Base USDC has lower fees and faster transactions\n` +
                `• You can bridge USDC from other chains to Base`,
                { parse_mode: 'Markdown' }
              );
              return;
            }

            // Sort balances to prioritize USDC, especially on Base
            const sortedBalances = realBalances.sort((a, b) => {
              // USDC on Base first
              if (a.tokenSymbol === 'USDC' && a.chainId === 8453) return -1;
              if (b.tokenSymbol === 'USDC' && b.chainId === 8453) return 1;
              
              // Other USDC next
              if (a.tokenSymbol === 'USDC' && b.tokenSymbol !== 'USDC') return -1;
              if (b.tokenSymbol === 'USDC' && a.tokenSymbol !== 'USDC') return 1;
              
              // Base network tokens next
              if (a.chainId === 8453 && b.chainId !== 8453) return -1;
              if (b.chainId === 8453 && a.chainId !== 8453) return 1;
              
              return 0;
            });

            let balanceText = '💰 Your Mainnet Balances:\n\n';
            
            // Group by chain for better display
            const balancesByChain: Record<number, typeof realBalances> = {};
            for (const balance of sortedBalances) {
              if (!balancesByChain[balance.chainId]) {
                balancesByChain[balance.chainId] = [];
              }
              balancesByChain[balance.chainId].push(balance);
            }

            // Display balances grouped by chain
            for (const [chainId, chainBalances] of Object.entries(balancesByChain)) {
              const chainName = this.blockchainService.getChainName(parseInt(chainId));
              balanceText += `**${chainName}:**\n`;
              
              for (const balance of chainBalances) {
                const icon = balance.tokenSymbol === 'USDC' ? '💰' : 
                           balance.tokenSymbol === 'ETH' ? '⚡' : '🪙';
                balanceText += `${icon} ${balance.formatted}\n`;
              }
              balanceText += '\n';
            }
            
            balanceText += `📱 Wallet: \`${user.walletAddress}\`\n`;
            balanceText += `🔗 [View on Blockscout](${this.blockchainService.getWalletExplorerUrl(user.walletAddress)})\n\n`;
            
            // Add trading suggestions based on balances
            const hasUSDC = realBalances.some(b => b.tokenSymbol === 'USDC');
            const hasBaseUSDC = realBalances.some(b => b.tokenSymbol === 'USDC' && b.chainId === 8453);
            
            if (hasBaseUSDC) {
              balanceText += `🎯 Ready to trade! Use commands like:\n`;
              balanceText += `• \`/buy ETH 100\` - Buy ETH with 100 USDC\n`;
              balanceText += `• \`/quote PEPE 50\` - Get quote for PEPE with 50 USDC`;
            } else if (hasUSDC) {
              balanceText += `💡 Consider bridging your USDC to Base for lower fees`;
            } else {
              balanceText += `💡 Send USDC to start trading!`;
            }
            
            this.bot.sendMessage(chatId, balanceText, { parse_mode: 'Markdown' });
            return;
          } catch (error) {
            console.error('Error getting mainnet balances:', error);
            this.bot.sendMessage(chatId, '❌ Error checking mainnet balances. Showing database balances instead.');
          }
        }

        // Fallback to database balances (for mainnet or when blockchain service unavailable)
        const balances = await this.db.getTokenBalances(userId);
        
        if (balances.length === 0) {
          this.bot.sendMessage(chatId, 
            `💰 Database Balances:\n\nNo balances found. Deposit funds to your wallet to start trading.\n\n` +
            `Wallet address:\n\`${user.walletAddress}\``,
            { parse_mode: 'Markdown' }
          );
          return;
        }

        let balanceText = '💰 Database Balances:\n\n';
        for (const balance of balances) {
          const chainName = CHAIN_NAMES[balance.chainId] || 'Unknown';
          balanceText += `${balance.tokenSymbol}: ${balance.balance} (${chainName})\n`;
        }

        this.bot.sendMessage(chatId, balanceText, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error('Error in balance command:', error);
        this.bot.sendMessage(chatId, 'Error retrieving balances.');
      }
    });

    // Buy command
    this.bot.onText(/\/buy (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const input = match?.[1];

      if (!userId || !input) return;

      try {
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }


        const parts = input.split(' ');
        let fromSymbol = 'USDC'; // Default to USDC
        let toSymbol: string;
        let amount: string;
        let chainId = 8453; // Default to Base

        if (parts.length === 2) {
          // Format: /buy ETH 100 (assumes USDC as from token, Base as chain)
          [toSymbol, amount] = parts;
        } else if (parts.length === 3) {
          // Format: /buy 100 USDC ETH (explicit from/to tokens)
          [amount, fromSymbol, toSymbol] = parts;
        } else {
          this.bot.sendMessage(chatId, 
            'Invalid command format. Use:\n' +
            '• `/buy ETH 100` - Buy ETH with 100 USDC (on Base)\n' +
            '• `/buy 100 USDC ETH` - Buy ETH with 100 USDC\n\n' +
            '💡 Base network is recommended for lower fees!'
          );
          return;
        }

        // Get token information, defaulting to Base network
        const fromToken = getTokenBySymbol(fromSymbol.toUpperCase(), chainId);
        const toToken = getTokenBySymbol(toSymbol.toUpperCase(), chainId);

        if (!fromToken || !toToken) {
          this.bot.sendMessage(chatId, 
            `Unknown token on Base network. Use /tokens to see supported tokens.\n\n` +
            `💡 Try popular tokens: USDC, ETH, cbBTC, DEGEN, BRETT`
          );
          return;
        }

        // Get quote
        const quoteParams: OneInchQuoteParams = {
          srcChainId: fromToken.chainId,
          dstChainId: toToken.chainId,
          srcTokenAddress: fromToken.address,
          dstTokenAddress: toToken.address,
          amount: ethers.parseUnits(amount, fromToken.decimals).toString(),
          walletAddress: user.walletAddress
        };

        const quote = await this.oneInchService.getQuote(quoteParams);
        const outputAmount = ethers.formatUnits(quote.toAmount, toToken.decimals);

        // Store quote data and get short ID for callback (same as /quote command)
        const quoteId = this.storeQuote(quoteParams);

        // Send confirmation with Base network highlighted
        const keyboard = {
          inline_keyboard: [
            [
              { text: '✅ Confirm Purchase', callback_data: `buy_${quoteId}` },
              { text: '❌ Cancel', callback_data: 'cancel' }
            ]
          ]
        };

        this.bot.sendMessage(chatId,
          `📊 Purchase Quote (Base Network):\n\n` +
          `Selling: ${amount} ${fromSymbol.toUpperCase()}\n` +
          `Receiving: ~${outputAmount} ${toSymbol.toUpperCase()}\n` +
          `Network: Base (lower fees ✨)\n` +
          `Price Impact: ~${quote.priceImpact}%\n` +
          `Estimated Gas: ${quote.estimatedGas}\n\n` +
          `Confirm purchase:`,
          { reply_markup: keyboard }
        );

      } catch (error) {
        console.error('Error in buy command:', error);
        this.bot.sendMessage(chatId, 
          'Error getting quote. Please check:\n' +
          '• Token names are correct\n' +
          '• You have sufficient balance\n' +
          '• Amount is valid\n\n' +
          '💡 Remember: USDC on Base is recommended!'
        );
      }
    });

    // Quote command
    this.bot.onText(/\/quote (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const input = match?.[1];

      if (!userId || !input) return;

      try {
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }


        const parts = input.split(' ');
        if (parts.length !== 3) {
          this.bot.sendMessage(chatId, 
            'Invalid command. Use: /quote [amount] [from_token] [to_token]\n' +
            'Example: /quote 100 USDC ETH'
          );
          return;
        }

        const [amount, fromSymbol, toSymbol] = parts;
        // Default to Base network (8453) first
        let fromToken = getTokenBySymbol(fromSymbol.toUpperCase(), 8453);
        let toToken = getTokenBySymbol(toSymbol.toUpperCase(), 8453);

        // If not found on Base, try to find the best cross-chain combination
        if (!fromToken || !toToken) {
          // Check if tokens exist on other chains for cross-chain options
          const allFromTokens = SUPPORTED_TOKENS.filter(token => 
            token.symbol.toLowerCase() === fromSymbol.toLowerCase()
          );
          const allToTokens = SUPPORTED_TOKENS.filter(token => 
            token.symbol.toLowerCase() === toSymbol.toLowerCase()
          );

          if (allFromTokens.length === 0) {
            this.bot.sendMessage(chatId, 
              `❌ Token "${fromSymbol.toUpperCase()}" not found on any supported network.\n\n` +
              `Use /tokens to see all supported tokens.`
            );
            return;
          }

          if (allToTokens.length === 0) {
            this.bot.sendMessage(chatId, 
              `❌ Token "${toSymbol.toUpperCase()}" not found on any supported network.\n\n` +
              `Use /tokens to see all supported tokens.`
            );
            return;
          }

          // Find the best cross-chain combination
          // Priority: Base USDC as source, then other combinations
          let bestFromToken = allFromTokens.find(t => t.symbol === 'USDC' && t.chainId === 8453) || allFromTokens[0];
          let bestToToken = allToTokens.find(t => t.chainId !== bestFromToken.chainId) || allToTokens[0];

          // If still same chain, try different combinations
          if (bestFromToken.chainId === bestToToken.chainId) {
            for (const fromTok of allFromTokens) {
              for (const toTok of allToTokens) {
                if (fromTok.chainId !== toTok.chainId) {
                  bestFromToken = fromTok;
                  bestToToken = toTok;
                  break;
                }
              }
              if (bestFromToken.chainId !== bestToToken.chainId) break;
            }
          }

          // If still same chain, show suggestions
          if (bestFromToken.chainId === bestToToken.chainId) {
            this.bot.sendMessage(chatId, 
              `🔍 Only same-chain combinations available:\n\n` +
              `**Available locations:**\n` +
              `${fromSymbol.toUpperCase()}: ${allFromTokens.map(t => CHAIN_NAMES[t.chainId]).join(', ')}\n` +
              `${toSymbol.toUpperCase()}: ${allToTokens.map(t => CHAIN_NAMES[t.chainId]).join(', ')}\n\n` +
              `⚠️ Our bot only supports cross-chain swaps via 1inch Fusion+.\n` +
              `For same-chain swaps, use DEX aggregators directly.\n\n` +
              `**Base tokens:** USDC, cbBTC, VIRTUAL, DEGEN, BRETT`
            );
            return;
          }

          // Use the best cross-chain combination
          fromToken = bestFromToken;
          toToken = bestToToken;

          this.bot.sendMessage(chatId, 
            `🔄 Using cross-chain combination:\n` +
            `${fromToken.symbol} (${CHAIN_NAMES[fromToken.chainId]}) → ${toToken.symbol} (${CHAIN_NAMES[toToken.chainId]})\n\n` +
            `Getting quote...`
          );
        }

        // Check if this is a same-chain swap (after finding tokens)
        /* Removing same-chain restriction - now supporting both same-chain and cross-chain
        if (fromToken.chainId === toToken.chainId) {
          this.bot.sendMessage(chatId,
            `📊 Same-Chain Quote Request:\n\n` +
            `${amount} ${fromSymbol.toUpperCase()} → ${toSymbol.toUpperCase()}\n` +
            `Network: ${CHAIN_NAMES[fromToken.chainId]}\n\n` +
            `⚠️ **Note**: Our bot currently uses 1inch Fusion+ which is designed for cross-chain swaps.\n\n` +
            `**For same-chain swaps on ${CHAIN_NAMES[fromToken.chainId]}:**\n` +
            `• Use DEX aggregators like 1inch.io directly\n` +
            `• Try Uniswap, Aerodrome, or other DEXs\n` +
            `• Consider bridging to another chain for cross-chain swaps\n\n` +
            `**Cross-chain alternatives:**\n` +
            `• Bridge tokens to different chains\n` +
            `• Use /tokens to see supported chains`
          );
          return;
        }
        */

        const quoteParams: OneInchQuoteParams = {
          srcChainId: fromToken.chainId,
          dstChainId: toToken.chainId,
          srcTokenAddress: fromToken.address,
          dstTokenAddress: toToken.address,
          amount: ethers.parseUnits(amount, fromToken.decimals).toString(),
          walletAddress: user.walletAddress
        };

        const quote = await this.oneInchService.getQuote(quoteParams);
        const outputAmount = ethers.formatUnits(quote.toAmount, toToken.decimals);

        // Display quote for both same-chain and cross-chain swaps
        const swapType = fromToken.chainId === toToken.chainId ? 'Same-Chain' : 'Cross-Chain';
        const networkInfo = fromToken.chainId === toToken.chainId 
          ? `Network: ${CHAIN_NAMES[fromToken.chainId]}`
          : `From: ${CHAIN_NAMES[fromToken.chainId]} → To: ${CHAIN_NAMES[toToken.chainId]}`;

        // Store quote data and get short ID for callback
        const quoteId = this.storeQuote(quoteParams);

        // Create inline keyboard for immediate trading
        const keyboard = {
          inline_keyboard: [
            [
              { text: '🚀 Buy Now', callback_data: `quote_${quoteId}` },
              { text: '❌ Cancel', callback_data: 'cancel' }
            ]
          ]
        };

        // Add a note about the execution method for same-chain swaps
        let executionNote = '';
        if (fromToken.chainId === toToken.chainId) {
          executionNote = '\n💡 Using Fusion mode (or regular API fallback for fee-on-transfer tokens)';
        }

        this.bot.sendMessage(chatId,
          `📊 ${swapType} Quote:\n\n` +
          `${amount} ${fromSymbol.toUpperCase()} → ~${outputAmount} ${toSymbol.toUpperCase()}\n` +
          `${networkInfo}\n` +
          `Price Impact: ~${quote.priceImpact}%\n` +
          `Estimated Gas: ${quote.estimatedGas}${executionNote}\n\n` +
          `Click "Buy Now" to execute this trade immediately!`,
          { reply_markup: keyboard }
        );

      } catch (error) {
        console.error('Error in quote command:', error);
        if (error instanceof Error && error.message.includes('srcChain and dstChain should be different')) {
          this.bot.sendMessage(chatId, 
            `❌ Same-chain swaps not supported.\n\n` +
            `Our bot uses 1inch Fusion+ for cross-chain swaps only.\n` +
            `For same-chain swaps, use DEX aggregators directly.`
          );
        } else {
          this.bot.sendMessage(chatId, 'Error getting price quote.');
        }
      }
    });

    // Limit Buy command
    this.bot.onText(/\/limitbuy (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const input = match?.[1];

      if (!userId || !input) return;

      try {
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }


        const parts = input.split(' ');
        if (parts.length !== 2) {
          this.bot.sendMessage(chatId, 
            'Invalid command format. Use:\n' +
            '• `/limitbuy 1 ETH` - Create limit buy order for 1 ETH at Pyth EMA price\n' +
            '• `/limitbuy 0.5 BTC` - Create limit buy order for 0.5 BTC at Pyth EMA price\n\n' +
            '💡 Orders use USDC and Pyth Network EMA pricing'
          );
          return;
        }

        const [amount, tokenSymbol] = parts;
        const chainId = 8453; // Default to Base

        // Get token information
        const token = getTokenBySymbol(tokenSymbol.toUpperCase(), chainId);
        if (!token) {
          this.bot.sendMessage(chatId, 
            `❌ Token ${tokenSymbol.toUpperCase()} not found on Base network.\n\n` +
            `Supported Pyth tokens: ${this.oneInchService.getSupportedPythTokens().join(', ')}`
          );
          return;
        }

        // Check if token is supported by Pyth
        if (!this.oneInchService.getSupportedPythTokens().includes(tokenSymbol.toUpperCase())) {
          this.bot.sendMessage(chatId, 
            `❌ ${tokenSymbol.toUpperCase()} is not supported by Pyth Network.\n\n` +
            `Supported tokens: ${this.oneInchService.getSupportedPythTokens().join(', ')}`
          );
          return;
        }

        this.bot.sendMessage(chatId, `🎯 Creating limit buy order for ${amount} ${tokenSymbol.toUpperCase()}...`);

        // Create limit order
        const limitOrderParams: LimitOrderCreationParams = {
          tokenSymbol: tokenSymbol.toUpperCase(),
          tokenAddress: token.address,
          amount: amount,
          orderType: 'BUY',
          chainId: chainId,
          walletAddress: user.walletAddress,
          useEmaPrice: true,
          priceMultiplier: 1.0
        };

        const result = await this.oneInchService.createLimitOrder(limitOrderParams, user.encryptedPrivateKey);

        if (result.success) {
          this.bot.sendMessage(chatId,
            `✅ **Limit Buy Order Created!**\n\n` +
            `📊 **Order Details:**\n` +
            `• Token: ${tokenSymbol.toUpperCase()}\n` +
            `• Amount: ${amount} ${tokenSymbol.toUpperCase()}\n` +
            `• Type: BUY\n` +
            `• EMA Price: $${result.emaPrice?.toFixed(6)}\n` +
            `• Limit Price: $${result.limitPrice?.toFixed(6)}\n` +
            `• Order ID: \`${result.orderId}\`\n\n` +
            `🔗 Your order is now live on 1inch Orderbook!`,
            { parse_mode: 'Markdown' }
          );
        } else {
          this.bot.sendMessage(chatId, `❌ Failed to create limit order: ${result.error}`);
        }

      } catch (error) {
        console.error('Error in limitbuy command:', error);
        this.bot.sendMessage(chatId, 'Error creating limit buy order. Please try again.');
      }
    });

    // Limit Sell command
    this.bot.onText(/\/limitsell (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const input = match?.[1];

      if (!userId || !input) return;

      try {
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }


        const parts = input.split(' ');
        if (parts.length !== 2) {
          this.bot.sendMessage(chatId, 
            'Invalid command format. Use:\n' +
            '• `/limitsell 1 ETH` - Create limit sell order for 1 ETH at Pyth EMA price\n' +
            '• `/limitsell 0.5 BTC` - Create limit sell order for 0.5 BTC at Pyth EMA price\n\n' +
            '💡 Orders sell for USDC using Pyth Network EMA pricing'
          );
          return;
        }

        const [amount, tokenSymbol] = parts;
        const chainId = 8453; // Default to Base

        // Get token information
        const token = getTokenBySymbol(tokenSymbol.toUpperCase(), chainId);
        if (!token) {
          this.bot.sendMessage(chatId, 
            `❌ Token ${tokenSymbol.toUpperCase()} not found on Base network.\n\n` +
            `Supported Pyth tokens: ${this.oneInchService.getSupportedPythTokens().join(', ')}`
          );
          return;
        }

        // Check if token is supported by Pyth
        if (!this.oneInchService.getSupportedPythTokens().includes(tokenSymbol.toUpperCase())) {
          this.bot.sendMessage(chatId, 
            `❌ ${tokenSymbol.toUpperCase()} is not supported by Pyth Network.\n\n` +
            `Supported tokens: ${this.oneInchService.getSupportedPythTokens().join(', ')}`
          );
          return;
        }

        this.bot.sendMessage(chatId, `🎯 Creating limit sell order for ${amount} ${tokenSymbol.toUpperCase()}...`);

        // Create limit order
        const limitOrderParams: LimitOrderCreationParams = {
          tokenSymbol: tokenSymbol.toUpperCase(),
          tokenAddress: token.address,
          amount: amount,
          orderType: 'SELL',
          chainId: chainId,
          walletAddress: user.walletAddress,
          useEmaPrice: true,
          priceMultiplier: 1.0
        };

        const result = await this.oneInchService.createLimitOrder(limitOrderParams, user.encryptedPrivateKey);

        if (result.success) {
          this.bot.sendMessage(chatId,
            `✅ **Limit Sell Order Created!**\n\n` +
            `📊 **Order Details:**\n` +
            `• Token: ${tokenSymbol.toUpperCase()}\n` +
            `• Amount: ${amount} ${tokenSymbol.toUpperCase()}\n` +
            `• Type: SELL\n` +
            `• EMA Price: $${result.emaPrice?.toFixed(6)}\n` +
            `• Limit Price: $${result.limitPrice?.toFixed(6)}\n` +
            `• Order ID: \`${result.orderId}\`\n\n` +
            `🔗 Your order is now live on 1inch Orderbook!`,
            { parse_mode: 'Markdown' }
          );
        } else {
          this.bot.sendMessage(chatId, `❌ Failed to create limit order: ${result.error}`);
        }

      } catch (error) {
        console.error('Error in limitsell command:', error);
        this.bot.sendMessage(chatId, 'Error creating limit sell order. Please try again.');
      }
    });

    // Pyth Price command
    this.bot.onText(/\/pythprice (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const tokenSymbol = match?.[1]?.trim();

      if (!userId || !tokenSymbol) return;

      try {
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }

        // Check if token is supported by Pyth
        if (!this.oneInchService.getSupportedPythTokens().includes(tokenSymbol.toUpperCase())) {
          this.bot.sendMessage(chatId, 
            `❌ ${tokenSymbol.toUpperCase()} is not supported by Pyth Network.\n\n` +
            `Supported tokens: ${this.oneInchService.getSupportedPythTokens().join(', ')}`
          );
          return;
        }

        this.bot.sendMessage(chatId, `📊 Fetching Pyth EMA price for ${tokenSymbol.toUpperCase()}...`);

        // Get the service cast to the limit order interface to access Pyth methods
        const limitOrderService = this.oneInchService as any;
        const pythService = limitOrderService.pythService;
        
        if (!pythService) {
          this.bot.sendMessage(chatId, '❌ Pyth service not available.');
          return;
        }

        const emaPrice = await pythService.getEmaPrice(tokenSymbol.toUpperCase());

        this.bot.sendMessage(chatId,
          `📊 **Pyth Network EMA Price**\n\n` +
          `🪙 **Token:** ${tokenSymbol.toUpperCase()}\n` +
          `💰 **EMA Price:** $${emaPrice.toFixed(6)}\n\n` +
          `📈 *Price from Pyth Network Hermes*\n` +
          `⏰ *Real-time exponential moving average*`,
          { parse_mode: 'Markdown' }
        );

      } catch (error) {
        console.error('Error in pythprice command:', error);
        this.bot.sendMessage(chatId, `❌ Error fetching Pyth price: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // Pyth Test command - test all supported tokens
    this.bot.onText(/\/pythtest/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (!userId) return;

      try {
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }

        this.bot.sendMessage(chatId, '🧪 **Testing Pyth Service with all supported tokens...**');

        // Get the Pyth service
        const limitOrderService = this.oneInchService as any;
        const pythService = limitOrderService.pythService;
        
        if (!pythService) {
          this.bot.sendMessage(chatId, '❌ Pyth service not available.');
          return;
        }

        const supportedTokens = pythService.getSupportedTokens();
        let results = `🧪 **Pyth Service Test Results**\n\n`;
        results += `📋 **Supported tokens:** ${supportedTokens.length}\n\n`;

        for (const token of supportedTokens) {
          try {
            const price = await pythService.getEmaPrice(token);
            results += `✅ **${token}:** $${price.toFixed(6)}\n`;
          } catch (error) {
            results += `❌ **${token}:** Error - ${error instanceof Error ? error.message : 'Unknown'}\n`;
          }
        }

        results += `\n🎉 **Test completed!**`;
        this.bot.sendMessage(chatId, results, { parse_mode: 'Markdown' });

      } catch (error) {
        console.error('Error in pythtest command:', error);
        this.bot.sendMessage(chatId, `❌ Error running Pyth test: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // Pyth All command - get all prices at once
    this.bot.onText(/\/pythall/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (!userId) return;

      try {
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }

        this.bot.sendMessage(chatId, '📊 **Fetching all Pyth EMA prices...**');

        // Get the Pyth service
        const limitOrderService = this.oneInchService as any;
        const pythService = limitOrderService.pythService;
        
        if (!pythService) {
          this.bot.sendMessage(chatId, '❌ Pyth service not available.');
          return;
        }

        const supportedTokens = pythService.getSupportedTokens();
        const prices = await pythService.getMultipleEmaPrices(supportedTokens);

        let priceList = `📊 **All Pyth EMA Prices**\n\n`;
        priceList += `⏰ **Fetched:** ${new Date().toLocaleString()}\n\n`;

        prices.forEach((price: number, token: string) => {
          const icon = token === 'BTC' ? '₿' : 
                     token === 'ETH' ? '⚡' : 
                     token === 'USDC' ? '💰' : 
                     token === 'USDT' ? '💵' : '🪙';
          priceList += `${icon} **${token}:** $${price.toFixed(6)}\n`;
        });

        priceList += `\n💡 **Tip:** Use \`/pythprice [token]\` for individual prices`;

        this.bot.sendMessage(chatId, priceList, { parse_mode: 'Markdown' });

      } catch (error) {
        console.error('Error in pythall command:', error);
        this.bot.sendMessage(chatId, `❌ Error fetching all Pyth prices: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // Pyth Compare command - compare prices over time
    this.bot.onText(/\/pythcompare/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (!userId) return;

      try {
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }

        this.bot.sendMessage(chatId, '📊 **Comparing Pyth prices over time...**');

        // Get the Pyth service
        const limitOrderService = this.oneInchService as any;
        const pythService = limitOrderService.pythService;
        
        if (!pythService) {
          this.bot.sendMessage(chatId, '❌ Pyth service not available.');
          return;
        }

        const supportedTokens = pythService.getSupportedTokens();
        let comparison = `📊 **Pyth Price Comparison**\n\n`;

        // Get initial prices
        const initialPrices = await pythService.getMultipleEmaPrices(supportedTokens);
        comparison += `⏰ **Initial fetch:** ${new Date().toLocaleString()}\n\n`;

        for (const [token, price] of initialPrices) {
          comparison += `${token}: $${price.toFixed(6)}\n`;
        }

        this.bot.sendMessage(chatId, comparison + '\n⏳ **Waiting 10 seconds for second fetch...**', { parse_mode: 'Markdown' });

        // Wait 10 seconds
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Get second prices
        const secondPrices = await pythService.getMultipleEmaPrices(supportedTokens);
        
        let finalComparison = `📊 **Pyth Price Comparison Results**\n\n`;
        finalComparison += `⏰ **Second fetch:** ${new Date().toLocaleString()}\n\n`;

        for (const [token, secondPrice] of secondPrices) {
          const initialPrice = initialPrices.get(token) || 0;
          const change = secondPrice - initialPrice;
          const changePercent = initialPrice > 0 ? ((change / initialPrice) * 100) : 0;
          
          const arrow = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
          const sign = change > 0 ? '+' : '';
          
          finalComparison += `${arrow} **${token}:**\n`;
          finalComparison += `  Initial: $${initialPrice.toFixed(6)}\n`;
          finalComparison += `  Current: $${secondPrice.toFixed(6)}\n`;
          finalComparison += `  Change: ${sign}$${change.toFixed(6)} (${sign}${changePercent.toFixed(4)}%)\n\n`;
        }

        finalComparison += `💡 **Note:** Small changes are normal for EMA prices`;

        this.bot.sendMessage(chatId, finalComparison, { parse_mode: 'Markdown' });

      } catch (error) {
        console.error('Error in pythcompare command:', error);
        this.bot.sendMessage(chatId, `❌ Error comparing Pyth prices: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // Limit Orders command
    this.bot.onText(/\/limitorders/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (!userId) return;

      try {
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }


        this.bot.sendMessage(chatId, '📋 Fetching your active limit orders...');

        const chainId = 8453; // Base network
        const orders = await this.oneInchService.getLimitOrders(user.walletAddress, chainId);

        if (orders.length === 0) {
          this.bot.sendMessage(chatId, 
            '📭 **No Active Limit Orders**\n\n' +
            'You don\'t have any active limit orders.\n\n' +
            '**Create orders with:**\n' +
            '• `/limitbuy 1 ETH` - Buy ETH at EMA price\n' +
            '• `/limitsell 1 ETH` - Sell ETH at EMA price'
          );
          return;
        }

        let orderList = `📋 **Your Active Limit Orders** (${orders.length})\n\n`;
        
        orders.forEach((order, index) => {
          const orderId = order.hash || order.orderId || 'N/A';
          const shortOrderId = orderId !== 'N/A' ? orderId.substring(0, 10) + '...' : 'N/A';
          
          orderList += `**${index + 1}.** Order ID: \`${shortOrderId}\`\n`;
          orderList += `• Token: ${order.tokenSymbol || 'Unknown'}\n`;
          orderList += `• Amount: ${order.amount || 'N/A'} ${order.tokenSymbol || ''}\n`;
          orderList += `• Type: ${order.orderType || 'Unknown'}\n`;
          orderList += `• EMA Price: $${order.emaPrice ? order.emaPrice.toFixed(6) : 'N/A'}\n`;
          orderList += `• Limit Price: $${order.limitPrice ? order.limitPrice.toFixed(6) : 'N/A'}\n`;
          orderList += `• Status: Active\n`;
          orderList += `• Created: ${order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A'}\n`;
          orderList += `• Full ID: \`${orderId}\`\n\n`;
        });

        orderList += '\n💡 Use `/cancellimit [order_id]` to cancel an order';

        this.bot.sendMessage(chatId, orderList, { parse_mode: 'Markdown' });

      } catch (error) {
        console.error('Error in limitorders command:', error);
        this.bot.sendMessage(chatId, 'Error fetching limit orders. Please try again.');
      }
    });

    // Cancel limit order command
    this.bot.onText(/\/cancellimit (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (!userId || !match) return;

      try {

        const orderHash = match[1].trim();
        
        if (!orderHash) {
          this.bot.sendMessage(chatId, 
            '❌ **Invalid Command Format**\n\n' +
            '**Usage:** `/cancellimit [order_id]`\n\n' +
            '**Example:** `/cancellimit 0x27a7790747...`\n\n' +
            '💡 Use `/limitorders` to see your active orders and their IDs.'
          );
          return;
        }

        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }

        this.bot.sendMessage(chatId, `🗑️ Cancelling limit order ${orderHash.substring(0, 10)}...`);

        // Cancel the limit order
        const cancelled = await this.oneInchService.cancelLimitOrder(orderHash, user.encryptedPrivateKey);

        if (cancelled) {
          this.bot.sendMessage(chatId, 
            '✅ **Limit Order Cancelled!**\n\n' +
            `📝 Order ID: \`${orderHash.substring(0, 10)}...\`\n\n` +
            '💡 Use `/limitorders` to view your remaining active orders.'
          );
        } else {
          this.bot.sendMessage(chatId, 
            '❌ **Failed to Cancel Order**\n\n' +
            `Order \`${orderHash.substring(0, 10)}...\` could not be cancelled.\n\n` +
            '**Possible reasons:**\n' +
            '• Order ID not found\n' +
            '• Order already executed or expired\n' +
            '• Network error\n\n' +
            '💡 Use `/limitorders` to check your active orders.'
          );
        }

      } catch (error) {
        console.error('Error in cancellimit command:', error);
        this.bot.sendMessage(chatId, 'Error cancelling limit order. Please try again.');
      }
    });

    // Tokens command
    this.bot.onText(/\/tokens/, (msg) => {
      const chatId = msg.chat.id;
      
      let tokenList = '🪙 Supported Tokens:\n\n';
      
      Object.values(CHAIN_NAMES).forEach(chainName => {
        const chainId = Object.keys(CHAIN_NAMES).find(key => CHAIN_NAMES[parseInt(key)] === chainName);
        if (chainId) {
          const chainTokens = getTokensByChain(parseInt(chainId));
          if (chainTokens.length > 0) {
            tokenList += `**${chainName}:**\n`;
            chainTokens.forEach(token => {
              tokenList += `• ${token.symbol}\n`;
            });
            tokenList += '\n';
          }
        }
      });

      this.bot.sendMessage(chatId, tokenList, { parse_mode: 'Markdown' });
    });

    // Merit Eligibility command
    this.bot.onText(/\/meriteligibility/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (!userId) {
        this.bot.sendMessage(chatId, 'Error: User information not found.');
        return;
      }

      try {
        // Get user from database
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }

        // Check World ID verification before allowing merit eligibility check
        const isVerificationPassed = await checkWorldIdVerification(userId, chatId);
        if (!isVerificationPassed) {
          return; // Verification message already sent
        }

        // Show loading message
        this.bot.sendMessage(chatId, '🔍 Checking your merit eligibility...');

        // Check eligibility
        const eligibility = await this.meritEligibilityService.checkUserEligibility(userId);

        // Send the comprehensive eligibility message
        this.bot.sendMessage(chatId, eligibility.eligibilityMessage, { parse_mode: 'Markdown' });

        // If user is eligible, show additional success message
        if (eligibility.isEligible) {
          this.bot.sendMessage(chatId, 
            `🎉 **Congratulations!** You're eligible for the next merit drop!\n\n` +
            `Keep trading to maintain your position in the top ${eligibility.totalEligibleTraders} traders.`,
            { parse_mode: 'Markdown' }
          );
        }

      } catch (error) {
        console.error('Error checking merit eligibility:', error);
        this.bot.sendMessage(chatId, 
          'Error checking merit eligibility. Please try again later.\n\n' +
          'If this persists, the merit system may be temporarily unavailable.'
        );
      }
    });

    // Help command
    this.bot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      
      const helpText = `
🤖 **Trading Bot Help**

**Getting Started:**
1️⃣ /start - Create wallet or login
2️⃣ Start trading immediately! 🚀
3️⃣ /verify - Verify with World ID (for merit eligibility only)

**Trading Commands:**
/quote [amount] [token1] [token2] - Get live price quote + instant buy
/buy [token] [amount] - Buy tokens with USDC
/sell [amount] [token] [to_token] - Sell tokens
/balance - Show token balances
/orders - Check active/recent orders
/status [order_id] - Check specific order status

**🎯 Limit Orders (NEW!):**
/limitbuy [amount] [token] - Create limit buy order at Pyth EMA price
/limitsell [amount] [token] - Create limit sell order at Pyth EMA price
/limitorders - View your active limit orders
/cancellimit [order_id] - Cancel a limit order

**📊 Pyth Network Integration:**
/pythprice [token] - Get real-time EMA price from Pyth Network
• Supported tokens: BTC, ETH, USDC, USDT
• Powers limit order pricing
• 24/7 real-time price feeds

**🧪 Pyth Testing Commands:**
/pythtest - Test Pyth service with all supported tokens
/pythall - Get all Pyth EMA prices at once
/pythcompare - Compare Pyth prices over 10 seconds

**🤖 AI Agent Commands:**
/ai [message] - Chat with Hedera AI Agent for portfolio analysis and operations
/aihelp - Get detailed help about AI agent capabilities

**Wallet & Info:**
/wallet - Show wallet information
/tokens - Show supported tokens
/history - Show transaction history
/meriteligibility - Check Blockscout merit eligibility status (🌍 World ID required)
/blindex - 🥒 Black-Litterman model Index

**Quick Trading Workflow:**
1️⃣ \`/quote 10 USDC DEGEN\` - Get live price quote
2️⃣ Click "🚀 Buy Now" button - Execute trade instantly
3️⃣ \`/orders\` - Check if your trade executed
4️⃣ \`/balance\` - See updated balances

**🌍 World ID Verification (Merit Eligibility Only):**
• Required only for checking merit eligibility
• Proves you're a unique human for fair merit distribution
• No personal information required
• One verification per person globally
• Trading works without verification

**🤖 AI Agent Examples:**
\`/ai What's my current portfolio allocation?\`
\`/ai Submit my portfolio to Hedera topic 0.0.123456\`
\`/ai Create a new topic for storing messages\`
\`/ai Check user 123456 merit eligibility\`

**Examples:**
\`/quote 10 USDC DEGEN\` - Quote + instant buy option (Base)
\`/quote 50 USDC PEPE\` - Quote + instant buy (cross-chain)
\`/buy ETH 100\` - Traditional buy command
\`/sell 0.1 ETH USDC\` - Sell ETH for USDC

**Features:**
💱 Same-chain swaps via Fusion mode
🌉 Cross-chain swaps via 1inch Fusion+
🚀 One-click trading from quote responses
📊 Real-time order status tracking
💰 USDC on Base is the primary trading token
⚡ Base network offers lower fees
🏆 Merit eligibility for verified humans
🤖 AI-powered Hedera operations and portfolio management
      `;
      
      this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    });

    // AI Help command
    this.bot.onText(/\/aihelp/, (msg) => {
      const chatId = msg.chat.id;
      
      if (!this.hederaAgentService) {
        this.bot.sendMessage(chatId, '❌ AI Agent service is not available.');
        return;
      }
      
      const capabilities = this.hederaAgentService.getCapabilities();
      const suggestions = this.hederaAgentService.generateSuggestions();
      
      const helpText = `${capabilities}

**💡 Suggested Commands:**
${suggestions.map(s => `• "${s}"`).join('\n')}

**Usage:**
Send \`/ai [your message]\` to chat with the AI agent.

**Examples:**
\`/ai What's my portfolio allocation?\`
\`/ai Submit portfolio to topic 0.0.123456\`
\`/ai Create a topic for my data\`
\`/ai Check Hedera connectivity\``;
      
      this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    });

    // AI Chat command
    this.bot.onText(/\/ai (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const userMessage = match?.[1];

      if (!userId || !userMessage) {
        return;
      }

      if (!this.hederaAgentService) {
        this.bot.sendMessage(chatId, '❌ AI Agent service is not available. Please check that OpenAI API key is configured.');
        return;
      }

      try {
        const user = await this.db.getUser(userId);
        
        // Get or initialize chat history for this user
        let chatHistory = this.chatHistories.get(userId) || [];
        
        this.bot.sendAnimation(chatId, './cucumber_moped_processing.gif');

        // Prepare user context
        const userContext = user ? {
          userId: userId,
          username: msg.from?.username,
          accountId: user.walletAddress, // Using wallet address as account context
          isVerified: user.worldIdVerified
        } : {
          userId: userId,
          username: msg.from?.username,
          isVerified: false
        };

        // Process with AI agent
        const response = await this.hederaAgentService.processMessage(
          userMessage,
          chatHistory,
          userContext
        );

        // Update chat history
        chatHistory.push({ type: 'human', content: userMessage });
        chatHistory.push({ type: 'ai', content: response.output });
        
        // Limit chat history to last 20 messages
        if (chatHistory.length > 20) {
          chatHistory = chatHistory.slice(-20);
        }
        
        this.chatHistories.set(userId, chatHistory);

        // Send the AI response
        this.bot.sendMessage(chatId, response.output, { parse_mode: 'Markdown' });

        // Handle any transaction bytes or schedules
        if (response.transactionBytes) {
          this.bot.sendMessage(chatId, 
            '📝 **Transaction Prepared**\n\n' +
            'The AI agent has prepared a transaction for you. ' +
            'You would need to sign this with your wallet to execute it.\n\n' +
            '💡 This is a preview - full transaction signing integration coming soon!'
          );
        }

        if (response.scheduleId) {
          this.bot.sendMessage(chatId, 
            `📅 **Transaction Scheduled**\n\n` +
            `Schedule ID: \`${response.scheduleId}\`\n\n` +
            'The transaction has been scheduled on Hedera and is waiting for signatures.',
            { parse_mode: 'Markdown' }
          );
        }

        if (response.error) {
          this.bot.sendMessage(chatId, 
            `⚠️ **Note:** ${response.error}`
          );
        }

      } catch (error) {
        console.error('Error in AI chat:', error);
        this.bot.sendMessage(chatId, 
          '❌ Sorry, I encountered an error processing your request. Please try again or use /aihelp for guidance.'
        );
      }
    });

    // BLIndex command - CucumberMoped Index management with Hedera + Strategy
    this.bot.onText(/\/blindex/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (!userId) return;

      try {
        // Check if services are available
        if (!this.hederaService || !this.strategyService) {
          this.bot.sendMessage(chatId, 
            '❌ Hedera or Strategy service not available.\n\n' +
            'Please check that the bot is configured with both services.'
          );
          return;
        }

        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }

        const TESTNET_TOPIC_ID = '0.0.6089779';
        
        this.bot.sendMessage(chatId, '🥒 Black-Litterman Index Starting...\n\n🔍 Checking Hedera testnet topic...');

        // Log hashscan URL for debugging
        const hashscanUrl = `https://hashscan.io/testnet/topic/${TESTNET_TOPIC_ID}`;
        console.log(`🔗 HashScan URL for debugging: ${hashscanUrl}`);
        this.bot.sendMessage(chatId, `🔗 HashScan: ${hashscanUrl}`);

        let needsNewCalculation = false;
        let portfolio: any = null;

        // Step 1: Check if the specific testnet topic exists
        this.bot.sendMessage(chatId, `🔍 Checking if topic ${TESTNET_TOPIC_ID} exists on Hedera...`);
        
        try {
          const topicExists = await this.hederaService.topicExists(TESTNET_TOPIC_ID);
          
          if (!topicExists) {
            this.bot.sendMessage(chatId, 
              `❌ Topic ${TESTNET_TOPIC_ID} not found on Hedera testnet.\n\n` +
              `This topic may not exist yet or may be on a different network.`
            );
            return;
          }

          this.bot.sendMessage(chatId, `✅ Topic ${TESTNET_TOPIC_ID} found on Hedera testnet`);

        } catch (error) {
          console.error('Error checking topic existence:', error);
          this.bot.sendMessage(chatId, 
            `❌ Error checking topic existence: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          return;
        }

        // Step 2: Fetch the latest messages from the topic
        this.bot.sendMessage(chatId, '📥 Fetching latest messages from topic...');
        
        try {
          // Get the most recent messages (might be split across multiple messages)
          const recentMessages = await this.hederaService.getAllTopicMessages(TESTNET_TOPIC_ID, {
            limit: 10,  // Get last 10 messages to handle potential multi-part JSON
            order: 'desc'
          });

          if (recentMessages.length === 0) {
            this.bot.sendMessage(chatId, 
              `📭 No messages found in topic ${TESTNET_TOPIC_ID}.\n\n` +
              `The topic exists but has no messages yet.`
            );
            needsNewCalculation = true;
          } else {
            this.bot.sendMessage(chatId, 
              `📊 Found ${recentMessages.length} recent messages in topic.\n` +
              `Latest message age: ${((new Date().getTime() - recentMessages[0].consensusTimestamp.getTime()) / 60000).toFixed(1)} minutes`
            );

            // Step 3: Check age of the latest message
            const latestMessage = recentMessages[0];
            const messageAge = new Date().getTime() - latestMessage.consensusTimestamp.getTime();
            const ageInMinutes = messageAge / (1000 * 60);

            console.log(`🕒 Latest message age: ${ageInMinutes.toFixed(1)} minutes`);

            if (ageInMinutes > 10) {
              this.bot.sendMessage(chatId, 
                `⏰ Latest message is ${ageInMinutes.toFixed(1)} minutes old (>10 minutes).\n` +
                `Calculating new Black-Litterman allocations...`
              );
              needsNewCalculation = true;
            } else {
              this.bot.sendMessage(chatId, 
                `✅ Recent message found (${ageInMinutes.toFixed(1)} minutes old).\n` +
                `Parsing portfolio data...`
              );

              // Step 4: Parse the latest message(s) - handle multi-part JSON
              try {
                // Try to parse the latest message as JSON first
                let combinedJsonString = latestMessage.contents;
                
                try {
                  JSON.parse(combinedJsonString);
                  // If parsing succeeds, we have a complete JSON
                } catch (parseError) {
                  // If parsing fails, try to combine with subsequent messages
                  this.bot.sendMessage(chatId, '🔗 Message appears to be multi-part, combining...');
                  
                  // Find consecutive messages that might form a complete JSON
                  const consecutiveMessages: typeof recentMessages = [latestMessage];
                  
                  // Look for previous messages that might be part of the same JSON
                  // (assuming they are posted close in time)
                  const timeThreshold = 60000; // 1 minute
                  for (let i = 1; i < recentMessages.length; i++) {
                    const timeDiff = latestMessage.consensusTimestamp.getTime() - recentMessages[i].consensusTimestamp.getTime();
                    if (timeDiff <= timeThreshold) {
                      consecutiveMessages.push(recentMessages[i]);
                    } else {
                      break;
                    }
                  }

                  // Sort by sequence number and combine
                  consecutiveMessages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
                  combinedJsonString = this.hederaService.combineSequentialMessages(consecutiveMessages);
                  
                  this.bot.sendMessage(chatId, 
                    `🔗 Combined ${consecutiveMessages.length} messages into ${combinedJsonString.length} characters`
                  );
                }

                // Parse the combined JSON
                const messageData = JSON.parse(combinedJsonString);
                
                if (messageData.type === 'portfolio_allocation' && messageData.allocations) {
                  portfolio = {
                    allocations: messageData.allocations || [],
                    totalMarketCap: messageData.total_market_cap || messageData.totalMarketCap || 0,
                    timestamp: messageData.timestamp || new Date().toISOString()
                  };
                  
                  this.bot.sendMessage(chatId, 
                    `✅ Successfully parsed portfolio data:\n` +
                    `• ${portfolio.allocations.length} allocations\n` +
                    `• Total market cap: $${(portfolio.totalMarketCap / 1e9).toFixed(2)}B\n` +
                    `• Data timestamp: ${new Date(portfolio.timestamp).toLocaleString()}`
                  );
                } else {
                  this.bot.sendMessage(chatId, 
                    `⚠️ Message found but doesn't contain valid portfolio allocation data.\n` +
                    `Message type: ${messageData.type || 'unknown'}`
                  );
                  needsNewCalculation = true;
                }

              } catch (parseError) {
                console.error('Error parsing message data:', parseError);
                this.bot.sendMessage(chatId, 
                  `⚠️ Error parsing message data: ${parseError instanceof Error ? parseError.message : 'Unknown error'}\n` +
                  `Calculating fresh allocations...`
                );
                needsNewCalculation = true;
              }
            }
          }

        } catch (error) {
          console.error('Error fetching messages from topic:', error);
          this.bot.sendMessage(chatId, 
            `❌ Error fetching messages: ${error instanceof Error ? error.message : 'Unknown error'}\n` +
            `Will calculate new allocations...`
          );
          needsNewCalculation = true;
        }

        // Step 5: Calculate new allocations if needed
        if (needsNewCalculation) {
          this.bot.sendMessage(chatId, '🧮 Calculating new Black-Litterman allocations...');
          
          try {
            const { portfolio: newPortfolio, hederaMessage } = await this.strategyService.getPortfolioAllocation();
            portfolio = newPortfolio;

            // Submit to the testnet topic
            this.bot.sendMessage(chatId, `📝 Posting new allocations to topic ${TESTNET_TOPIC_ID}...`);
            
            // Note: This might require splitting the message if it's too large
            const maxMessageSize = 1024; // Hedera message size limit
            
            if (hederaMessage.length > maxMessageSize) {
              this.bot.sendMessage(chatId, 
                `📏 Message is ${hederaMessage.length} chars, splitting into multiple parts...`
              );
              
              // Split message into chunks
              const chunks: string[] = [];
              for (let i = 0; i < hederaMessage.length; i += maxMessageSize) {
                chunks.push(hederaMessage.slice(i, i + maxMessageSize));
              }

              // Submit each chunk
              for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const sequenceNumber = await this.hederaService.submitMessage(TESTNET_TOPIC_ID, chunk);
                console.log(`📤 Submitted chunk ${i + 1}/${chunks.length} with sequence: ${sequenceNumber}`);
                
                // Wait a bit between messages
                await new Promise(resolve => setTimeout(resolve, 1000));
              }

              this.bot.sendMessage(chatId, 
                `✅ Split message into ${chunks.length} parts and submitted to Hedera`
              );
            } else {
              const sequenceNumber = await this.hederaService.submitMessage(TESTNET_TOPIC_ID, hederaMessage);
              this.bot.sendMessage(chatId, 
                `✅ New allocations posted (sequence: ${sequenceNumber})`
              );
            }

          } catch (error) {
            console.error('Error calculating or posting allocations:', error);
            this.bot.sendMessage(chatId, 
              `❌ Error calculating allocations: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            return;
          }
        }

        // Step 6: Generate and send comprehensive overview
        if (portfolio && portfolio.allocations && portfolio.allocations.length > 0) {
          try {
            // Create overview
            const overview = this.strategyService.createIndexOverview(portfolio, needsNewCalculation);
            
            // Create allocation chart
            const chart = this.strategyService.generateAllocationChart(portfolio);
            
            // Send overview
            this.bot.sendMessage(chatId, overview, { parse_mode: 'Markdown' });
            
            // Send chart in monospace for better formatting
            this.bot.sendMessage(chatId, `\`\`\`\n${chart}\n\`\`\``, { parse_mode: 'Markdown' });
            
            // Summary stats
            const summary = this.strategyService.getPortfolioSummary(portfolio);
            this.bot.sendMessage(chatId, summary);

            // Final status with debugging info
            this.bot.sendMessage(chatId, 
              `🎉 Black-Litterman Index Update Complete!\n\n` +
              `📊 Topic ID: \`${TESTNET_TOPIC_ID}\`\n` +
              `🔗 HashScan: ${hashscanUrl}\n` +
              //`💰 Total Market Cap: $${(portfolio.totalMarketCap / 1e9).toFixed(2)}B\n` +
              `🎯 Active Allocations: ${portfolio.allocations.length}\n` +
              `⏰ Data Age: ${needsNewCalculation ? 'Just calculated' : 'Recent (under 10 min)'}\n` +
              `🔄 Next Update: ${needsNewCalculation ? 'Available now' : 'In 10+ minutes'}\n\n` +
              `Use /blindex again to refresh the index!`,
              { parse_mode: 'Markdown' }
            );

          } catch (error) {
            console.error('Error generating overview:', error);
            this.bot.sendMessage(chatId, 
              `❌ Error generating overview: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        } else {
          this.bot.sendMessage(chatId, 
            '❌ No portfolio data available. Please try again.\n\n' +
            `Debug info: Topic ${TESTNET_TOPIC_ID} exists but contains no valid portfolio data.`
          );
        }

      } catch (error) {
        console.error('Error in testIndex command:', error);
        this.bot.sendMessage(chatId, 
          `❌ Error running index test: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    // Orders command - check active orders
    this.bot.onText(/\/orders/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (!userId) return;

      try {
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }

        this.bot.sendMessage(chatId, '🔍 Checking your active orders...');

        // Get active orders from 1inch
        const activeOrders = await this.oneInchService.getActiveOrders(user.walletAddress);
        
        // Get recent transactions from database
        const recentTransactions = await this.db.getTransactionHistory(userId, 10);

        let orderText = '📋 Your Orders:\n\n';

        if (activeOrders.length > 0) {
          orderText += '**Active Orders:**\n';
          for (const order of activeOrders.slice(0, 5)) {
            orderText += `• ID: ${order.orderHash || order.id || 'Unknown'}\n`;
            orderText += `  Status: ${order.status || 'pending'}\n`;
            orderText += `  Created: ${order.createDateTime || 'Unknown'}\n\n`;
          }
        }

        if (recentTransactions.length > 0) {
          orderText += '**Recent Transactions:**\n';
          for (const tx of recentTransactions.slice(0, 5)) {
            const date = new Date(tx.createdAt).toLocaleDateString();
            orderText += `• ${tx.type.toUpperCase()}: ${tx.id.substring(0, 10)}...\n`;
            orderText += `  Status: ${tx.status}\n`;
            orderText += `  Date: ${date}\n\n`;
          }
        }

        if (activeOrders.length === 0 && recentTransactions.length === 0) {
          orderText += 'No orders found.\n\nTry making a trade with /quote command!';
        }

        this.bot.sendMessage(chatId, orderText, { parse_mode: 'Markdown' });

      } catch (error) {
        console.error('Error checking orders:', error);
        this.bot.sendMessage(chatId, 'Error checking orders. Please try again.');
      }
    });

    // Status command - check specific order
    this.bot.onText(/\/status (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const orderId = match?.[1];

      if (!userId || !orderId) return;

      try {
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }

        this.bot.sendMessage(chatId, `🔍 Checking order status: ${orderId.substring(0, 10)}...`);

        // Check order status via 1inch API
        const status = await this.oneInchService.getOrderStatus(orderId);
        
        // Also check database
        const dbTransaction = await this.db.getTransactionById(orderId);

        let statusText = `📊 Order Status: ${orderId.substring(0, 20)}...\n\n`;
        
        if (status && status !== 'unknown') {
          statusText += `**1inch Status:** ${status}\n`;
        }
        
        if (dbTransaction) {
          statusText += `**Database Status:** ${dbTransaction.status}\n`;
          statusText += `**Type:** ${dbTransaction.type}\n`;
          statusText += `**Chain:** ${CHAIN_NAMES[dbTransaction.chainId] || dbTransaction.chainId}\n`;
          statusText += `**Created:** ${new Date(dbTransaction.createdAt).toLocaleString()}\n`;
          if (dbTransaction.txHash) {
            statusText += `**Tx Hash:** ${dbTransaction.txHash.substring(0, 20)}...\n`;
          }
        }

        if (!status || status === 'unknown' && !dbTransaction) {
          statusText += 'Order not found in 1inch or database.\n\n';
          statusText += '💡 This might be a simulated order from fallback API.';
        }

        this.bot.sendMessage(chatId, statusText, { parse_mode: 'Markdown' });

      } catch (error) {
        console.error('Error checking order status:', error);
        this.bot.sendMessage(chatId, `Error checking order status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // Handle callback queries (button presses)
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message?.chat.id;
      const userId = query.from.id;
      const data = query.data;

      if (!chatId || !data) return;

      // Helper function to safely answer callback queries
      const safeAnswerCallbackQuery = async (text: string, showAlert = false) => {
        try {
          await this.bot.answerCallbackQuery(query.id, { text, show_alert: showAlert });
        } catch (error: any) {
          // Ignore timeout errors to prevent crashes
          if (error?.code === 'ETELEGRAM' && error?.response?.body?.description?.includes('query is too old')) {
            console.log('Callback query expired, ignoring timeout error');
            return;
          }
          console.error('Error answering callback query:', error);
        }
      };

      if (data === 'cancel') {
        try {
          await this.bot.editMessageText('❌ Operation cancelled.', {
            chat_id: chatId,
            message_id: query.message?.message_id
          });
          await safeAnswerCallbackQuery('Operation cancelled');
        } catch (error) {
          console.error('Error handling cancel callback:', error);
        }
        return;
      }

      // World ID verification callbacks
      if (data === 'start_verification') {
        try {
          if (!this.worldIdService) {
            await safeAnswerCallbackQuery('World ID service not available');
            return;
          }

          const instructions = this.worldIdService.generateTelegramInstructions(userId);
          const verificationUrl = await this.worldIdService.generateWorldIdUrl(userId);
          
          const verifyKeyboard = {
            inline_keyboard: [
              [
                { text: '🌍 Open Verification App', web_app: { url: process.env.MINIAPP_URL || 'http://localhost:3001' } }
              ],
              [
                { text: '✅ I completed verification', callback_data: `worldid_completed_${userId}` }
              ],
              [
                { text: '❓ Help', callback_data: `worldid_help_${userId}` }
              ]
            ]
          };

          await this.bot.sendMessage(chatId, 
            instructions + `\n\n🔗 **Verification Link:**\n\`${verificationUrl}\`\n\nClick the button above to verify your humanity!`, { 
            parse_mode: 'Markdown',
            reply_markup: verifyKeyboard
          });

          await safeAnswerCallbackQuery('Verification process started!');

        } catch (error) {
          console.error('Error starting verification:', error);
          await safeAnswerCallbackQuery('Error starting verification');
        }
        return;
      }

      // Handle new verification check callbacks
      if (data.startsWith('worldid_check_')) {
        try {
          if (!this.worldIdService) {
            await safeAnswerCallbackQuery('World ID service not available');
            return;
          }

          await safeAnswerCallbackQuery('Checking verification...');

          // Check user's verification status
          const verificationResult = await this.worldIdService.checkAndVerifyUser(userId);
          
          if (verificationResult.success) {
            await this.bot.editMessageText(
              '✅ **Verification Successful!**\n\n' +
              'Your wallet is verified with World ID! You can now use all trading features.\n\n' +
              '🎉 Welcome to human-verified trading! 🎉\n\n' +
              'Try these commands:\n' +
              '• `/balance` - Check your balances\n' +
              '• `/buy ETH 100` - Buy tokens with USDC\n' +
              '• `/quote PEPE 50` - Get price quotes',
              {
                chat_id: chatId,
                message_id: query.message?.message_id,
                parse_mode: 'Markdown'
              }
            );
          } else {
            await this.bot.editMessageText(
              '❌ **Verification Not Found**\n\n' +
              'Your wallet is not yet verified with World ID.\n\n' +
              '**To get verified:**\n' +
              '1. Download World App from worldcoin.org\n' +
              '2. Complete the verification process\n' +
              '3. Return here and click "Check my verification" again\n\n' +
              `**Error:** ${verificationResult.error || 'Verification failed'}`,
              {
                chat_id: chatId,
                message_id: query.message?.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '📱 Download World App', url: 'https://worldcoin.org/download' }
                    ],
                    [
                      { text: '🔄 Check again', callback_data: `worldid_check_${userId}` }
                    ]
                  ]
                }
              }
            );
          }

        } catch (error) {
          console.error('Error checking verification:', error);
          await safeAnswerCallbackQuery('Error checking verification status');
        }
        return;
      }

      // Handle help callback
      if (data.startsWith('worldid_help_')) {
        try {
          const helpText = `🌍 **World ID Help**

**What is World ID?**
World ID is a privacy-preserving digital identity that proves you're a unique human without revealing personal information.

**How to get verified:**
1. **Download World App** from worldcoin.org
2. **Find an Orb location** or use device verification
3. **Complete verification** (takes 2-5 minutes)
4. **Return here** and click "Check my verification"

**Why do we require this?**
• Prevents bot abuse and spam
• Ensures fair access for real humans
• No personal data required - just proof of humanhood
• One verification per person globally

**Trouble?**
• Visit worldcoin.org for support
• Check World App for verification status
• Make sure you completed the full process

Ready to verify? Download World App! 🚀`;

          await this.bot.editMessageText(helpText, {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📱 Download World App', url: 'https://worldcoin.org/download' }
                ],
                [
                  { text: '↩️ Back to verification', callback_data: 'start_verification' }
                ]
              ]
            }
          });

          await safeAnswerCallbackQuery('Here\'s how World ID works!');
        } catch (error) {
          console.error('Error showing help:', error);
          await safeAnswerCallbackQuery('Error showing help');
        }
        return;
      }

      // Legacy check_verification callback (redirect to new flow)
      if (data === 'check_verification') {
        try {
          if (!this.worldIdService) {
            await safeAnswerCallbackQuery('World ID service not available');
            return;
          }

          // Redirect to new verification check
          await safeAnswerCallbackQuery('Checking verification...');
          
          const verificationResult = await this.worldIdService.checkAndVerifyUser(userId);
          
          if (verificationResult.success) {
            await this.bot.editMessageText(
              '✅ **Verification Successful!**\n\n' +
              'You are now verified with World ID and can use all trading features.\n\n' +
              '🎉 Welcome to the future of human-verified trading! 🎉\n\n' +
              'Try these commands:\n' +
              '• `/quote 10 USDC ETH` - Get price quotes\n' +
              '• `/buy ETH 100` - Buy tokens\n' +
              '• `/balance` - Check your balances',
              {
                chat_id: chatId,
                message_id: query.message?.message_id,
                parse_mode: 'Markdown'
              }
            );
          } else {
            await safeAnswerCallbackQuery('Verification not found. Please complete the World ID process first.', true);
          }

        } catch (error) {
          console.error('Error checking verification:', error);
          await safeAnswerCallbackQuery('Error checking verification status');
        }
        return;
      }

      if (data.startsWith('confirm_buy_')) {
        try {
          const quoteParamsJson = data.replace('confirm_buy_', '');
          const quoteParams: OneInchQuoteParams = JSON.parse(quoteParamsJson);
          
          const user = await this.db.getUser(userId);
          if (!user) {
            await safeAnswerCallbackQuery('User not found!');
            return;
          }

          // Place order
          const orderResult = await this.oneInchService.placeOrder(
            quoteParams,
            user.encryptedPrivateKey
          );

          // Save transaction to database
          const transaction = {
            id: orderResult.orderId,
            userId: userId,
            type: 'swap' as const,
            fromToken: quoteParams.srcTokenAddress,
            toToken: quoteParams.dstTokenAddress,
            fromAmount: quoteParams.amount,
            chainId: quoteParams.srcChainId,
            status: 'pending' as const,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          await this.db.createTransaction(transaction);

          await this.bot.editMessageText(
            `✅ Purchase order submitted!\n\n` +
            `Order ID: ${orderResult.orderId}\n` +
            `Status: ${orderResult.status}\n\n` +
            `You'll receive a notification when the trade is complete.`,
            {
              chat_id: chatId,
              message_id: query.message?.message_id
            }
          );

        } catch (error) {
          console.error('Error confirming buy:', error);
          await safeAnswerCallbackQuery('Error submitting order!');
        }
      }

      if (data.startsWith('buy_')) {
        try {
          const quoteId = data.replace('buy_', '');
          const quoteParams = this.quoteStorage.get(quoteId);
          
          if (!quoteParams) {
            await safeAnswerCallbackQuery('Quote expired! Get a new quote.');
            await this.bot.editMessageText(
              `❌ Quote Expired\n\n` +
              `This quote has expired. Please use /buy to get a fresh quote.`,
              {
                chat_id: chatId,
                message_id: query.message?.message_id
              }
            );
            return;
          }

          const user = await this.db.getUser(userId);
          if (!user) {
            await safeAnswerCallbackQuery('User not found!');
            return;
          }

          // Acknowledge the callback immediately
          await safeAnswerCallbackQuery('Executing purchase...');

          // Update message to show processing
          await this.bot.editMessageText(
            `⏳ Executing purchase...\n\n` +
            `Please wait while we process your transaction.`,
            {
              chat_id: chatId,
              message_id: query.message?.message_id
            }
          );

          // Execute the trade
          const orderResult = await this.oneInchService.placeOrder(
            quoteParams,
            user.encryptedPrivateKey
          );

          // Save transaction to database
          const transaction = {
            id: orderResult.orderId,
            userId: userId,
            type: 'swap' as const,
            fromToken: quoteParams.srcTokenAddress,
            toToken: quoteParams.dstTokenAddress,
            fromAmount: quoteParams.amount,
            chainId: quoteParams.srcChainId,
            status: 'pending' as const,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          await this.db.createTransaction(transaction);

          // Get token info for display
          const fromTokenInfo = SUPPORTED_TOKENS.find(t => 
            t.address.toLowerCase() === quoteParams.srcTokenAddress.toLowerCase() && 
            t.chainId === quoteParams.srcChainId
          );
          const toTokenInfo = SUPPORTED_TOKENS.find(t => 
            t.address.toLowerCase() === quoteParams.dstTokenAddress.toLowerCase() && 
            t.chainId === quoteParams.dstChainId
          );

          const fromAmount = fromTokenInfo ? 
            ethers.formatUnits(quoteParams.amount, fromTokenInfo.decimals) : 
            'Unknown';

          // Clean up the stored quote
          this.quoteStorage.delete(quoteId);

          await this.bot.editMessageText(
            `✅ Purchase Executed Successfully!\n\n` +
            `Bought: ${toTokenInfo?.symbol || 'Unknown'}\n` +
            `With: ${fromAmount} ${fromTokenInfo?.symbol || 'Unknown'}\n` +
            `Network: ${CHAIN_NAMES[quoteParams.srcChainId] || 'Unknown'}\n\n` +
            `Order ID: ${orderResult.orderId}\n` +
            `Status: ${orderResult.status}\n\n` +
            `🎉 Your purchase has been submitted to the blockchain!`,
            {
              chat_id: chatId,
              message_id: query.message?.message_id
            }
          );

        } catch (error) {
          console.error('Error executing buy trade:', error);
          
          await this.bot.editMessageText(
            `❌ Purchase Failed\n\n` +
            `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
            `Please try getting a new quote with /buy command.`,
            {
              chat_id: chatId,
              message_id: query.message?.message_id
            }
          );
        }
      }

      if (data.startsWith('quote_')) {
        try {
          const quoteId = data.replace('quote_', '');
          const quoteParams = this.quoteStorage.get(quoteId);
          
          if (!quoteParams) {
            await safeAnswerCallbackQuery('Quote expired! Get a new quote.');
            await this.bot.editMessageText(
              `❌ Quote Expired\n\n` +
              `This quote has expired. Please use /quote to get a fresh quote.`,
              {
                chat_id: chatId,
                message_id: query.message?.message_id
              }
            );
            return;
          }

          const user = await this.db.getUser(userId);
          if (!user) {
            await safeAnswerCallbackQuery('User not found!');
            return;
          }

          // Acknowledge the callback immediately
          await safeAnswerCallbackQuery('Executing trade...');

          // Update message to show processing
          await this.bot.editMessageText(
            `⏳ Executing trade...\n\n` +
            `Please wait while we process your transaction.`,
            {
              chat_id: chatId,
              message_id: query.message?.message_id
            }
          );

          // Execute the trade
          const orderResult = await this.oneInchService.placeOrder(
            quoteParams,
            user.encryptedPrivateKey
          );

          // Save transaction to database
          const transaction = {
            id: orderResult.orderId,
            userId: userId,
            type: 'swap' as const,
            fromToken: quoteParams.srcTokenAddress,
            toToken: quoteParams.dstTokenAddress,
            fromAmount: quoteParams.amount,
            chainId: quoteParams.srcChainId,
            status: 'pending' as const,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          await this.db.createTransaction(transaction);

          // Get token info for display
          const fromTokenInfo = SUPPORTED_TOKENS.find(t => 
            t.address.toLowerCase() === quoteParams.srcTokenAddress.toLowerCase() && 
            t.chainId === quoteParams.srcChainId
          );
          const toTokenInfo = SUPPORTED_TOKENS.find(t => 
            t.address.toLowerCase() === quoteParams.dstTokenAddress.toLowerCase() && 
            t.chainId === quoteParams.dstChainId
          );

          const fromAmount = fromTokenInfo ? 
            ethers.formatUnits(quoteParams.amount, fromTokenInfo.decimals) : 
            'Unknown';

          // Clean up the stored quote
          this.quoteStorage.delete(quoteId);

          await this.bot.editMessageText(
            `✅ Trade Executed Successfully!\n\n` +
            `Swapped: ${fromAmount} ${fromTokenInfo?.symbol || 'Unknown'}\n` +
            `For: ${toTokenInfo?.symbol || 'Unknown'}\n` +
            `Network: ${CHAIN_NAMES[quoteParams.srcChainId] || 'Unknown'}\n\n` +
            `Order ID: ${orderResult.orderId}\n` +
            `Status: ${orderResult.status}\n\n` +
            `🎉 Your trade has been submitted to the blockchain!`,
            {
              chat_id: chatId,
              message_id: query.message?.message_id
            }
          );

        } catch (error) {
          console.error('Error executing quote trade:', error);
          
          await this.bot.editMessageText(
            `❌ Trade Failed\n\n` +
            `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
            `Please try getting a new quote with /quote command.`,
            {
              chat_id: chatId,
              message_id: query.message?.message_id
            }
          );
        }
      }

      // Handle verification completion callbacks
      if (data.startsWith('worldid_completed_')) {
        try {
          if (!this.worldIdService) {
            await safeAnswerCallbackQuery('World ID service not available');
            return;
          }

          await safeAnswerCallbackQuery('Checking verification...');

          // Check user's verification status
          const verificationResult = await this.worldIdService.checkAndVerifyUser(userId);
          
          if (verificationResult.success) {
            await this.bot.editMessageText(
              '✅ **Verification Successful!**\n\n' +
              'Your identity is verified with World ID! You can now use all trading features.\n\n' +
              '🎉 Welcome to human-verified trading! 🎉\n\n' +
              'Try these commands:\n' +
              '• `/balance` - Check your balances\n' +
              '• `/buy ETH 100` - Buy tokens with USDC\n' +
              '• `/quote PEPE 50` - Get price quotes',
              {
                chat_id: chatId,
                message_id: query.message?.message_id,
                parse_mode: 'Markdown'
              }
            );
          } else {
            // Try to find verification directly from database first
            const isVerified = await this.worldIdService.isUserVerified(userId);
            
            if (isVerified) {
              // User is verified but checkAndVerifyUser failed - still show success
              await this.bot.editMessageText(
                '✅ **Verification Successful!**\n\n' +
                'Your identity is verified with World ID! You can now use all trading features.\n\n' +
                '🎉 Welcome to human-verified trading! 🎉\n\n' +
                'Try these commands:\n' +
                '• `/balance` - Check your balances\n' +
                '• `/buy ETH 100` - Buy tokens with USDC\n' +
                '• `/quote PEPE 50` - Get price quotes',
                {
                  chat_id: chatId,
                  message_id: query.message?.message_id,
                  parse_mode: 'Markdown'
                }
              );
            } else {
              // Create new message instead of editing to avoid "not modified" error
              const errorMessage = 
                '❌ **Verification Not Found**\n\n' +
                'Your verification is not yet complete.\n\n' +
                '**To complete verification:**\n' +
                '1. Use the Mini App button above to verify\n' +
                '2. Complete the World ID verification process\n' +
                '3. Return here and click "I completed verification" again\n\n' +
                `**Status:** ${verificationResult.error || 'Verification pending'}\n\n` +
                '💡 **Tip:** Make sure you complete the verification in the Mini App first!';

              // Send a new message instead of editing
              await this.bot.sendMessage(chatId, errorMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '🌍 Open Verification App', web_app: { url: process.env.MINIAPP_URL || 'http://localhost:3001' } }
                    ],
                    [
                      { text: '🔄 Check again', callback_data: `worldid_completed_${userId}` }
                    ],
                    [
                      { text: '❓ Need help?', callback_data: `worldid_help_${userId}` }
                    ]
                  ]
                }
              });
              
              // Also log the verification error for debugging
              console.log(`🐛 DEBUG: Verification failed for user ${userId} with error: ${verificationResult.error}`);
            }
          }

        } catch (error) {
          console.error('Error checking verification:', error);
          await safeAnswerCallbackQuery('Error checking verification status');
        }
        return;
      }

      // Legacy fallback for old confirm_buy_ callbacks (graceful degradation)
      if (data.startsWith('confirm_buy_')) {
        try {
          await safeAnswerCallbackQuery('This quote has expired. Please use /buy to get a fresh quote.');
          await this.bot.editMessageText(
            `❌ Quote Expired\n\n` +
            `This quote format is no longer supported. Please use /buy to get a fresh quote.`,
            {
              chat_id: chatId,
              message_id: query.message?.message_id
            }
          );
        } catch (error) {
          console.error('Error handling legacy confirm_buy:', error);
          await safeAnswerCallbackQuery('Please use /buy to get a fresh quote.');
        }
        return;
      }

      if (data.startsWith('buy_')) {
        try {
          const quoteId = data.replace('buy_', '');
          const quoteParams = this.quoteStorage.get(quoteId);
          
          if (!quoteParams) {
            await safeAnswerCallbackQuery('Quote expired! Get a new quote.');
            await this.bot.editMessageText(
              `❌ Quote Expired\n\n` +
              `This quote has expired. Please use /buy to get a fresh quote.`,
              {
                chat_id: chatId,
                message_id: query.message?.message_id
              }
            );
            return;
          }

          const user = await this.db.getUser(userId);
          if (!user) {
            await safeAnswerCallbackQuery('User not found!');
            return;
          }

          // Acknowledge the callback immediately
          await safeAnswerCallbackQuery('Executing purchase...');

          // Update message to show processing
          await this.bot.editMessageText(
            `⏳ Executing purchase...\n\n` +
            `Please wait while we process your transaction.`,
            {
              chat_id: chatId,
              message_id: query.message?.message_id
            }
          );

          // Execute the trade
          const orderResult = await this.oneInchService.placeOrder(
            quoteParams,
            user.encryptedPrivateKey
          );

          // Save transaction to database
          const transaction = {
            id: orderResult.orderId,
            userId: userId,
            type: 'swap' as const,
            fromToken: quoteParams.srcTokenAddress,
            toToken: quoteParams.dstTokenAddress,
            fromAmount: quoteParams.amount,
            chainId: quoteParams.srcChainId,
            status: 'pending' as const,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          await this.db.createTransaction(transaction);

          // Get token info for display
          const fromTokenInfo = SUPPORTED_TOKENS.find(t => 
            t.address.toLowerCase() === quoteParams.srcTokenAddress.toLowerCase() && 
            t.chainId === quoteParams.srcChainId
          );
          const toTokenInfo = SUPPORTED_TOKENS.find(t => 
            t.address.toLowerCase() === quoteParams.dstTokenAddress.toLowerCase() && 
            t.chainId === quoteParams.dstChainId
          );

          const fromAmount = fromTokenInfo ? 
            ethers.formatUnits(quoteParams.amount, fromTokenInfo.decimals) : 
            'Unknown';

          // Clean up the stored quote
          this.quoteStorage.delete(quoteId);

          await this.bot.editMessageText(
            `✅ Purchase Executed Successfully!\n\n` +
            `Bought: ${toTokenInfo?.symbol || 'Unknown'}\n` +
            `With: ${fromAmount} ${fromTokenInfo?.symbol || 'Unknown'}\n` +
            `Network: ${CHAIN_NAMES[quoteParams.srcChainId] || 'Unknown'}\n\n` +
            `Order ID: ${orderResult.orderId}\n` +
            `Status: ${orderResult.status}\n\n` +
            `🎉 Your purchase has been submitted to the blockchain!`,
            {
              chat_id: chatId,
              message_id: query.message?.message_id
            }
          );

        } catch (error) {
          console.error('Error executing buy trade:', error);
          
          await this.bot.editMessageText(
            `❌ Purchase Failed\n\n` +
            `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
            `Please try getting a new quote with /buy command.`,
            {
              chat_id: chatId,
              message_id: query.message?.message_id
            }
          );
        }
      }
    });

    // Buy by contract command
    this.bot.onText(/\/buycontract (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const input = match?.[1];

      if (!userId || !input) return;

      try {
        const user = await this.db.getUser(userId);
        if (!user) {
          this.bot.sendMessage(chatId, 'You are not registered yet. Use /start to begin.');
          return;
        }

        const parts = input.split(' ');
        if (parts.length !== 3) {
          this.bot.sendMessage(chatId, 
            'Invalid command format. Use:\n' +
            '• `/buycontract 0x123... 100 USDC` - Buy token at contract address with 100 USDC\n\n' +
            '💡 Base network is recommended for lower fees!'
          );
          return;
        }

        const [contractAddress, amount, fromSymbol] = parts;
        const chainId = 8453; // Default to Base

        // Get from token information
        const fromToken = getTokenBySymbol(fromSymbol.toUpperCase(), chainId);
        if (!fromToken) {
          this.bot.sendMessage(chatId, `❌ Token ${fromSymbol.toUpperCase()} not found on Base network.`);
          return;
        }

        this.bot.sendMessage(chatId, `🔍 Buying token at ${contractAddress} with ${amount} ${fromSymbol.toUpperCase()}...`);

        // Call buyTokenByContract
        const result = await this.blockchainService?.buyTokenByContract(
          chainId,
          contractAddress,
          amount,
          user.walletAddress,
          user.encryptedPrivateKey
        );

        if (result) {
          this.bot.sendMessage(chatId,
            `✅ **Token Purchase Successful!**\n\n` +
            `📊 **Transaction Details:**\n` +
            `• Contract: \`${contractAddress}\`\n` +
            `• Amount: ${amount} ${fromSymbol.toUpperCase()}\n` +
            `• Tx Hash: \`${result.txHash}\`\n\n` +
            `🔗 [View on Blockscout](${this.blockchainService?.getExplorerUrl(chainId, result.txHash)})\n\n` +
            `Token has been added to supported tokens list.`,
            { parse_mode: 'Markdown' }
          );
        } else {
          this.bot.sendMessage(chatId, '❌ Failed to buy token. Please try again.');
        }

      } catch (error) {
        console.error('Error in buycontract command:', error);
        this.bot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  public start(): void {
    console.log('Telegram bot started...');
  }

  public stop(): void {
    this.bot.stopPolling();
    console.log('Telegram bot stopped.');
  }
}
