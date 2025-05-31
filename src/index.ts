import dotenv from 'dotenv';
import { PrismaDatabaseService } from './services/PrismaDatabaseService';
import { WalletService } from './services/WalletService';
import { OneInchService } from './services/OneInchService';
import { OneInchLimitOrderService } from './services/OneInchLimitOrderService';
import { PythService } from './services/PythService';
import { BlockchainService } from './services/BlockchainService';
import { TelegramBotService } from './services/TelegramBotService';
import { WorldIdService } from './services/WorldIdService';
import { MiniAppServer } from './server/miniapp-server';
import { HederaService } from './services/HederaService';
import { StrategyService } from './services/StrategyService';

// Load environment variables
dotenv.config();

class TradingBotApp {
  private db: PrismaDatabaseService;
  private walletService: WalletService;
  private blockchainService: BlockchainService;
  private oneInchService: OneInchService;
  private oneInchLimitOrderService: OneInchLimitOrderService;
  private pythService: PythService;
  private telegramBot: TelegramBotService;
  private worldIdService: WorldIdService;
  private miniAppServer: MiniAppServer;
  private hederaService: HederaService;
  private strategyService: StrategyService;

  constructor() {
    console.log('🚀 Starting Mainnet Trading Bot with Telegram Mini App...');
    console.log('💰 Primary token: USDC on Base');
    console.log('🌍 World ID verification enabled via Mini App');
    console.log('🎯 Limit orders with Pyth EMA pricing enabled');
    
    // Validate required environment variables
    this.validateEnvironment();

    // Initialize services
    this.db = new PrismaDatabaseService();
    this.walletService = new WalletService(process.env.WALLET_ENCRYPTION_KEY!);
    this.blockchainService = new BlockchainService(false); // false = mainnet
    this.worldIdService = new WorldIdService(
      process.env.WORLDID_APP_ID!,
      this.db,
      'identity-verification' // Match the action from your World ID app settings
    );

    // Initialize Pyth service
    this.pythService = new PythService();

    // Initialize OneInch services
    this.oneInchService = new OneInchService(
      process.env.ONEINCH_API_URL!,
      process.env.ONEINCH_API_KEY!,
      this.walletService
    );

    this.oneInchLimitOrderService = new OneInchLimitOrderService(
      process.env.ONEINCH_API_URL!,
      process.env.ONEINCH_API_KEY!,
      this.walletService,
      this.pythService
    );

    // Initialize Hedera service
    this.hederaService = new HederaService();
    this.hederaService.setOperator(
      process.env.HEDERA_TESTNET_ACCOUNT_ID!,
      process.env.HEDERA_TESTNET_PRIVATE_KEY!
    );

    // Initialize Strategy service
    this.strategyService = new StrategyService();

    this.telegramBot = new TelegramBotService(
      process.env.TELEGRAM_BOT_TOKEN!,
      this.db,
      this.walletService,
      this.oneInchLimitOrderService, // Use the limit order service instead of regular OneInch service
      this.blockchainService,
      this.worldIdService,
      this.hederaService,
      this.strategyService
    );
    
    // Initialize Mini App server
    this.miniAppServer = new MiniAppServer(this.db, this.worldIdService);
  }

  private validateEnvironment(): void {
    const requiredVars = [
      'TELEGRAM_BOT_TOKEN',
      'ONEINCH_API_KEY',
      'ONEINCH_API_URL',
      'WALLET_ENCRYPTION_KEY',
      'WORLDID_APP_ID',
      'MINIAPP_URL',
      'HEDERA_TESTNET_ACCOUNT_ID',
      'HEDERA_TESTNET_PRIVATE_KEY',
      'COINMARKETCAP_PRO_KEY'
    ];

    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      console.error('❌ Missing required environment variables:');
      missing.forEach(varName => console.error(`  - ${varName}`));
      console.error('\nPlease check your .env file and ensure all required variables are set.');
      console.error('\nFor World ID integration:');
      console.error('  - WORLDID_APP_ID: Your World ID app ID from developer.worldcoin.org');
      console.error('  - Action: identity-verification (configured in your World ID app)');
      console.error('\nFor Mini App:');
      console.error('  - MINIAPP_URL: HTTPS URL for the Telegram Mini App (use ngrok for local development)');
      process.exit(1);
    }

    // Validate encryption key length (should be 64 hex characters for 256-bit key)
    const encryptionKey = process.env.WALLET_ENCRYPTION_KEY!;
    if ((encryptionKey.length !== 32 && encryptionKey.length !== 64) || !/^[0-9a-fA-F]+$/.test(encryptionKey)) {
      console.error('❌ WALLET_ENCRYPTION_KEY must be a 32 or 64-character hexadecimal string');
      console.error('• 32 characters = 128-bit key');
      console.error('• 64 characters = 256-bit key (recommended)');
      console.error('Generate 32-char key: node -e "console.log(require(\'crypto\').randomBytes(16).toString(\'hex\'))"');
      console.error('Generate 64-char key: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
      process.exit(1);
    }

    console.log('✅ Environment validation passed for mainnet');
    console.log(`🌍 World ID App ID: ${process.env.WORLDID_APP_ID}`);
    console.log(`🔧 World ID Action: identity-verification`);
    console.log(`📱 Mini App URL: ${process.env.MINIAPP_URL}`);
  }

  public async start(): Promise<void> {
    try {
      console.log('🚀 Starting Mainnet Trading Bot with Mini App...');
      console.log('⚠️  MAINNET MODE: Using real funds and live trading');
      console.log('💰 Send USDC to your wallet to start trading');
      
      // Start the Mini App server
      this.miniAppServer.start(3001);
      
      // Start the Telegram bot
      this.telegramBot.start();
      
      console.log('✅ Mainnet Trading Bot started successfully!');
      console.log('📱 Send /start to your Telegram bot to begin');
      console.log(`🌐 Mini App available at: ${process.env.MINIAPP_URL || 'http://localhost:3001'}`);
      
      // Set up graceful shutdown
      this.setupGracefulShutdown();
      
    } catch (error) {
      console.error('❌ Failed to start Trading Bot:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      
      try {
        // Stop Telegram bot
        this.telegramBot.stop();
        
        // Close database connection
        await this.db.close();
        
        console.log('✅ Shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle various shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }
}

// Start the application
async function main() {
  const app = new TradingBotApp();
  await app.start();
}

// Run the application
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  });
} 