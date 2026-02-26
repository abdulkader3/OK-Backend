import jwt from "jsonwebtoken";
import { ApiErrors } from "../utils/ApiErrors.js";
import User from "../models/user.model.js";
import { asyncHandlers } from "../utils/asyncHandlers.js";

export const verifyJWT = asyncHandlers(async (req, res, next) => {
  try {
    // Check for Authorization header token (access token)
    let token = req.header("Authorization")?.replace("Bearer ", "");
    let isAccessToken = !!req.header("Authorization")?.includes("Bearer ");

    // If no Authorization header, check for accessToken in cookies
    if (!token) {
      token = req.cookies?.accessToken;
      isAccessToken = true; // Cookie accessToken is still an access token
    }

    // If still no token, check for refresh token in cookies
    if (!token) {
      token = req.cookies?.refreshToken;
      isAccessToken = false;
    }

    if (!token) {
      throw new ApiErrors(401, "unauthorized request");
    }

    // Use appropriate secret based on token type
    const secret = isAccessToken
      ? process.env.ACCESS_TOKEN_SECRET
      : process.env.REFRESH_TOKEN_SECRET;

    const decodedToken = jwt.verify(token, secret);

    const user = await User.findById(decodedToken?.id).select(
      "-password_hash -refresh_token"
    );

    if (!user) {
      throw new ApiErrors(401, "token expired");
    }

    req.user = user;
    next();
  } catch (error) {
    throw new ApiErrors(401, error?.message || "Invalid token");
  }
});

export const verifyAdmin = asyncHandlers(async (req, res, next) => {
  try {
    // Verify token directly (don't call verifyJWT as middleware)
    let token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      token = req.cookies?.accessToken;
    }

    if (!token) {
      throw new ApiErrors(401, "unauthorized request");
    }

    console.log("=== Admin Auth Debug ===");
    console.log("Token found:", token.substring(0, 20) + "...");

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    console.log("Token decoded successfully");
    console.log("Token payload _id:", decodedToken._id);
    console.log("Token payload role:", decodedToken.role);

    // Fetch user to verify they exist and get full details
    const user = await User.findById(decodedToken._id).select(
      "-password -refreshToken"
    );

    if (!user) {
      console.log("❌ User not found in database");
      throw new ApiErrors(401, "User not found");
    }

    console.log("User from DB:", user.email);
    console.log("User role from DB:", user.role);
    console.log("========================");

    // Check if user has admin or developer_admin role
    const userRole = user.role || decodedToken.role;

    if (userRole !== "admin" && userRole !== "developer_admin") {
      console.log("❌ Access denied - role:", userRole);
      throw new ApiErrors(403, "Access denied. Admin privileges required.");
    }

    console.log("✅ Admin access granted - role:", userRole);

    // Set req.user for downstream use
    req.user = user;

    next();
  } catch (error) {
    console.log("❌ Admin verification error:", error.message);
    if (error.statusCode === 403) {
      throw error;
    }
    throw new ApiErrors(401, error?.message || "Invalid token");
  }
});
