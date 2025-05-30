# Telegram Trading Bot

A Telegram bot for trading cryptocurrencies using 1inch Fusion+ protocol. Users can create wallets, deposit funds, and swap tokens directly through Telegram.

## 🚀 Features

- **Wallet Management**: Generate secure wallets for each user
- **Token Deposits**: Users can deposit USDC and other supported tokens
- **Token Swapping**: Buy/sell tokens using 1inch Fusion+ protocol
- **Multi-chain Support**: Ethereum, Base, Arbitrum, Polygon
- **Secure Storage**: Encrypted private keys with AES-256-CBC
- **Transaction History**: Track all trading activity
- **Real-time Quotes**: Get live pricing before trading

## 📋 Requirements

- Node.js 18+
- npm or yarn
- Telegram Bot Token (from @BotFather)
- 1inch API Key

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd telegram-trading-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` and add your configuration:
   ```env
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   ONEINCH_API_KEY=your_1inch_api_key_here
   ONEINCH_API_URL=https://api.1inch.dev/fusion-plus
   WALLET_ENCRYPTION_KEY=your_64_character_hex_encryption_key
   DATABASE_PATH=./data/bot.db
   ```

4. **Generate encryption key**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. **Build the project**
   ```bash
   npm run build
   ```

6. **Start the bot**
   ```bash
   npm start
   ```

   For development:
   ```bash
   npm run dev
   ```

## 🔑 Getting API Keys

### Telegram Bot Token
1. Message @BotFather on Telegram
2. Use `/newbot` command
3. Follow instructions to create your bot
4. Copy the provided token

### 1inch API Key
1. Visit [1inch Developer Portal](https://portal.1inch.dev/)
2. Sign up and create an API key
3. Enable Fusion+ access

## 📱 Bot Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Create wallet or login | `/start` |
| `/wallet` | Show wallet info | `/wallet` |
| `/balance` | Show token balances | `/balance` |
| `/buy` | Buy tokens | `/buy 100 USDC ETH` |
| `/sell` | Sell tokens | `/sell 0.1 ETH USDC` |
| `/quote` | Get price quote | `/quote 100 USDC ETH` |
| `/tokens` | List supported tokens | `/tokens` |
| `/history` | Transaction history | `/history` |
| `/help` | Show help | `/help` |

## 🪙 Supported Tokens

### Ethereum
- ETH (Wrapped Ether)
- USDC (USD Coin)
- WBTC (Wrapped Bitcoin)
- AAVE, PEPE, LINK, UNI

### Base
- USDC, cbBTC, VIRTUAL, DEGEN, BRETT

### Arbitrum
- PENDLE, CRV, GMX

### Polygon
- POL (Polygon)

## 🏗️ Architecture

```
src/
├── types/           # TypeScript type definitions
├── config/          # Configuration files (tokens, chains)
├── services/        # Core business logic
│   ├── DatabaseService.ts     # SQLite database operations
│   ├── WalletService.ts       # Wallet generation & encryption
│   ├── OneInchService.ts      # 1inch Fusion+ integration
│   └── TelegramBotService.ts  # Telegram bot handlers
└── index.ts         # Application entry point
```

## 🔒 Security Features

- **Encrypted Storage**: Private keys encrypted with AES-256-CBC
- **Secure Key Generation**: Cryptographically secure random wallets
- **Environment Isolation**: Sensitive data in environment variables
- **Input Validation**: All user inputs validated and sanitized
- **Error Handling**: Comprehensive error handling and logging

## 🚦 Getting Started

1. **Start the bot** by sending `/start` to your Telegram bot
2. **Save your mnemonic phrase** - this is your wallet backup!
3. **Deposit USDC** to your wallet address (shown in `/wallet`)
4. **Start trading** with `/buy` or get quotes with `/quote`

## 📊 Example Trading Flow

1. User sends `/start` → Bot creates wallet
2. User deposits 1000 USDC to wallet address
3. User sends `/quote 500 USDC ETH` → Bot shows price
4. User sends `/buy 500 USDC ETH` → Bot shows confirmation
5. User clicks "Confirm" → Bot executes trade via 1inch Fusion+
6. User receives trade confirmation and updated balances

## 🐛 Troubleshooting

### Common Issues

1. **"Module not found" errors**
   ```bash
   npm install
   npm run build
   ```

2. **"Invalid encryption key" error**
   - Ensure WALLET_ENCRYPTION_KEY is 64 hex characters
   - Generate new key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

3. **Telegram bot not responding**
   - Check TELEGRAM_BOT_TOKEN is correct
   - Ensure bot is started with `/start` command

4. **1inch API errors**
   - Verify ONEINCH_API_KEY is valid
   - Check API rate limits
   - Ensure wallet has sufficient balance

## 📝 Development

### Running Tests
```bash
npm test
```

### Code Formatting
```bash
npm run format
```

### Type Checking
```bash
npm run type-check
```

## 🔗 Useful Links

- [1inch Fusion+ Documentation](https://docs.1inch.io/docs/fusion-plus/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [ethers.js Documentation](https://docs.ethers.org/)

## ⚠️ Disclaimers

- **Educational Purpose**: This bot is for educational/demonstration purposes
- **Security**: Always review and audit code before handling real funds
- **Testnet First**: Test on testnets before using mainnet
- **No Financial Advice**: This is not financial advice - trade at your own risk
- **Private Keys**: Never share your private keys or mnemonic phrases

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Check existing documentation
- Review troubleshooting section above 