import logger from "../config/logger.js";
import { ApiErrors } from "../utils/ApiErrors.js";

/**
 * Centralized error handler middleware
 * Catches all unhandled errors and returns consistent JSON response
 */
const globalErrorHandler = (err, req, res, _next) => {
  let error = err;

  if (!(err instanceof ApiErrors)) {
    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const errors = err.errors || [];
    const stack = process.env.NODE_ENV === "development" ? err.stack : undefined;

    error = new ApiErrors(statusCode, message, errors, stack);
  }

  const response = {
    success: false,
    message: error.message,
    errors: error.errors,
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  };

  logger.error({
    msg: error.message,
    statusCode: error.statusCode,
    method: req.method,
    path: req.path,
    userId: req.user?._id,
    stack: error.stack,
  });

  res.status(error.statusCode).json(response);
};

/**
 * Async handler wrapper to catch errors in async routes
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export { globalErrorHandler, asyncHandler };
