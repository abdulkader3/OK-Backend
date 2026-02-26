import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
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
  windowMs: 15 * 60 * 1000,
  max: 20,
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

export { registerLimiter, loginIpLimiter };
