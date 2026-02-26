import { setServers } from "node:dns/promises";
setServers(["1.1.1.1", "8.8.8.8"]);

import mongoose from "mongoose";
import logger from "../config/logger.js";
import DB_NAME from "../constants.js";

const connectDB = async () => {
  try {
    const connectionInstace = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`,
      {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        minPoolSize: 2,
        retryWrites: true,
        retryReads: true,
        w: "majority",
      }
    );
    logger.info({
      msg: "MongoDB connected",
      host: connectionInstace.connection.host,
      database: DB_NAME,
    });
  } catch (error) {
    logger.error({
      msg: "MongoDB connection error",
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
};

const withTransaction = async (fn) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    session.endSession();
  }
};

export { withTransaction };
export default connectDB;
