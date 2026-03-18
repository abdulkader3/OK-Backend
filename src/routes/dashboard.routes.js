import { Router } from "express";
import {
  getDashboardSummary,
  getMonthlySummary,
  getMonthlyHistory,
} from "../controllers/dashboard.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/summary", getDashboardSummary);
router.get("/monthly-summary", getMonthlySummary);
router.get("/monthly-history", getMonthlyHistory);

export default router;
