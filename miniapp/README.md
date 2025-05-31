# CucumberMoped Telegram Mini App

This is the Telegram Mini App for World ID verification in the CucumberMoped trading bot.

## Setup

### 1. Install Dependencies
```bash
cd miniapp
npm install
```

### 2. Build the Mini App
```bash
npm run build
```

### 3. Development Mode
```bash
npm run dev
```

## How it Works

1. **User clicks "Verify" in the Telegram bot**
2. **Bot opens this Mini App in Telegram**
3. **Mini App shows World ID verification widget**
4. **User completes verification with World ID**
5. **Mini App sends proof to backend API**
6. **Backend verifies proof with World ID and updates database**
7. **User can return to bot and start trading**

## Technology Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **@worldcoin/idkit** - World ID React widget
- **@telegram-apps/sdk** - Telegram Mini App SDK

## File Structure

```
miniapp/
├── src/
│   ├── App.tsx           # Main app component with World ID widget
│   ├── main.tsx          # React entry point
│   └── types/
│       └── telegram.d.ts # Telegram Web App type definitions
├── public/
│   └── index.html        # HTML template with Telegram script
├── package.json          # Dependencies and scripts
└── vite.config.ts        # Vite configuration
```

## Configuration

The app uses these World ID settings:
- **App ID**: `app_staging_4f70c156cb934ff77b85aa6b901540a1`
- **Action**: `identity-verification`
- **Signal**: User's Telegram ID

## API Endpoints

The Mini App communicates with these backend endpoints:
- `POST /api/verify-worldid` - Submit World ID proof
- `GET /api/verify-status/:userId` - Check verification status

## Deployment

For production, you'll need to:
1. Deploy the Mini App to a public HTTPS URL
2. Register the Mini App with BotFather
3. Update the `web_app.url` in the bot to point to your deployed URL 