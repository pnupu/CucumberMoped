# Blockscout Merit Distribution System

This system automatically distributes Blockscout merits to users based on their USDC trading volume in a 1:1 ratio. Users are ranked by their daily trading volume, and the top 1000 traders receive merits equal to their USDC volume (with minimum 0.01 and maximum 2 decimal precision).

## Features

- **Trading Volume Tracking**: Records daily USDC trading volumes for each user
- **Automated Merit Distribution**: Distributes merits to top 1000 traders daily
- **1:1 USDC to Merit Ratio**: Each dollar of trading volume earns 1 merit
- **Minimum Threshold**: Only volumes >= 0.01 USDC are eligible
- **Precise Decimal Handling**: Supports up to 2 decimal places for amounts
- **Comprehensive Logging**: Tracks all distributions with success/failure status
- **API Integration**: Full integration with Blockscout Merit API
- **Automated Scheduling**: Daily distribution scheduler
- **Health Monitoring**: System health checks and balance monitoring

## Database Schema

The system adds two new models to your Prisma schema:

### TradingVolume
Tracks daily trading volumes for each user:
- `userId`: Links to User model
- `walletAddress`: User's wallet address
- `usdcVolume`: Trading volume in USDC (stored as string for precision)
- `date`: Date for which volume is recorded
- **Unique constraint**: One record per user per day

### MeritDistribution
Records all merit distribution attempts:
- `userId`: Links to User model
- `walletAddress`: User's wallet address
- `distributionId`: Unique ID sent to Blockscout API
- `amount`: Merit amount distributed
- `usdcVolume`: USDC volume that earned this merit
- `date`: Date for which merits were distributed
- `status`: pending/success/failed
- `blockscoutTxId`: Response from Blockscout API
- `errorMessage`: Error details if distribution failed

## Setup

1. **Environment Variables**
   Add your Blockscout API key to `.env`:
   ```
   BLOCKSCOUT_API_KEY=your_api_key_here
   ```

2. **Database Migration**
   Run the Prisma migration to create the new tables:
   ```bash
   npm run prisma:migrate
   npm run prisma:generate
   ```

3. **API Key Setup**
   Request your API key from the Blockscout team via their Discord channel.

## Usage

### Basic Usage

```typescript
import { PrismaClient } from '@prisma/client';
import { MeritDistributionService } from './src/services/meritDistributionService';

const prisma = new PrismaClient();
const meritService = new MeritDistributionService(prisma);

// Record trading volume for a user
await meritService.recordTradingVolume(
  userId,           // User's telegram ID
  walletAddress,    // User's wallet address
  '100.50',        // USDC volume as string
  new Date()       // Date (optional, defaults to today)
);

// Distribute merits for a specific date
const result = await meritService.distributeMeritsForDate(new Date());
console.log(`Distributed to ${result.distributedCount} traders`);
```

### Automated Scheduling

```typescript
import { MeritScheduler } from './src/services/meritScheduler';

const scheduler = new MeritScheduler(prisma);

// Start daily distribution at 00:00 UTC
scheduler.startDailyScheduler(0, 0);

// Or schedule for a different time (e.g., 02:30 UTC)
scheduler.startDailyScheduler(2, 30);

// Stop the scheduler
scheduler.stopScheduler();
```

### Manual Distribution

```typescript
// Distribute merits for yesterday
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
await scheduler.manualDistribution(yesterday);
```

### System Monitoring

```typescript
// Check system health
const health = await scheduler.checkSystemHealth();
console.log('Partner balance:', health.partnerBalance.balance);
console.log('Last distribution:', health.lastDistribution);
console.log('Pending distributions:', health.pendingDistributions);

// Get distribution summary for last 7 days
const summary = await scheduler.getDistributionSummary(7);
console.log('Total merits distributed:', summary.totalMeritsDistributed);
console.log('Average daily distribution:', summary.averageDailyDistribution);
```

### User Merit History

```typescript
// Get merit history for a specific user
const history = await meritService.getUserMeritHistory(userId);
history.forEach(record => {
  console.log(`${record.date}: ${record.amount} merits for ${record.usdcVolume} USDC`);
});
```

## Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm run test:merit

# Or directly with ts-node
ts-node src/test-merit-distribution.ts
```

The test suite includes:
- Trading volume recording
- Top trader retrieval
- Partner balance checking
- Merit distribution (safely commented out)
- User merit history
- Distribution statistics
- Daily process simulation

### Manual Testing Functions

```typescript
import { manualMeritDistribution, recordUserVolume } from './src/test-merit-distribution';

// Record volume for a specific user
await recordUserVolume(userId, walletAddress, '250.75', new Date());

// Manually trigger distribution for a date
await manualMeritDistribution(new Date('2024-01-01'));
```

## API Integration

The system integrates with the Blockscout Merit API:

- **Base URL**: `https://merits-staging.blockscout.com`
- **Distribution Endpoint**: `POST /partner/api/v1/distribute`
- **Balance Check**: `GET /partner/api/v1/balance`
- **Authentication**: Bearer token in Authorization header

### Distribution Payload

```json
{
  "id": "daily_trading_merits_2024-01-01_1703980800000",
  "description": "Daily trading volume merits for 2024-01-01",
  "distributions": [
    {
      "address": "0x1111111111111111111111111111111111111111",
      "amount": "100.50"
    }
  ],
  "create_missing_accounts": true,
  "expected_total": "100.50"
}
```

## Business Logic

### Merit Calculation
- **1:1 Ratio**: 1 USDC trading volume = 1 merit
- **Minimum Threshold**: Only volumes >= 0.01 USDC are eligible
- **Precision**: Amounts are formatted to 2 decimal places
- **Top Traders**: Maximum 1000 traders per distribution
- **Daily Aggregation**: Volumes are accumulated per user per day

### Distribution Process
1. **Volume Collection**: Daily trading volumes are recorded in real-time
2. **Daily Processing**: At scheduled time (default 00:00 UTC):
   - Retrieve top 1000 traders by volume for previous day
   - Filter out volumes below 0.01 USDC
   - Prepare Blockscout API payload
   - Execute distribution via API
   - Record results in database
3. **Error Handling**: Failed distributions are logged with error details
4. **Monitoring**: System health and statistics are tracked

### Edge Cases
- **Zero Volume Days**: No distributions are made
- **API Failures**: Distributions are marked as failed and can be retried
- **Insufficient Balance**: Partner balance is checked before distribution
- **Duplicate Distributions**: Unique distribution IDs prevent duplicates

## Production Deployment

### Environment Setup
```bash
# Required environment variables
BLOCKSCOUT_API_KEY=your_production_api_key
DATABASE_URL=your_production_database_url
```

### Monitoring Recommendations
1. **Daily Health Checks**: Monitor partner balance and distribution success
2. **Alert on Failures**: Set up alerts for failed distributions
3. **Volume Tracking**: Monitor trading volumes to ensure data integrity
4. **API Rate Limits**: Be aware of Blockscout API rate limits

### Backup Strategy
- **Database Backups**: Regular backups of trading volume and distribution data
- **Configuration Backups**: Backup environment variables and API keys
- **Recovery Procedures**: Document steps to recover from various failure scenarios

## Troubleshooting

### Common Issues

1. **API Key Invalid**
   ```
   Error: BLOCKSCOUT_API_KEY environment variable is required
   ```
   Solution: Check your `.env` file and API key validity

2. **Database Connection Issues**
   ```
   Error: Cannot connect to database
   ```
   Solution: Verify DATABASE_URL and run migrations

3. **No Eligible Traders**
   ```
   No traders found for the specified date
   ```
   Solution: Check if trading volumes were recorded for that date

4. **API Rate Limits**
   ```
   Blockscout API error: 429 Too Many Requests
   ```
   Solution: Implement retry logic with exponential backoff

### Debug Mode
Enable verbose logging by setting:
```bash
DEBUG=merit-distribution
```

## Contributing

When modifying the merit distribution system:

1. **Test Thoroughly**: Run the full test suite before deployment
2. **Update Documentation**: Keep this README current with changes
3. **Monitor Impact**: Watch for any issues after deployment
4. **Backup First**: Always backup data before schema changes

## License

This merit distribution system is part of the larger trading bot project and follows the same MIT license terms. 