import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

const authorize = (...allowedPermissions) => {
  return asyncHandler(async (req, res, next) => {
    const user = req.user;

    if (!user) {
      throw new ApiErrors(401, "Authentication required");
    }

    if (!user.active) {
      throw new ApiErrors(403, "User account is inactive");
    }

    if (user.role === "owner") {
      return next();
    }

    for (const permission of allowedPermissions) {
      if (user.permissions?.[permission]) {
        return next();
      }
    }

    if (user.role === "admin") {
      if (!allowedPermissions.includes("canManageOwners")) {
        return next();
      }
    }

    throw new ApiErrors(403, "Insufficient permissions");
  });
};

const requireOwner = asyncHandler(async (req, res, next) => {
  if (req.user?.role !== "owner") {
    throw new ApiErrors(403, "Owner access required");
  }
  next();
});

const requireAdmin = asyncHandler(async (req, res, next) => {
  if (req.user?.role !== "owner" && req.user?.role !== "admin") {
    throw new ApiErrors(403, "Admin access required");
  }
  next();
});

export { authorize, requireOwner, requireAdmin };
