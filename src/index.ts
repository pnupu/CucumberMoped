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
import { HederaAgentService } from './services/HederaAgentService';

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
  private hederaAgentService: HederaAgentService;

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

    // Initialize Hedera Agent service first (without telegramBot reference)
    this.hederaAgentService = new HederaAgentService(
      this.hederaService,
      undefined as any, // Will be set later
      this.strategyService,
      this.db,
      this.walletService,
      {
        operatorAccountId: process.env.HEDERA_TESTNET_ACCOUNT_ID!,
        operatorPrivateKey: process.env.HEDERA_TESTNET_PRIVATE_KEY!,
        network: 'testnet',
        openAIApiKey: process.env.OPENAI_API_KEY,
        operationalMode: 'provideBytes',
        verbose: false
      }
    );

    this.telegramBot = new TelegramBotService(
      process.env.TELEGRAM_BOT_TOKEN!,
      this.db,
      this.walletService,
      this.oneInchLimitOrderService,
      this.blockchainService,
      this.worldIdService,
      this.hederaService,
      this.strategyService,
      this.hederaAgentService
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

    const optionalVars = [
      'OPENAI_API_KEY' // Optional for AI agent functionality
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
      console.error('\nFor Hedera Agent:');
      console.error('  - OPENAI_API_KEY: OpenAI API key for AI agent functionality (optional)');
      process.exit(1);
    }

    // Check optional vars and warn if missing
    const missingOptional = optionalVars.filter(varName => !process.env[varName]);
    if (missingOptional.length > 0) {
      console.warn('⚠️  Optional environment variables not set:');
      missingOptional.forEach(varName => console.warn(`  - ${varName}`));
      console.warn('Some features may be limited without these variables.');
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
      console.log('🔄 Starting services...');
      
      // Start Telegram bot
      this.telegramBot.start();

      // Initialize Hedera Agent Service
      console.log('🤖 Initializing Hedera AI Agent...');
      try {
        await this.hederaAgentService.initialize();
        console.log('✅ Hedera AI Agent initialized successfully');
      } catch (error) {
        console.warn('⚠️  Hedera AI Agent initialization failed:', error instanceof Error ? error.message : 'Unknown error');
        console.warn('AI agent features will be limited');
      }

      // Start Mini App server
      console.log('📱 Starting Mini App server...');
      await this.miniAppServer.start();

      console.log('✅ All services started successfully!');
      console.log('🌍 World ID verification available via Mini App');
      console.log('💰 Primary trading token: USDC on Base');
      console.log('🎯 Limit orders with Pyth pricing enabled');
      console.log('🤖 AI Agent for Hedera operations available');
      console.log('🥒 CucumberMoped Index with Strategy Service ready');
      console.log(`📱 Mini App URL: ${process.env.MINIAPP_URL || 'http://localhost:3001'}`);
      console.log('📱 Send /start to your Telegram bot to begin');
      console.log('🤖 Try /ai commands to interact with the Hedera AI Agent');
      
      // Set up graceful shutdown
      this.setupGracefulShutdown();
      
    } catch (error) {
      console.error('❌ Failed to start application:', error);
      throw error;
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      
      try {
        // Stop the Telegram bot
        this.telegramBot.stop();
        
        // Shutdown AI agent
        if (this.hederaAgentService) {
          await this.hederaAgentService.shutdown();
        }
        
        // Close Hedera client
        if (this.hederaService) {
          this.hederaService.close();
        }
        
        // Close database connection
        await this.db.prisma.$disconnect();
        
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
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