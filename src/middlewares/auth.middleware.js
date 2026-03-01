import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
  let token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    token = req.cookies?.accessToken;
  }

  if (!token) {
    throw new ApiErrors(401, "Authentication required");
  }

  const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

  const user = await User.findById(decodedToken?.id);

  if (!user) {
    throw new ApiErrors(401, "User not found or inactive");
  }

  if (!user.active) {
    throw new ApiErrors(401, "User account is inactive");
  }

  req.user = user;
  next();
});

export const optionalAuth = asyncHandler(async (req, res, next) => {
  let token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    token = req.cookies?.accessToken;
  }

  if (!token) {
    return next();
  }

  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decodedToken?.id);

    if (user && user.active) {
      req.user = user;
    }
  } catch {
    // Token invalid, continue without user
  }

  next();
});

export const authenticate = verifyJWT;
