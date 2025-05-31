import dotenv from 'dotenv';
import { DatabaseService } from './services/DatabaseService';
import { WalletService } from './services/WalletService';
import { MockOneInchService } from './services/MockOneInchService';
import { BlockchainService } from './services/BlockchainService';
import { TelegramBotService } from './services/TelegramBotService';

// Load testnet environment variables
dotenv.config({ path: '.env.testnet' });

class TestnetTradingBotApp {
  private db: DatabaseService;
  private walletService: WalletService;
  private blockchainService: BlockchainService;
  private oneInchService: MockOneInchService;
  private telegramBot: TelegramBotService;

  constructor() {
    console.log('🧪 Starting Testnet Trading Bot...');
    
    // Validate required environment variables
    this.validateEnvironment();

    // Initialize services with testnet configuration
    this.db = new DatabaseService(process.env.DATABASE_PATH || './data/testnet-bot.db');
    this.walletService = new WalletService(process.env.WALLET_ENCRYPTION_KEY!);
    this.blockchainService = new BlockchainService(true);
    
    // Use Mock service for testnet
    this.oneInchService = new MockOneInchService(
      process.env.ONEINCH_API_URL!,
      process.env.ONEINCH_API_KEY!,
      this.walletService
    );
    
    // Initialize Telegram bot with testnet token configurations
    this.telegramBot = new TelegramBotService(
      process.env.TELEGRAM_BOT_TOKEN!,
      this.db,
      this.walletService,
      this.oneInchService,
      this.blockchainService
    );
  }

  private validateEnvironment(): void {
    const requiredVars = [
      'TELEGRAM_BOT_TOKEN',
      'WALLET_ENCRYPTION_KEY'
    ];

    // For testnet, we don't require real 1inch API key
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      console.error('❌ Missing required environment variables:');
      missing.forEach(varName => console.error(`  - ${varName}`));
      console.error('\nPlease check your .env file and ensure all required variables are set.');
      process.exit(1);
    }

    // Validate encryption key length (should be 64 hex characters for 256-bit key)
    const encryptionKey = process.env.WALLET_ENCRYPTION_KEY!;
    if (encryptionKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(encryptionKey)) {
      console.error('❌ WALLET_ENCRYPTION_KEY must be a 64-character hexadecimal string (256-bit key)');
      console.error('You can generate one using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
      process.exit(1);
    }

    console.log('✅ Environment validation passed for testnet');
  }

  public async start(): Promise<void> {
    try {
      console.log('🧪 Starting Testnet Trading Bot...');
      console.log('⚠️  TESTNET MODE: Using mock services and testnet tokens');
      
      // Start the Telegram bot
      this.telegramBot.start();
      
      console.log('✅ Testnet Trading Bot started successfully!');
      console.log('📱 Send /start to your Telegram bot to begin testing');
      console.log('🧪 All trades will be simulated - no real funds at risk');
      
      // Set up graceful shutdown
      this.setupGracefulShutdown();
      
    } catch (error) {
      console.error('❌ Failed to start Testnet Trading Bot:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down testnet bot gracefully...`);
      
      try {
        // Stop Telegram bot
        this.telegramBot.stop();
        
        // Close database connection
        this.db.close();
        
        console.log('✅ Testnet shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during testnet shutdown:', error);
        process.exit(1);
      }
    };

    // Handle various shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception in testnet:', error);
      shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection in testnet at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }
}

// Start the testnet application
async function main() {
  const app = new TestnetTradingBotApp();
  await app.start();
}

// Run the testnet application
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Failed to start testnet application:', error);
    process.exit(1);
  });
} 