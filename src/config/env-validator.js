import dotenv from "dotenv";

dotenv.config("./.env");

const REQUIRED_ENV_VARS = [
  "MONGODB_URI",
  "ACCESS_TOKEN_SECRET",
  "ACCESS_TOKEN_EXPIRY",
  "REFRESH_TOKEN_SECRET",
  "REFRESH_TOKEN_EXPIRY",
  "CLOUDINARY_API_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "PORT",
  "CORS_ORIGIN",
];

const REQUIRED_NODE_ENV = ["development", "production", "test"];

/**
 * Validates required environment variables at bootstrap
 * Fails fast if any required variable is missing
 */
function validateEnv() {
  const missingVars = [];
  const warnings = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }

  if (!process.env.NODE_ENV) {
    warnings.push("NODE_ENV not set, defaulting to 'development'");
    process.env.NODE_ENV = "development";
  } else if (!REQUIRED_NODE_ENV.includes(process.env.NODE_ENV)) {
    warnings.push(
      `NODE_ENV should be one of: ${REQUIRED_NODE_ENV.join(", ")}`
    );
  }

  if (process.env.CORS_ORIGIN === "*") {
    warnings.push(
      "WARNING: CORS_ORIGIN is set to '*' - this is insecure for production!"
    );
  }

  if (process.env.ACCESS_TOKEN_SECRET && process.env.ACCESS_TOKEN_SECRET.length < 32) {
    warnings.push("WARNING: ACCESS_TOKEN_SECRET should be at least 32 characters");
  }

  if (missingVars.length > 0) {
    console.error("ERROR: Missing required environment variables:");
    for (const varName of missingVars) {
      console.error(`  - ${varName}`);
    }
    console.error("\nPlease add these variables to your .env file");
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn("\nENVIRONMENT WARNINGS:");
    for (const warning of warnings) {
      console.warn(`  - ${warning}`);
    }
    console.warn("");
  }

  console.log("✓ Environment validation passed");
  console.log(`  NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`  PORT: ${process.env.PORT}`);
  console.log(`  CORS_ORIGIN: ${process.env.CORS_ORIGIN}`);
  console.log(`  MONGODB_URI: ${process.env.MONGODB_URI?.replace(/\/\/.*:.*@/, "//****:****@")}`);
}

validateEnv();

export { validateEnv };
