# 🥒 CucumberMoped Charts Mini App

A modern Telegram Mini App for displaying real-time cryptocurrency price charts using GeckoTerminal iframe embeds.

## Features

- 📊 **Real-time Charts**: View live price charts for 25+ supported tokens
- 🔍 **Search & Filter**: Find tokens by symbol or filter by blockchain
- 📱 **Responsive Design**: Optimized for mobile and desktop
- 🎨 **Modern UI**: Beautiful gradient design with smooth animations
- ⚡ **Fast Loading**: Lazy-loaded iframes for optimal performance

## Supported Tokens

### Ethereum (🔷)
- ETH, WBTC, AAVE, PEPE, LINK, UNI, SEI, MOG, SPX

### Base (🔵) 
- USDC, cbBTC, VIRTUAL, DEGEN, BRETT, TOSHI, AERO, ZORA, KAITO, BGCI, MORPHO

### Arbitrum (🔴)
- PENDLE, CRV, ZRO, ATH, GMX, GRT

### Polygon (🟣)
- POL

## Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Serve built files
npm run serve
```

### Configuration
The app runs on port 3002 by default and accepts connections from all hosts (0.0.0.0) for Telegram Mini App integration.

## Usage in Telegram Bot

Add this Mini App URL to your Telegram bot for the `/charts` command:
```
https://your-domain.com/charts-miniapp
```

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development and building
- **React Router** for client-side routing
- **GeckoTerminal** iframe embeds for charts
- **Telegram Web App SDK** for integration

## Routes

- `/` - Home page with app overview
- `/charts` - Token list view
- `/charts/:symbol` - Individual token chart view

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.
