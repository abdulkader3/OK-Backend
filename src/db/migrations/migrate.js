import { readdirSync } from "fs";
import { join, basename } from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config("./.env");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, "migrations");

const MigrationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  appliedAt: { type: Date, default: Date.now },
});

let Migration;

async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const dbName = process.env.DB_NAME || "Expence";
  
  await mongoose.connect(`${uri}/${dbName}`);
  Migration = mongoose.model("Migration", MigrationSchema, "migrations");
  console.log("Connected to MongoDB for migrations");
}

async function getAppliedMigrations() {
  const migrations = await Migration.find({}, "name").lean();
  return new Set(migrations.map((m) => m.name));
}

async function markMigrationApplied(name) {
  await Migration.create({ name });
}

async function runMigrations() {
  try {
    await connectDB();
  } catch (err) {
    console.log("MongoDB not available - skipping migrations");
    console.log("Migrations will run when database is available");
    process.exit(0);
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort();

  const appliedMigrations = await getAppliedMigrations();
  const pendingMigrations = files.filter(
    (f) => !appliedMigrations.has(basename(f, ".js"))
  );

  console.log(`Found ${files.length} migrations, ${pendingMigrations.length} pending`);

  for (const file of pendingMigrations) {
    const name = basename(file, ".js");
    console.log(`Running migration: ${name}`);
    
    try {
      const migrationModule = await import(join(MIGRATIONS_DIR, file));
      const up = migrationModule.up;
      
      if (typeof up === "function") {
        await up();
        await markMigrationApplied(name);
        console.log(`✓ Migration applied: ${name}`);
      } else {
        console.warn(`Warning: Migration ${file} has no up() function`);
      }
    } catch (error) {
      console.error(`✗ Migration failed: ${name}`, error.message);
      process.exit(1);
    }
  }

  if (pendingMigrations.length === 0) {
    console.log("No migrations to run");
  }

  console.log("Migration complete");
  await mongoose.disconnect();
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
