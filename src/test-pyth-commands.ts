import { PythService } from './services/PythService';

async function testPythCommands() {
  console.log('🧪 Testing Pyth Commands...\n');
  
  const pythService = new PythService();
  
  try {
    // Test /pythtest equivalent
    console.log('📊 Testing /pythtest equivalent...');
    const supportedTokens = pythService.getSupportedTokens();
    console.log(`✅ Supported tokens (${supportedTokens.length}):`, supportedTokens.slice(0, 10).join(', ') + '...');
    
    // Test a few individual prices
    const testTokens = ['BTC', 'ETH', 'USDC', 'DEGEN', 'BRETT'];
    for (const token of testTokens) {
      try {
        const price = await pythService.getEmaPrice(token);
        console.log(`✅ ${token}: $${price.toFixed(6)}`);
      } catch (error) {
        console.log(`❌ ${token}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    console.log('\n📊 Testing /pythall equivalent...');
    
    // Test /pythall equivalent - get all supported prices
    const allTokens = ['BTC', 'ETH', 'USDC', 'USDT', 'DEGEN', 'BRETT', 'VIRTUAL'];
    try {
      const prices = await pythService.getMultipleEmaPrices(allTokens);
      console.log('✅ All EMA prices fetched:');
      prices.forEach((price, token) => {
        const icon = token === 'BTC' ? '₿' : 
                   token === 'ETH' ? '⚡' : 
                   token === 'USDC' ? '💰' : 
                   token === 'USDT' ? '💵' : '🪙';
        console.log(`  ${icon} **${token}:** $${price.toFixed(6)}`);
      });
    } catch (error) {
      console.log('❌ Error fetching all prices:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    console.log('\n📊 Testing /pythcompare equivalent...');
    
    // Test /pythcompare equivalent - compare prices over time
    const compareToken = 'ETH';
    try {
      console.log(`📊 Getting initial ${compareToken} price...`);
      const price1 = await pythService.getEmaPrice(compareToken);
      console.log(`⏰ Initial: $${price1.toFixed(6)}`);
      
      console.log('⏳ Waiting 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log(`📊 Getting updated ${compareToken} price...`);
      const price2 = await pythService.getEmaPrice(compareToken);
      console.log(`⏰ Updated: $${price2.toFixed(6)}`);
      
      const change = price2 - price1;
      const changePercent = (change / price1) * 100;
      const changeIcon = change >= 0 ? '📈' : '📉';
      
      console.log(`${changeIcon} Change: $${change.toFixed(6)} (${changePercent.toFixed(4)}%)`);
    } catch (error) {
      console.log('❌ Error in price comparison:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    console.log('\n🎉 Pyth Commands test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testPythCommands().catch(console.error);
}

export { testPythCommands }; 