import { Router } from "express";
import { getDashboardSummary } from "../controllers/dashboard.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/summary", getDashboardSummary);

export default router;
