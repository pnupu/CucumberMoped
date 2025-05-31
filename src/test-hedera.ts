#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { MockHederaService } from './services/MockHederaService';

// Load environment variables
dotenv.config();

/**
 * Standalone Hedera testnet connectivity test
 * Usage: npm run test:hedera or ts-node src/test-hedera.ts
 */
async function testHederaStandalone() {
  console.log('🧪 Hedera Testnet Standalone Test');
  console.log('=' .repeat(50));
  
  try {
    // Check environment variables
    const accountId = process.env.HEDERA_TESTNET_ACCOUNT_ID;
    const privateKey = process.env.HEDERA_TESTNET_PRIVATE_KEY;
    
    if (!accountId || !privateKey) {
      console.log('❌ Missing required environment variables:');
      if (!accountId) console.log('  - HEDERA_TESTNET_ACCOUNT_ID');
      if (!privateKey) console.log('  - HEDERA_TESTNET_PRIVATE_KEY');
      console.log('\n💡 Please check your .env file and ensure these variables are set.');
      console.log('📋 You can get testnet credentials from: https://portal.hedera.com/register');
      process.exit(1);
    }

    console.log('✅ Environment variables found');
    console.log(`🔑 Account ID: ${accountId}`);
    console.log(`🔐 Private Key: ${privateKey.substring(0, 10)}...`);

    // Create Hedera service in testnet mode
    const hederaService = new MockHederaService(true);
    
    // Set operator credentials
    hederaService.setOperator(accountId, privateKey);
    
    // Run the comprehensive connectivity test
    const testResult = await hederaService.testHederaConnectivity();
    
    if (testResult) {
      console.log('\n🎉 SUCCESS: Hedera testnet is working correctly!');
      console.log('✅ Your bot is ready to use Hedera Consensus Service');
      process.exit(0);
    } else {
      console.log('\n❌ FAILED: Hedera testnet test failed');
      console.log('💡 Please check the error messages above and fix the issues');
      process.exit(1);
    }
    
  } catch (error) {
    console.log('\n💥 CRITICAL ERROR during Hedera test:');
    console.error(error);
    console.log('\n💡 Please check:');
    console.log('• Your internet connection');
    console.log('• Environment variables in .env file');
    console.log('• Account has sufficient HBAR balance');
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testHederaStandalone().catch((error) => {
    console.error('❌ Failed to run Hedera test:', error);
    process.exit(1);
  });
}

export { testHederaStandalone }; 