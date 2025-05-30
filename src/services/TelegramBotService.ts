import TelegramBot from 'node-telegram-bot-api';
import { DatabaseService } from './DatabaseService';
import { WalletService } from './WalletService';
import { OneInchService, OneInchQuoteParams } from './OneInchService';
import { User } from '../types';
import { getTokenBySymbol, getTokensByChain, CHAIN_NAMES, SUPPORTED_TOKENS } from '../config/tokens';
import { ethers } from 'ethers';

export class TelegramBotService {
  private bot: TelegramBot;
  private db: DatabaseService;
  private walletService: WalletService;
  private oneInchService: OneInchService;

  constructor(
    token: string,
    db: DatabaseService,
    walletService: WalletService,
    oneInchService: OneInchService
  ) {
    this.bot = new TelegramBot(token, { polling: true });
    this.db = db;
    this.walletService = walletService;
    this.oneInchService = oneInchService;

    this.setupCommands();
    this.setupHandlers();
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

  private setupHandlers(): void {
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
          `💼 Wallet Information:\n\n` +
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

        const balances = await this.db.getTokenBalances(userId);
        
        if (balances.length === 0) {
          this.bot.sendMessage(chatId, 
            `💰 Balances:\n\nNo balances found. Deposit funds to your wallet to start trading.\n\n` +
            `Wallet address:\n\`${user.walletAddress}\``,
            { parse_mode: 'Markdown' }
          );
          return;
        }

        let balanceText = '💰 Balances:\n\n';
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
        if (parts.length !== 3) {
          this.bot.sendMessage(chatId, 
            'Invalid command. Use: /buy [amount] [from_token] [to_token]\n' +
            'Example: /buy 100 USDC ETH'
          );
          return;
        }

        const [amount, fromSymbol, toSymbol] = parts;
        const fromToken = getTokenBySymbol(fromSymbol.toUpperCase(), 1); // Default to Ethereum
        const toToken = getTokenBySymbol(toSymbol.toUpperCase(), 1);

        if (!fromToken || !toToken) {
          this.bot.sendMessage(chatId, 'Unknown token. Use /tokens to see supported tokens.');
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

        // Send confirmation
        const keyboard = {
          inline_keyboard: [
            [
              { text: '✅ Confirm Purchase', callback_data: `confirm_buy_${JSON.stringify(quoteParams)}` },
              { text: '❌ Cancel', callback_data: 'cancel' }
            ]
          ]
        };

        this.bot.sendMessage(chatId,
          `📊 Purchase Quote:\n\n` +
          `Selling: ${amount} ${fromSymbol.toUpperCase()}\n` +
          `Receiving: ~${outputAmount} ${toSymbol.toUpperCase()}\n` +
          `Price Impact: ~${quote.priceImpact}%\n` +
          `Estimated Gas: ${quote.estimatedGas}\n\n` +
          `Confirm purchase:`,
          { reply_markup: keyboard }
        );

      } catch (error) {
        console.error('Error in buy command:', error);
        this.bot.sendMessage(chatId, 'Error getting quote. Please check token names and amount.');
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
/buy [amount] [token1] [token2] - Buy tokens
/sell [amount] [token1] [token2] - Sell tokens
/quote [amount] [token1] [token2] - Get price quote
/tokens - Show supported tokens
/history - Show transaction history

**Examples:**
\`/buy 100 USDC ETH\` - Buy ETH with 100 USDC
\`/sell 0.1 ETH USDC\` - Sell 0.1 ETH for USDC
\`/quote 50 USDC PEPE\` - Get price for 50 USDC → PEPE

**Notes:**
• First deposit USDC to your wallet
• All trades go through 1inch Fusion+
• Always keep ETH for gas fees
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