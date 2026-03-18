/**
 * Migration: Create LedgerTransaction entries from existing Ledgers
 *
 * OPTIONAL - Run manually only if you want historical month data
 *
 * Usage:
 *   node src/db/migrations/003-create-ledger-transactions.js
 *
 * What it does:
 *   - For each Ledger with outstandingBalance > 0
 *   - Creates a LedgerTransaction with amount = outstandingBalance
 *   - Uses ledger.createdAt as transactionDate if available, else now()
 *   - Marks source: "migration" for rollback capability
 *
 * Rollback:
 *   db.ledgertransactions.deleteMany({ source: "migration" })
 */

import mongoose from "mongoose";

const MIGRATION_NAME = "003-create-ledger-transactions";

const RUN_MIGRATION = false;

async function migrate() {
  console.log(`[${MIGRATION_NAME}] Starting migration...`);
  console.log(`[${MIGRATION_NAME}] RUN_MIGRATION is set to: ${RUN_MIGRATION}`);

  if (!RUN_MIGRATION) {
    console.log(
      `[${MIGRATION_NAME}] Migration skipped. Set RUN_MIGRATION = true to run.`
    );
    console.log(`[${MIGRATION_NAME}] Exiting.`);
    process.exit(0);
  }

  const dbName = process.env.DB_NAME || "Expence";
  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";

  if (!mongoose.connection.readyState) {
    await mongoose.connect(`${mongoUri}/${dbName}`);
  }

  const Ledger = mongoose.model(
    "Ledger",
    new mongoose.Schema({
      ownerId: mongoose.Schema.Types.ObjectId,
      type: String,
      outstandingBalance: Number,
      createdAt: Date,
      updatedAt: Date,
    })
  );

  const LedgerTransactionSchema = new mongoose.Schema(
    {
      ledgerId: mongoose.Schema.Types.ObjectId,
      ownerId: mongoose.Schema.Types.ObjectId,
      amount: mongoose.Schema.Types.Decimal128,
      type: String,
      transactionDate: Date,
      source: String,
      description: String,
    },
    { timestamps: true }
  );

  const LedgerTransaction = mongoose.model(
    "LedgerTransaction",
    LedgerTransactionSchema
  );

  const ledgers = await Ledger.find({
    outstandingBalance: { $gt: 0 },
    deletedAt: null,
  });

  console.log(
    `[${MIGRATION_NAME}] Found ${ledgers.length} ledgers with outstanding balance`
  );

  const transactions = [];

  for (const ledger of ledgers) {
    const existingTx = await LedgerTransaction.findOne({
      ledgerId: ledger._id,
      source: "migration",
    });

    if (existingTx) {
      console.log(
        `[${MIGRATION_NAME}] Skipping ledger ${ledger._id} - already migrated`
      );
      continue;
    }

    const transactionDate = ledger.createdAt || new Date();

    transactions.push({
      ledgerId: ledger._id,
      ownerId: ledger.ownerId,
      amount: mongoose.Types.Decimal128.fromString(
        ledger.outstandingBalance.toString()
      ),
      type: ledger.type,
      transactionDate,
      source: "migration",
      description: `Migrated from ledger outstandingBalance (${ledger.outstandingBalance})`,
    });
  }

  if (transactions.length > 0) {
    const result = await LedgerTransaction.insertMany(transactions);
    console.log(
      `[${MIGRATION_NAME}] Created ${result.length} LedgerTransaction entries`
    );
  } else {
    console.log(`[${MIGRATION_NAME}] No new transactions to create`);
  }

  const totalMigrated = await LedgerTransaction.countDocuments({
    source: "migration",
  });
  console.log(
    `[${MIGRATION_NAME}] Total migrated transactions: ${totalMigrated}`
  );
  console.log(`[${MIGRATION_NAME}] Migration completed successfully`);

  await mongoose.disconnect();
  console.log(`[${MIGRATION_NAME}] Disconnected from database`);
}

migrate().catch((err) => {
  console.error(`[${MIGRATION_NAME}] Migration failed:`, err);
  process.exit(1);
});
