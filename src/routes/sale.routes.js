import { Router } from "express";
import {
  createSale,
  getSales,
  getSaleById,
  deleteSale,
} from "../controllers/sale.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/", createSale);
router.get("/", getSales);
router.get("/:id", getSaleById);
router.delete("/:id", deleteSale);

export default router;
