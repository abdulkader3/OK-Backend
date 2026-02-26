import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "100", 10);
const LOGIN_LIMIT_WINDOW_MS = parseInt(process.env.LOGIN_LIMIT_WINDOW_MS || "900000", 10);
const LOGIN_LIMIT_MAX = parseInt(process.env.LOGIN_LIMIT_MAX || "20", 10);
const REGISTER_LIMIT_MAX = parseInt(process.env.REGISTER_LIMIT_MAX || "5", 10);

const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: REGISTER_LIMIT_MAX,
  message: {
    success: false,
    message: "Too many registration attempts, please try again after 1 minute",
    errors: [],
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

const loginIpLimiter = rateLimit({
  windowMs: LOGIN_LIMIT_WINDOW_MS,
  max: LOGIN_LIMIT_MAX,
  message: {
    success: false,
    message:
      "Too many login attempts from this IP, please try again after 15 minutes",
    errors: [],
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req, res) => ipKeyGenerator(req, res),
});

const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  message: {
    success: false,
    message: "Too many requests, please try again later",
    errors: [],
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export { registerLimiter, loginIpLimiter, apiLimiter };
