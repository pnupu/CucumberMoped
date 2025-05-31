import dotenv from 'dotenv';
import { PythService } from './services/PythService';

dotenv.config();

async function testPythService() {
  console.log('🧪 Testing Pyth Service...\n');

  const pythService = new PythService();

  try {
    // Test 1: Check supported tokens
    console.log('📋 Supported tokens:', pythService.getSupportedTokens());
    console.log('');

    // Test 2: Get EMA prices for supported tokens
    const supportedTokens = ['BTC', 'ETH', 'USDC'];
    
    for (const token of supportedTokens) {
      try {
        console.log(`📊 Fetching EMA price for ${token}...`);
        const price = await pythService.getEmaPrice(token);
        console.log(`✅ ${token} EMA Price: $${price.toFixed(6)}`);
      } catch (error) {
        console.error(`❌ Error fetching ${token} price:`, error instanceof Error ? error.message : error);
      }
      console.log('');
    }

    // Test 3: Get multiple prices at once
    console.log('📊 Testing multiple price fetch...');
    try {
      const prices = await pythService.getMultipleEmaPrices(['BTC', 'ETH']);
      console.log('✅ Multiple prices fetched:');
      prices.forEach((price, token) => {
        console.log(`  ${token}: $${price.toFixed(6)}`);
      });
    } catch (error) {
      console.error('❌ Error fetching multiple prices:', error instanceof Error ? error.message : error);
    }
    console.log('');

    // Test 4: Get price update data (for on-chain submission)
    console.log('📊 Testing price update data fetch...');
    try {
      const updateData = await pythService.getPriceUpdateData('ETH');
      console.log(`✅ Price update data length: ${updateData.length} entries`);
      console.log(`   First entry preview: ${updateData[0]?.substring(0, 100)}...`);
    } catch (error) {
      console.error('❌ Error fetching price update data:', error instanceof Error ? error.message : error);
    }
    console.log('');

    // Test 5: Test unsupported token
    console.log('📊 Testing unsupported token...');
    try {
      await pythService.getEmaPrice('UNSUPPORTED');
    } catch (error) {
      console.log('✅ Correctly handled unsupported token:', error instanceof Error ? error.message : error);
    }

    console.log('\n🎉 Pyth Service tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testPythService().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
} 