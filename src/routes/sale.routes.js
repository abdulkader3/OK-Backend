import { Router } from "express";
import {
  createSale,
  getSales,
  getSaleById,
  deleteSale,
  getSalesByDate,
  getSalesSummary,
} from "../controllers/sale.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/", createSale);
router.get("/", getSales);
router.get("/by-date", getSalesByDate);
router.get("/summary", getSalesSummary);
router.get("/:id", getSaleById);
router.delete("/:id", deleteSale);

export default router;
