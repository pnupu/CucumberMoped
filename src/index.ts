import dotenv from 'dotenv';
import { DatabaseService } from './services/DatabaseService';
import { WalletService } from './services/WalletService';
import { OneInchService } from './services/OneInchService';
import { TelegramBotService } from './services/TelegramBotService';

// Load environment variables
dotenv.config();

class TradingBotApp {
  private db: DatabaseService;
  private walletService: WalletService;
  private oneInchService: OneInchService;
  private telegramBot: TelegramBotService;

  constructor() {
    // Validate required environment variables
    this.validateEnvironment();

    // Initialize services
    this.db = new DatabaseService(process.env.DATABASE_PATH || './data/bot.db');
    this.walletService = new WalletService(process.env.WALLET_ENCRYPTION_KEY!);
    this.oneInchService = new OneInchService(
      process.env.ONEINCH_API_URL!,
      process.env.ONEINCH_API_KEY!,
      this.walletService
    );
    this.telegramBot = new TelegramBotService(
      process.env.TELEGRAM_BOT_TOKEN!,
      this.db,
      this.walletService,
      this.oneInchService
    );
  }

  private validateEnvironment(): void {
    const requiredVars = [
      'TELEGRAM_BOT_TOKEN',
      'ONEINCH_API_KEY',
      'ONEINCH_API_URL',
      'WALLET_ENCRYPTION_KEY'
    ];

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
  }

  public async start(): Promise<void> {
    try {
      console.log('🚀 Starting Trading Bot...');
      
      // Start the Telegram bot
      this.telegramBot.start();
      
      console.log('✅ Trading Bot started successfully!');
      console.log('📱 Send /start to your Telegram bot to begin trading');
      
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
        this.db.close();
        
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