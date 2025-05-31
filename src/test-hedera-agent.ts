import * as dotenv from 'dotenv';
dotenv.config();

import { HederaService } from './services/HederaService';
import { StrategyService } from './services/StrategyService';
import { PrismaDatabaseService } from './services/PrismaDatabaseService';
import { WalletService } from './services/WalletService';
import { HederaAgentService } from './services/HederaAgentService';

async function testHederaAgent() {
  console.log('🤖 Testing Hedera Agent Kit Integration...\n');

  // Validate required environment variables
  const requiredVars = [
    'HEDERA_TESTNET_ACCOUNT_ID',
    'HEDERA_TESTNET_PRIVATE_KEY'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(varName => console.error(`  - ${varName}`));
    process.exit(1);
  }

  try {
    // Initialize services
    console.log('🔧 Initializing services...');
    const db = new PrismaDatabaseService();
    const walletService = new WalletService(process.env.WALLET_ENCRYPTION_KEY!);
    const hederaService = new HederaService();
    const strategyService = new StrategyService();

    // Set up Hedera operator
    hederaService.setOperator(
      process.env.HEDERA_TESTNET_ACCOUNT_ID!,
      process.env.HEDERA_TESTNET_PRIVATE_KEY!
    );

    // Initialize Hedera Agent Service
    console.log('🤖 Initializing Hedera Agent Service...');
    const agentService = new HederaAgentService(
      hederaService,
      undefined as any, // No telegram service needed for testing
      strategyService,
      db,
      walletService,
      {
        operatorAccountId: process.env.HEDERA_TESTNET_ACCOUNT_ID!,
        operatorPrivateKey: process.env.HEDERA_TESTNET_PRIVATE_KEY!,
        network: 'testnet',
        openAIApiKey: process.env.OPENAI_API_KEY,
        operationalMode: 'provideBytes',
        verbose: false
      }
    );

    await agentService.initialize();
    console.log('✅ Agent initialized successfully!\n');

    // Health check
    console.log('🏥 Running health check...');
    const health = await agentService.healthCheck();
    console.log('Health status:', health.status);
    console.log('Details:', JSON.stringify(health.details, null, 2));
    console.log();

    // Test basic capabilities
    console.log('📋 Available tools:');
    const tools = agentService.getAvailableTools();
    tools.forEach(tool => console.log(`  • ${tool}`));
    console.log();

    // Test conversations if OpenAI API key is available
    if (process.env.OPENAI_API_KEY) {
      console.log('🗣️  Testing AI conversations...\n');

      const testMessages = [
        'What is CucumberMoped?',
        'Check Hedera testnet status',
        'Get my portfolio allocation'
      ];

      for (const message of testMessages) {
        console.log(`👤 User: ${message}`);
        try {
          const response = await agentService.processMessage(message, [], {
            userId: 123456,
            username: 'testuser',
            isVerified: true
          });
          console.log(`🤖 Agent: ${response.output}`);
          if (response.error) {
            console.log(`⚠️  Error: ${response.error}`);
          }
        } catch (error) {
          console.log(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        console.log('---\n');
      }
    } else {
      console.log('⚠️  OpenAI API key not found - skipping AI conversation tests\n');
    }

    // Test direct tool execution
    console.log('🔧 Testing direct tool execution...\n');

    // First, let's see what tools are actually available
    console.log('📋 Available tools from agent kit:');
    const availableTools = agentService.getAvailableTools();
    console.log(`Total tools: ${availableTools.length}`);
    console.log(`Tool names: ${availableTools.slice(0, 10).join(', ')}...`); // Show first 10
    console.log('');

    // Try to find tools that match our plugin
    const cucumberMopedTools = availableTools.filter(name => 
      name.includes('cucumbermoped') || 
      name.includes('portfolio') || 
      name.includes('testnet') ||
      name.includes('cucumber')
    );
    
    if (cucumberMopedTools.length > 0) {
      console.log(`✅ Found CucumberMoped-related tools: ${cucumberMopedTools.join(', ')}`);
    } else {
      console.log('❌ No CucumberMoped-related tools found');
    }

    // Test a known tool that should exist
    console.log('\nTesting hedera-get-network-info tool...');
    try {
      const result = await agentService.executeTool('hedera-get-network-info', {});
      console.log('✅ Tool execution successful:', result);
    } catch (error) {
      console.log(`❌ Error executing tool hedera-get-network-info: ${error}`);
    }

    // Test Hedera connectivity
    console.log('\n🌐 Testing Hedera connectivity...');
    const isConnected = await hederaService.testConnectivity();
    console.log(`Hedera testnet connection: ${isConnected ? '✅ Connected' : '❌ Failed'}`);

    // Clean up
    console.log('\n🧹 Cleaning up...');
    await agentService.shutdown();
    await db.prisma.$disconnect();
    hederaService.close();

    console.log('✅ Hedera Agent test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testHederaAgent()
    .then(() => {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}

export { testHederaAgent }; 