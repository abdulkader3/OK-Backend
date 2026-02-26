import { Router } from "express";
import { getAllUsers, getUserById, updateUserPermissions, deactivateUser } from "../controllers/user.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/permission.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/", requireAdmin, getAllUsers);
router.get("/:id", getUserById);
router.patch("/:id/permissions", requireAdmin, updateUserPermissions);
router.delete("/:id", requireAdmin, deactivateUser);

export default router;
