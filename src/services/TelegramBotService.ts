import TelegramBot from 'node-telegram-bot-api';
import { DatabaseService } from './DatabaseService';
import { WalletService } from './WalletService';
import { BlockchainService } from './BlockchainService';
import { IOneInchService, OneInchQuoteParams } from '../types';

import { getTokenBySymbol, getTokensByChain, CHAIN_NAMES, SUPPORTED_TOKENS } from '../config/tokens';
import { ethers } from 'ethers';

export class TelegramBotService {
  private bot: TelegramBot;
  private db: DatabaseService;
  private walletService: WalletService;
  private oneInchService: IOneInchService;
  private blockchainService?: BlockchainService;

  constructor(
    token: string,
    db: DatabaseService,
    walletService: WalletService,
    oneInchService: IOneInchService,
    blockchainService?: BlockchainService
  ) {
    this.bot = new TelegramBot(token, { polling: true });
    this.db = db;
    this.walletService = walletService;
    this.oneInchService = oneInchService;
    this.blockchainService = blockchainService;

    this.setupCommands();
    this.setupCallbackHandlers();
  }

  private setupCommands(): void {
    this.bot.setMyCommands([
      { command: 'start', description: 'Start using the bot' },
      { command: 'wallet', description: 'Show wallet information' },
      { command: 'balance', description: 'Show token balances' },
      { command: 'buy', description: 'Buy tokens (e.g. /buy 100 USDC ETH)' },
      { command: 'sell', description: 'Sell tokens (e.g. /sell 0.1 ETH USDC)' },
      { command: 'quote', description: 'Get price quote (e.g. /quote 100 USDC ETH)' },
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
          this.bot.sendMessage(chatId, 
            `Welcome back! 🎉\n\n` +
            `Your wallet address: \`${existingUser.walletAddress}\`\n\n` +
            `Use /help to see available commands.`,
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

        const parts = input.split(' ');
        if (parts.length !== 3) {
          this.bot.sendMessage(chatId, 
            'Invalid command. Use: /quote [amount] [from_token] [to_token]\n' +
            'Example: /quote 100 USDC ETH'
          );
          return;
        }

        const [amount, fromSymbol, toSymbol] = parts;
        const fromToken = getTokenBySymbol(fromSymbol.toUpperCase(), 1);
        const toToken = getTokenBySymbol(toSymbol.toUpperCase(), 1);

        if (!fromToken || !toToken) {
          this.bot.sendMessage(chatId, 'Unknown token. Use /tokens to see supported tokens.');
          return;
        }

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

        this.bot.sendMessage(chatId,
          `📊 Price Quote:\n\n` +
          `${amount} ${fromSymbol.toUpperCase()} → ~${outputAmount} ${toSymbol.toUpperCase()}\n` +
          `Price Impact: ~${quote.priceImpact}%\n` +
          `Estimated Gas: ${quote.estimatedGas}\n\n` +
          `Use /buy to start a trade.`
        );

      } catch (error) {
        console.error('Error in quote command:', error);
        this.bot.sendMessage(chatId, 'Error getting price quote.');
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

**Commands:**
/start - Create new wallet or login
/wallet - Show wallet information
/balance - Show token balances
/buy [token] [amount] - Buy tokens with USDC
/sell [amount] [token] [to_token] - Sell tokens
/quote [amount] [token1] [token2] - Get price quote
/tokens - Show supported tokens
/history - Show transaction history

**Examples:**
\`/buy ETH 100\` - Buy ETH with 100 USDC (Base)
\`/buy 100 USDC ETH\` - Buy ETH with 100 USDC
\`/sell 0.1 ETH USDC\` - Sell 0.1 ETH for USDC
\`/quote 50 USDC PEPE\` - Get price for 50 USDC → PEPE

**Notes:**
💰 USDC on Base is the primary trading token
⚡ Base network offers lower fees
🔗 All trades go through 1inch Fusion+
      `;
      
      this.bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    });

    // Handle callback queries (button presses)
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message?.chat.id;
      const userId = query.from.id;
      const data = query.data;

      if (!chatId || !data) return;

      if (data === 'cancel') {
        this.bot.editMessageText('❌ Operation cancelled.', {
          chat_id: chatId,
          message_id: query.message?.message_id
        });
        return;
      }

      if (data.startsWith('confirm_buy_')) {
        try {
          const quoteParamsJson = data.replace('confirm_buy_', '');
          const quoteParams: OneInchQuoteParams = JSON.parse(quoteParamsJson);
          
          const user = await this.db.getUser(userId);
          if (!user) {
            this.bot.answerCallbackQuery(query.id, { text: 'User not found!' });
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

          this.bot.editMessageText(
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
          this.bot.answerCallbackQuery(query.id, { text: 'Error submitting order!' });
        }
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