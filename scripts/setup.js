#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function setup() {
  console.log('🚀 Welcome to Telegram Trading Bot Setup!\n');
  
  // Check if .env already exists
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const overwrite = await ask('⚠️  .env file already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      rl.close();
      return;
    }
  }

  console.log('Please provide the following information:\n');

  // Get Telegram Bot Token
  const telegramToken = await ask('📱 Telegram Bot Token (from @BotFather): ');
  if (!telegramToken) {
    console.log('❌ Telegram Bot Token is required!');
    rl.close();
    return;
  }

  // Get 1inch API Key
  const oneInchApiKey = await ask('🔑 1inch API Key (from portal.1inch.dev): ');
  if (!oneInchApiKey) {
    console.log('❌ 1inch API Key is required!');
    rl.close();
    return;
  }

  // Generate encryption key
  console.log('\n🔐 Generating secure encryption key...');
  const encryptionKey = crypto.randomBytes(32).toString('hex');
  console.log(`Generated: ${encryptionKey}`);

  // Create .env file
  const envContent = `# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=${telegramToken}

# 1inch API Configuration
ONEINCH_API_KEY=${oneInchApiKey}
ONEINCH_API_URL=https://api.1inch.dev/fusion-plus

# Encryption (KEEP THIS SECRET!)
WALLET_ENCRYPTION_KEY=${encryptionKey}

# Database
DATABASE_PATH=./data/bot.db

# Network Configuration (chainIds)
ETHEREUM_CHAIN_ID=1
BASE_CHAIN_ID=8453
ARBITRUM_CHAIN_ID=42161
POLYGON_CHAIN_ID=137

# RPC URLs (optional, for direct blockchain interaction)
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your_project_id
BASE_RPC_URL=https://mainnet.base.org
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
POLYGON_RPC_URL=https://polygon-rpc.com
`;

  fs.writeFileSync(envPath, envContent);
  
  // Create data directory
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  console.log('\n✅ Setup complete!');
  console.log('📄 .env file created with your configuration');
  console.log('📁 data/ directory created for database');
  console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
  console.log('• Keep your encryption key safe - it protects user wallets');
  console.log('• Never commit .env file to version control');
  console.log('• Back up your encryption key securely');
  console.log('\n🚀 Ready to start! Run: npm run build && npm start');
  
  rl.close();
}

setup().catch(console.error); 