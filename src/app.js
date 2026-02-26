import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// Health check endpoint - lightweight, no DB queries
app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus =
    dbState === 1 ? "ok" : dbState === 2 ? "connecting" : "disconnected";

  res.status(200).json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    db: dbStatus,
    queue: { pending: 0 },
    version: getVersion(),
  });
});

// Import Router


// Route

// Global error handler


export { app };
