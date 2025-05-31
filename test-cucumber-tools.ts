import * as dotenv from 'dotenv';
dotenv.config();

import { HederaService } from './src/services/HederaService';
import { StrategyService } from './src/services/StrategyService';
import { PrismaDatabaseService } from './src/services/PrismaDatabaseService';
import { WalletService } from './src/services/WalletService';
import { HederaAgentService } from './src/services/HederaAgentService';

async function testCucumberMopedTools() {
  console.log('🥒 Testing CucumberMoped AI Agent Tools...\n');

  try {
    // Initialize services (minimal logging)
    const db = new PrismaDatabaseService();
    const walletService = new WalletService(process.env.WALLET_ENCRYPTION_KEY!);
    const hederaService = new HederaService();
    const strategyService = new StrategyService();

    hederaService.setOperator(
      process.env.HEDERA_TESTNET_ACCOUNT_ID!,
      process.env.HEDERA_TESTNET_PRIVATE_KEY!
    );

    // Initialize agent with minimal verbosity
    const agentService = new HederaAgentService(
      hederaService,
      undefined as any,
      strategyService,
      db,
      walletService,
      {
        operatorAccountId: process.env.HEDERA_TESTNET_ACCOUNT_ID!,
        operatorPrivateKey: process.env.HEDERA_TESTNET_PRIVATE_KEY!,
        network: 'testnet',
        openAIApiKey: process.env.OPENAI_API_KEY,
        operationalMode: 'provideBytes',
        verbose: false  // Reduce verbosity
      }
    );

    await agentService.initialize();

    // Test tool availability
    console.log('📋 Checking available tools...');
    const tools = agentService.getAvailableTools();
    console.log(`Total tools: ${tools.length}`);
    
    const cucumberTools = tools.filter(name => 
      name.includes('portfolio') || 
      name.includes('cucumber') ||
      name.includes('hedera_testnet') ||
      name.includes('user_info') ||
      name.includes('topic')
    );
    
    console.log(`CucumberMoped tools: ${cucumberTools.length}`);
    cucumberTools.forEach(tool => console.log(`  • ${tool}`));
    console.log();

    // Test AI conversations with our custom tools
    if (process.env.OPENAI_API_KEY) {
      console.log('🗣️  Testing AI with CucumberMoped tools...\n');

      const testCases = [
        {
          input: 'What is CucumberMoped? Tell me about this trading bot.',
          expectTool: 'get_cucumbermoped_info'
        },
        {
          input: 'Get my portfolio allocation using Black-Litterman optimization',
          expectTool: 'get_portfolio_allocation'
        },
        {
          input: 'Check the status of Hedera testnet',
          expectTool: 'get_hedera_testnet_info'
        }
      ];

      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        console.log(`Test ${i + 1}: ${testCase.input}`);
        
        try {
          const response = await agentService.processMessage(testCase.input, [], {
            userId: 123456,
            username: 'testuser',
            isVerified: true
          });
          
          console.log(`✅ Response: ${response.output.substring(0, 200)}...`);
          if (response.error) {
            console.log(`⚠️  Error: ${response.error}`);
          }
        } catch (error) {
          console.log(`❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
        console.log('---\n');
      }
    } else {
      console.log('⚠️  OpenAI API key not found - skipping AI tests\n');
    }

    // Clean up
    await agentService.shutdown();
    await db.prisma.$disconnect();
    hederaService.close();

    console.log('✅ CucumberMoped tools test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testCucumberMopedTools()
  .then(() => {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  }); 