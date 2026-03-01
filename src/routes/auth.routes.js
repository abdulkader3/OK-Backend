import { Router } from "express";
import {
  register,
  login,
  logout,
  refreshAccessToken,
} from "../controllers/auth.controller.js";
import { optionalAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/register", optionalAuth, register);
router.post("/login", login);
router.post("/logout", logout);
router.post("/refresh-token", refreshAccessToken);

export default router;
