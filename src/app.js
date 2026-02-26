import { v2 as cloudinary } from "cloudinary";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import swaggerJsDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import { globalErrorHandler } from "./middlewares/error-handler.middleware.js";
import { requestLogger } from "./middlewares/request-logger.middleware.js";

import auditRoutes from "./routes/audit.routes.js";
import authRoutes from "./routes/auth.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import ledgerRoutes from "./routes/ledger.routes.js";
import metricsRoutes from "./routes/metrics.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import syncRoutes from "./routes/sync.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import userRoutes from "./routes/user.routes.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_API_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

const getCloudinaryHealth = async () => {
  try {
    await cloudinary.api.ping();
    return "ok";
  } catch {
    return "error";
  }
};

app.get("/health", async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "ok" : mongoose.connection.readyState === 2 ? "connecting" : "disconnected";
  
  let cloudinaryStatus = "not_configured";
  if (process.env.CLOUDINARY_API_NAME && process.env.CLOUDINARY_API_KEY) {
    cloudinaryStatus = await getCloudinaryHealth();
  }

  const overallStatus = dbStatus === "ok" ? "ok" : "degraded";

  const statusCode = overallStatus === "ok" ? 200 : 503;

  res.status(statusCode).json({
    status: overallStatus,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    components: {
      db: dbStatus,
      cloudinary: cloudinaryStatus,
    },
    version: "1.0.0",
  });
});

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "OK Backend API",
      version: "1.0.0",
      description: "Expense tracking backend API",
    },
    servers: [
      {
        url: "http://localhost:4000",
        description: "Development server",
      },
    ],
  },
  apis: ["./docs/openapi.yaml"],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ledgers", ledgerRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/sync", syncRoutes);
app.use("/metrics", metricsRoutes);

app.use(globalErrorHandler);

export { app };
