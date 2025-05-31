# CucumberMoped Testnet Guide

This guide will help you set up and test the CucumberMoped Telegram trading bot on testnet networks.

## 🧪 Testnet Overview

The testnet version uses:
- **Mock 1inch Service**: Simulates trading without real API calls
- **Testnet Tokens**: Uses testnet token addresses
- **Safe Testing**: No real funds at risk

### Supported Testnet Networks

- **Sepolia Testnet** (Ethereum)
- **Base Sepolia** 
- **Arbitrum Sepolia**
- **Polygon Mumbai**

## 🚀 Quick Setup

### 1. Environment Configuration

Copy the testnet environment template:
```bash
cp .env.testnet.example .env.testnet
```

Edit `.env.testnet` with your values:
```bash
# Required: Get from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# Required: Generate encryption key
WALLET_ENCRYPTION_KEY=your_64_character_hex_key_here
```

### 2. Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Create Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`
3. Follow instructions to create your bot
4. Copy the token to your `.env.testnet` file

### 4. Build and Start

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start testnet bot
npm run start:testnet

# Or for development with auto-reload
npm run dev:testnet
```

## 🎮 Testing Commands

Once the bot is running, you can test these commands:

### Basic Commands
- `/start` - Initialize your wallet and get started
- `/help` - Show all available commands
- `/wallet` - Display wallet information
- `/balance` - Check token balances (all will be 0 initially)

### Trading Commands (Mock)
- `/quote ETH USDC 0.1` - Get a mock quote for trading
- `/buy ETH 100` - Simulate buying ETH with USDC
- `/sell ETH 0.1` - Simulate selling ETH for USDC
- `/tokens` - List available testnet tokens

### Token Information
- `/tokens sepolia` - Show tokens on Sepolia
- `/tokens base` - Show tokens on Base Sepolia

## 🧪 What's Simulated

The testnet bot simulates:

1. **Quote Generation**: Mock exchange rates and slippage
2. **Order Placement**: Generates fake order IDs and transaction hashes
3. **Order Status**: Simulates pending → filling → completed status
4. **Gas Estimation**: Returns mock gas estimates
5. **Balance Updates**: Database updates without real blockchain transactions

## 📊 Mock Exchange Rates

The mock service uses simplified exchange rates:
- ETH/USDC: ~1800
- USDC/ETH: ~0.00055
- 0.3% simulated slippage

## 🔍 Monitoring

Watch the console output for:
- `🧪 Mock:` prefixed logs showing simulated operations
- Order status changes
- Database operations
- API simulation delays

## 🛠️ Development

### File Structure
```
src/
├── index.testnet.ts           # Testnet main application
├── services/
│   └── MockOneInchService.ts  # Mock trading service
├── config/
│   └── tokens.testnet.ts      # Testnet token configurations
└── types/
    └── index.ts               # Shared interfaces
```

### Adding New Features

1. Implement in the mock service first
2. Test thoroughly on testnet
3. Add real implementation when ready
4. Update both mainnet and testnet configs

## 🚨 Safety Notes

- Testnet bot uses mock services - no real trades
- Wallets are real but should only hold testnet tokens
- Never use testnet bot with mainnet configurations
- Always test new features on testnet first

## 🔧 Troubleshooting

### Bot Not Responding
1. Check your `TELEGRAM_BOT_TOKEN` is correct
2. Ensure the bot is running (check console output)
3. Verify environment variables are loaded

### Database Issues
```bash
# Clear testnet database if needed
rm ./data/testnet-bot.db
```

### Build Errors
```bash
# Clean and rebuild
npm run clean
npm run build
```

## 📱 Next Steps

1. Test all commands thoroughly
2. Verify wallet creation and management
3. Test quote generation and order simulation
4. Monitor logs for any errors
5. When ready, move to mainnet with real 1inch integration

## 🆘 Support

If you encounter issues:
1. Check the console logs for error messages
2. Verify your `.env.testnet` configuration
3. Ensure all dependencies are installed
4. Try rebuilding the project

---

Happy testing! 🧪✨ 