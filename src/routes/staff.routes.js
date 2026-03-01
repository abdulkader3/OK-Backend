import { Router } from "express";
import { getCompanyStaff } from "../controllers/staff.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/permission.middleware.js";

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get("/", getCompanyStaff);

export default router;
