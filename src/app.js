import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";

import { globalErrorHandler } from "./middlewares/error-handler.middleware.js";
import { requestLogger } from "./middlewares/request-logger.middleware.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

app.use(requestLogger);

app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus =
    dbState === 1 ? "ok" : dbState === 2 ? "connecting" : "disconnected";

  res.status(200).json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    db: dbStatus,
    queue: { pending: 0 },
    version: "1.0.0",
  });
});

app.use(globalErrorHandler);

export { app };
