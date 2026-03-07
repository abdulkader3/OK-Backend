import { Router } from "express";
import {
  register,
  login,
  logout,
  refreshAccessToken,
} from "../controllers/auth.controller.js";
import { optionalAuth, authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/register", optionalAuth, register);
router.post("/login", login);
router.post("/logout", authenticate, logout);
router.post("/refresh-token", refreshAccessToken);

export default router;
