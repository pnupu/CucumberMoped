import TelegramBot from 'node-telegram-bot-api';
import { DatabaseService } from './DatabaseService';
import { WalletService } from './WalletService';
import { BlockchainService } from './BlockchainService';
import { WorldIdService } from './WorldIdService';
import { IOneInchService, OneInchQuoteParams } from '../types';

import { getTokenBySymbol, getTokensByChain, CHAIN_NAMES, SUPPORTED_TOKENS } from '../config/tokens';
import { ethers } from 'ethers';

export class TelegramBotService {
  private bot: TelegramBot;
  private db: DatabaseService;
  private walletService: WalletService;
  private oneInchService: IOneInchService;
  private blockchainService?: BlockchainService;
  private worldIdService?: WorldIdService;
  private quoteStorage: Map<string, OneInchQuoteParams> = new Map();

  constructor(
    token: string,
    db: DatabaseService,
    walletService: WalletService,
    oneInchService: IOneInchService,
    blockchainService?: BlockchainService,
    worldIdService?: WorldIdService
  ) {
    this.bot = new TelegramBot(token, { polling: true });
    this.db = db;
    this.walletService = walletService;
    this.oneInchService = oneInchService;
    this.blockchainService = blockchainService;
    this.worldIdService = worldIdService;

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
      { command: 'sell', description: 'Sell tokens (e.g. /sell 0.1 ETH USDC)' },
      { command: 'quote', description: 'Get price quote with instant buy option' },
      { command: 'orders', description: 'Check active/recent orders' },
      { command: 'status', description: 'Check specific order status' },
      { command: 'tokens', description: 'Show supported tokens' },
      { command: 'history', description: 'Show transaction history' },
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
          `🌍 **Next Step: Verify your humanity**\n` +
          `Use /verify to verify with World ID and unlock trading features.\n\n` +
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
            'You must verify your humanity with World ID to use trading features.\n\n' +
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

        // Check World ID verification before allowing trading
        const isVerificationPassed = await checkWorldIdVerification(userId, chatId);
        if (!isVerificationPassed) {
          return; // Verification message already sent
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

        // Send confirmation with Base network highlighted
        const keyboard = {
          inline_keyboard: [
            [
              { text: '✅ Confirm Purchase', callback_data: `confirm_buy_${JSON.stringify(quoteParams)}` },
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

        // Check World ID verification before allowing trading
        const isVerificationPassed = await checkWorldIdVerification(userId, chatId);
        if (!isVerificationPassed) {
          return; // Verification message already sent
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

    // Help command
    this.bot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      
      const helpText = `
🤖 **Trading Bot Help**

🌍 **IMPORTANT: World ID Verification Required**
This bot requires proof of humanhood to prevent abuse and ensure fair access for real users.

**Getting Started:**
1️⃣ /start - Create wallet or login
2️⃣ /verify - Verify your humanity with World ID
3️⃣ Start trading! 🚀

**Trading Commands:**
/quote [amount] [token1] [token2] - Get live price quote + instant buy
/buy [token] [amount] - Buy tokens with USDC
/sell [amount] [token] [to_token] - Sell tokens
/balance - Show token balances
/orders - Check active/recent orders
/status [order_id] - Check specific order status

**Wallet & Info:**
/wallet - Show wallet information
/tokens - Show supported tokens
/history - Show transaction history

**Quick Trading Workflow:**
1️⃣ \`/quote 10 USDC DEGEN\` - Get live price quote
2️⃣ Click "🚀 Buy Now" button - Execute trade instantly
3️⃣ \`/orders\` - Check if your trade executed
4️⃣ \`/balance\` - See updated balances

**World ID Verification:**
• Proves you're a unique human
• Prevents bot abuse and spam
• No personal information required
• One verification per person
• Required for all trading features

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
🌍 Human-verified trading with World ID
      `;
      
      this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
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