-- CreateTable
CREATE TABLE "users" (
    "telegram_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT,
    "wallet_address" TEXT NOT NULL,
    "encrypted_private_key" TEXT NOT NULL,
    "world_id_verified" BOOLEAN NOT NULL DEFAULT false,
    "world_id_nullifier_hash" TEXT,
    "world_id_proof" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "token_balances" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "token_address" TEXT NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "balance" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "token_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("telegram_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "from_token" TEXT NOT NULL,
    "to_token" TEXT NOT NULL,
    "from_amount" TEXT NOT NULL,
    "to_amount" TEXT,
    "chain_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "tx_hash" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("telegram_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "trading_volumes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "usdc_volume" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trading_volumes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("telegram_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "merit_distributions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "distribution_id" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "usdc_volume" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "blockscout_tx_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "merit_distributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("telegram_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hedera_topics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic_id" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hedera_topics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("telegram_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hedera_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic_id" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "consensus_timestamp" DATETIME,
    "running_hash" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hedera_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("telegram_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "hedera_messages_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "hedera_topics" ("topic_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "token_balances_user_id_token_address_chain_id_key" ON "token_balances"("user_id", "token_address", "chain_id");

-- CreateIndex
CREATE INDEX "trading_volumes_date_usdc_volume_idx" ON "trading_volumes"("date", "usdc_volume");

-- CreateIndex
CREATE UNIQUE INDEX "trading_volumes_user_id_date_key" ON "trading_volumes"("user_id", "date");

-- CreateIndex
CREATE INDEX "merit_distributions_date_status_idx" ON "merit_distributions"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "merit_distributions_distribution_id_key" ON "merit_distributions"("distribution_id");

-- CreateIndex
CREATE UNIQUE INDEX "hedera_topics_topic_id_key" ON "hedera_topics"("topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "hedera_messages_topic_id_sequence_number_key" ON "hedera_messages"("topic_id", "sequence_number");
