import dotenv from "dotenv";
import "./config/env-validator.js";
import { app } from "./app.js";
import logger from "./config/logger.js";
import connectDB from "./db/index.js";

dotenv.config("./.env");

logger.info({
  msg: "Application starting",
  version: "1.0.0",
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT || 4000,
});

connectDB()
  .then(() => {
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on http://0.0.0.0:${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });
  })

  .catch((error) => {
    logger.error("Mongodb connection error", error);
  });
