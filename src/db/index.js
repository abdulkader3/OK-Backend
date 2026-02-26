import mongoose from "mongoose";
import DB_NAME from "../constants.js";
import { setServers } from "node:dns/promises";

setServers(["1.1.1.1", "8.8.8.8"]);

const connectDB = async () => {
  try {
    const connectionInstace = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`,
      {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        retryWrites: true,
        retryReads: true,
      }
    );
    console.log(
      `mongoDB connect 🌸 😊 👉  ${connectionInstace.connection.host}`
    );
  } catch (error) {
    console.log(`MongoDB connect er error 😫👉`, error);
    process.exit(1);
  }
};

export default connectDB;
