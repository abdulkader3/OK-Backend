import jwt from "jsonwebtoken";
import { User, AuditLog } from "../models/index.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { id: userId },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1d" }
  );

  const refreshToken = jwt.sign(
    { id: userId },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "10d" }
  );

  return { accessToken, refreshToken };
};

const register = asyncHandler(async (req, res, _next) => {
  const { name, email, password, phone, company, role } = req.body;

  const existingUser = await User.findOne({ email: email?.toLowerCase() });
  if (existingUser) {
    throw new ApiErrors(409, "Email already registered");
  }

  const userRole = role || "owner";
  const isFirstUser = (await User.countDocuments()) === 0;
  const finalRole = isFirstUser ? "owner" : userRole;

  const user = await User.create({
    name,
    email: email?.toLowerCase(),
    passwordHash: password,
    phone,
    company,
    role: finalRole,
  });

  const isAuthenticated = !!req.user;
  const isFirstUserRegistration = isFirstUser;

  if (!isAuthenticated || isFirstUserRegistration) {
    const { accessToken, refreshToken } = generateTokens(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    };

    await AuditLog.create({
      operation: "create",
      collection: "users",
      docId: user._id,
      userId: user._id,
      userEmail: user.email,
      after: user.toJSON(),
    });

    res
      .status(201)
      .cookie("refreshToken", refreshToken, options)
      .cookie("accessToken", accessToken, options)
      .json({
        success: true,
        data: {
          user: user.toJSON(),
          tokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
          },
        },
        message: "User registered successfully",
      });
  } else {
    await AuditLog.create({
      operation: "create",
      collection: "users",
      docId: user._id,
      userId: req.user._id,
      userEmail: req.user.email,
      after: user.toJSON(),
    });

    res.status(201).json({
      success: true,
      data: {
        user: user.toJSON(),
      },
      message: "Staff member created successfully",
    });
  }
});

const login = asyncHandler(async (req, res, _next) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email?.toLowerCase() });

  if (!user) {
    throw new ApiErrors(401, "Invalid email or password");
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    throw new ApiErrors(401, "Invalid email or password");
  }

  if (!user.active) {
    throw new ApiErrors(403, "User account is inactive");
  }

  const { accessToken, refreshToken } = generateTokens(user._id);

  user.refreshToken = refreshToken;
  user.lastLogin = new Date();
  await user.save();

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };

  await AuditLog.create({
    operation: "login",
    collection: "users",
    docId: user._id,
    userId: user._id,
    userEmail: user.email,
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  res
    .status(200)
    .cookie("refreshToken", refreshToken, options)
    .cookie("accessToken", accessToken, options)
    .json({
      success: true,
      data: {
        user: user.toJSON(),
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
        },
      },
      message: "Login successful",
    });
});

const logout = asyncHandler(async (req, res, _next) => {
  const user = req.user;

  await User.findByIdAndUpdate(user._id, { refreshToken: null });

  await AuditLog.create({
    operation: "logout",
    collection: "users",
    docId: user._id,
    userId: user._id,
    userEmail: user.email,
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  res.status(200).clearCookie("refreshToken").clearCookie("accessToken").json({
    success: true,
    message: "Logout successful",
  });
});

const refreshAccessToken = asyncHandler(async (req, res, _next) => {
  const token = req.cookies?.refreshToken || req.body.refreshToken;

  if (!token) {
    throw new ApiErrors(401, "Refresh token required");
  }

  const decodedToken = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

  const user = await User.findById(decodedToken.id);

  if (!user || user.refreshToken !== token) {
    throw new ApiErrors(401, "Invalid refresh token");
  }

  const { accessToken, refreshToken: newRefreshToken } = generateTokens(
    user._id
  );

  user.refreshToken = newRefreshToken;
  await user.save();

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };

  res
    .status(200)
    .cookie("refreshToken", newRefreshToken, options)
    .cookie("accessToken", accessToken, options)
    .json({
      success: true,
      data: {
        access_token: accessToken,
        refresh_token: newRefreshToken,
      },
    });
});

export { register, login, logout, refreshAccessToken };
