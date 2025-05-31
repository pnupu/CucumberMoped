# Strategy Service - Black-Litterman Portfolio Allocation

This service fetches market cap data from CoinMarketCap Pro API, calculates Black-Litterman based portfolio allocations, and posts the results to Hedera Consensus Service.

## Features

- 🏦 **Market Cap Data**: Fetches real-time market cap data from CoinMarketCap Pro API
- 🧮 **Black-Litterman Model**: Calculates portfolio allocations using market cap weighted baseline with adjustments
- 📝 **Hedera Integration**: Posts portfolio allocations as JSON messages to Hedera Consensus Service
- 🎯 **Smart Adjustments**: Applies intelligent adjustments to reduce stablecoin exposure and boost large-cap tokens

## Setup

### 1. Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# CoinMarketCap Pro API Key (Required)
COINMARKETCAP_PRO_KEY=your_coinmarketcap_pro_api_key

# Hedera Testnet Configuration (Required for Hedera integration)
HEDERA_ACCOUNT_ID=0.0.XXXXXXX
HEDERA_PRIVATE_KEY=your_hedera_private_key
```

### 2. Get API Keys

#### CoinMarketCap Pro API Key
1. Sign up at [CoinMarketCap Pro](https://pro.coinmarketcap.com/)
2. Get your API key from the dashboard
3. Add it to your `.env` file

#### Hedera Testnet Account
1. Create a testnet account at [Hedera Portal](https://portal.hedera.com/register)
2. Get your Account ID and Private Key
3. Add them to your `.env` file

## Usage

### Test CoinMarketCap API Only

Test the CoinMarketCap integration without Hedera:

```bash
npm run test:strategy-cmc
```

This will:
- Fetch market cap data for all supported tokens
- Calculate Black-Litterman portfolio allocations
- Display portfolio summary
- Generate the JSON message that would be posted to Hedera

### Full Integration Test

Test the complete integration with Hedera:

```bash
npm run test:strategy
```

This will:
- Fetch market cap data from CoinMarketCap Pro API
- Calculate portfolio allocations using Black-Litterman model
- Create a new Hedera topic for portfolio updates
- Post the portfolio allocation as a JSON message to Hedera
- Verify the message was posted successfully
- Display results and topic information

## Supported Tokens

The service works with all tokens defined in `src/config/tokens.ts`, including:

**Ethereum Mainnet**: ETH, USDC, WBTC, AAVE, PEPE, LINK, UNI, SEI, MOG, SPX

**Base**: USDC, cbBTC, VIRTUAL, DEGEN, BRETT, TOSHI, AERO, ZORA, KAITO, BGCI, MORPHO

**Arbitrum**: PENDLE, CRV, ZRO, ATH, GMX, GRT

**Polygon**: POL

## Portfolio Allocation Strategy

### Black-Litterman Model

The service implements a simplified Black-Litterman model:

1. **Baseline Weights**: Uses market capitalization proportions as baseline weights
2. **Adjustments Applied**:
   - Reduces stablecoin allocation by 20%
   - Boosts large-cap tokens (>$10B market cap) by 10%
   - Reduces very small allocations (<0.5%) by half to avoid dust
3. **Normalization**: Ensures all weights sum to 100%
4. **Sorting**: Returns allocations sorted by weight (highest first)

### Output Format

The portfolio allocation is posted to Hedera as a JSON message:

```json
{
  "type": "portfolio_allocation",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "total_market_cap": 1234567890123,
  "strategy": "black_litterman",
  "allocations": [
    {
      "token": "ETH",
      "allocation": 0.350000
    },
    {
      "token": "BTC",
      "allocation": 0.250000
    }
  ]
}
```

## Example Output

```
🎯 Portfolio Summary (Black-Litterman Strategy)
📊 Total Market Cap: $1,234.56B
📅 Generated: 1/15/2024, 10:30:00 AM

📈 Top 10 Allocations (95.2% of portfolio):
1. ETH: 35.00%
2. BTC: 25.00%
3. USDC: 8.50%
4. LINK: 6.20%
5. UNI: 4.80%
6. AAVE: 3.70%
7. WBTC: 3.20%
8. PEPE: 2.90%
9. DEGEN: 2.60%
10. VIRTUAL: 2.40%
... and 15 other tokens (4.8%)
```

## API Rate Limits

- **CoinMarketCap Pro**: 333 calls/day on basic plan, 10,000 calls/month
- **Hedera Testnet**: No specific rate limits, but consider transaction costs

## Error Handling

The service includes comprehensive error handling:

- ✅ Validates environment variables
- ✅ Handles CoinMarketCap API errors
- ✅ Validates market cap data
- ✅ Handles Hedera connectivity issues
- ✅ Provides detailed error messages and logging

## Troubleshooting

### Common Issues

1. **Invalid CoinMarketCap API Key**
   - Verify your API key is correct
   - Check if you've exceeded rate limits
   - Ensure the key has proper permissions

2. **Hedera Connection Issues**
   - Verify your Account ID and Private Key
   - Check testnet connectivity
   - Ensure sufficient HBAR balance for transactions

3. **Missing Tokens**
   - Some tokens may not be available on CoinMarketCap
   - Check token symbols match exactly
   - Review CoinMarketCap API response for details

### Debug Mode

Add detailed logging by setting log level:

```typescript
// In your test file
console.log('Debug mode enabled');
```

## Production Considerations

1. **API Key Security**: Store API keys securely, never commit to version control
2. **Rate Limiting**: Implement proper rate limiting for production use
3. **Error Retry Logic**: Add exponential backoff for API failures
4. **Data Validation**: Validate all external API responses
5. **Monitoring**: Add monitoring for portfolio updates and API health
6. **Backup Strategy**: Consider multiple data sources for redundancy

## Contributing

To add support for new tokens:

1. Add the token to `src/config/tokens.ts`
2. Ensure the token symbol matches CoinMarketCap exactly
3. Test with `npm run test:strategy-cmc` first
4. Submit a pull request

## License

MIT License - see LICENSE file for details. 