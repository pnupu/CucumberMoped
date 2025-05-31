# Migration to Prisma Guide

This guide will help you migrate from the raw SQLite3 database implementation to Prisma for better type safety, easier migrations, and improved developer experience.

## Overview

The migration process involves:
1. Setting up Prisma with your existing database structure
2. Creating a new Prisma-based database service
3. Migrating existing data from the old database to the new one
4. Gradually replacing the old service with the new one

## What's Been Done

### 1. Prisma Setup
- ✅ Installed Prisma dependencies (`prisma` and `@prisma/client`)
- ✅ Created Prisma schema file (`prisma/schema.prisma`) matching your current database structure
- ✅ Generated Prisma client

### 2. New Database Service
- ✅ Created `PrismaDatabaseService` (`src/services/PrismaDatabaseService.ts`)
- ✅ Implemented all methods from the original `DatabaseService`
- ✅ Added type conversion methods between Prisma types and your interfaces
- ✅ Added additional utility methods for better relational data access

### 3. Migration Scripts
- ✅ Created data migration script (`src/scripts/migrate-to-prisma.ts`)
- ✅ Created test script (`src/scripts/test-prisma.ts`)
- ✅ Added npm scripts for easy execution

## Migration Steps

### Step 1: Set Environment Variable

You need to set the `DATABASE_URL` environment variable. Add it to your `.env` file:

```env
DATABASE_URL="file:./data/bot.db"
```

Or for the new Prisma database:
```env
DATABASE_URL="file:./data/prisma-bot.db"
```

### Step 2: Run the Migration

Execute the migration script to transfer your existing data:

```bash
npm run migrate:to-prisma
```

This will:
- Create a new database (`data/prisma-bot.db`) with Prisma's structure
- Copy all users, token balances, transactions, Hedera topics, and messages
- Handle duplicates gracefully (skip existing records)

### Step 3: Test the Migration

Verify everything works correctly:

```bash
npm run test:prisma
```

This will test all the database operations and show you the migrated data.

### Step 4: Update Your Application

Now you can start using the new `PrismaDatabaseService` in your application.

#### Option A: Gradual Migration (Recommended)

Replace the old service gradually by updating imports:

```typescript
// Old way
import { DatabaseService } from './services/DatabaseService';

// New way
import { PrismaDatabaseService as DatabaseService } from './services/PrismaDatabaseService';
```

#### Option B: Side-by-side

Keep both services and migrate one component at a time:

```typescript
import { DatabaseService } from './services/DatabaseService';
import { PrismaDatabaseService } from './services/PrismaDatabaseService';

// Use old for some operations, new for others during transition
```

## Benefits of Prisma

### 1. Type Safety
```typescript
// Prisma provides full type safety
const user = await prisma.user.findUnique({
  where: { telegramId: 12345 },
  include: { tokenBalances: true } // Auto-completion and type checking
});
```

### 2. Better Queries
```typescript
// Complex queries are easier with Prisma
const userWithData = await db.getUserWithRelations(telegramId);
const topicWithMessages = await db.getTopicWithMessages(topicId);
```

### 3. Easier Database Management
```bash
# View your data with Prisma Studio
npm run prisma:studio

# Generate client after schema changes
npm run prisma:generate

# Create and run migrations
npm run prisma:migrate
```

### 4. Better Error Handling
Prisma provides detailed error codes for database constraint violations, making error handling more precise.

## Database Schema Comparison

### Old SQLite Schema (manual)
- Manual table creation with raw SQL
- No type safety
- Manual foreign key management

### New Prisma Schema (managed)
- Declarative schema definition
- Full TypeScript integration
- Automatic relationship management
- Built-in migration system

## Migration Script Details

The migration script (`src/scripts/migrate-to-prisma.ts`) handles:

1. **Users**: Transfers all user data including World ID verification
2. **Token Balances**: Preserves all token balance records
3. **Transactions**: Copies all transaction history
4. **Hedera Topics**: Migrates all Hedera topic records
5. **Hedera Messages**: Transfers all message data with proper relationships

## Rollback Plan

If you need to rollback:

1. Keep your original database file (`data/bot.db`)
2. Switch back to using `DatabaseService` instead of `PrismaDatabaseService`
3. The original database remains unchanged during migration

## Production Deployment

For production:

1. **Backup your database** before migration
2. Test the migration on a copy first
3. Plan for downtime during the migration
4. Update your environment variables to point to the new database
5. Monitor for any issues after deployment

## Environment-Specific Migration

### Development
```bash
DATABASE_URL="file:./data/prisma-bot.db" npm run migrate:to-prisma
```

### Testnet
```bash
DATABASE_URL="file:./data/prisma-testnet-bot.db" npm run migrate:to-prisma
```

## New Features Available

With Prisma, you now have access to:

1. **Prisma Studio** - Visual database browser
2. **Automatic migrations** - Schema versioning
3. **Type-safe queries** - Full TypeScript support
4. **Relation loading** - Easy to fetch related data
5. **Query optimization** - Built-in query optimization
6. **Connection pooling** - Better performance at scale

## Next Steps

1. Run the migration on your development environment
2. Test thoroughly with your existing flows
3. Update your application code to use `PrismaDatabaseService`
4. Plan the production migration
5. Remove the old `DatabaseService` once fully migrated

## Troubleshooting

### Common Issues

1. **"Database does not exist"** - Make sure DATABASE_URL points to the correct file
2. **"Permission denied"** - Check file permissions on the data directory
3. **"Constraint violation"** - Usually means data already exists, safe to ignore

### Getting Help

- Check Prisma documentation: https://www.prisma.io/docs
- Use `npm run prisma:studio` to inspect your data visually
- Run `npm run test:prisma` to verify everything is working 