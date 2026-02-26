import { Router } from "express";
import { getAuditLogs } from "../controllers/audit.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/permission.middleware.js";

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get("/:entityId", getAuditLogs);

export default router;
