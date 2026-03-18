import mongoose from "mongoose";

const MIGRATION_NAME = "002-add-isPaid-to-bills";

async function migrate() {
  console.log(`[${MIGRATION_NAME}] Starting migration...`);

  const dbName = process.env.DB_NAME || "Expence";
  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";

  if (!mongoose.connection.readyState) {
    await mongoose.connect(`${mongoUri}/${dbName}`);
  }

  const BigBossBill = mongoose.model(
    "BigBossBill",
    new mongoose.Schema({
      isPaid: Boolean,
      paidAt: Date,
    })
  );

  const result = await BigBossBill.updateMany(
    { isPaid: { $exists: false } },
    { $set: { isPaid: false, paidAt: null } }
  );

  console.log(`[${MIGRATION_NAME}] Updated ${result.modifiedCount} bills`);

  const remaining = await BigBossBill.countDocuments({
    isPaid: { $exists: false },
  });
  if (remaining === 0) {
    console.log(`[${MIGRATION_NAME}] Migration completed successfully`);
  } else {
    console.log(
      `[${MIGRATION_NAME}] Warning: ${remaining} bills still need updating`
    );
  }

  await mongoose.disconnect();
  console.log(`[${MIGRATION_NAME}] Disconnected from database`);
}

migrate().catch((err) => {
  console.error(`[${MIGRATION_NAME}] Migration failed:`, err);
  process.exit(1);
});
