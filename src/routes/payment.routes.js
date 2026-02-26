import { Router } from "express";
import { createPayment, getPayments, getPaymentById } from "../controllers/payment.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/", getPayments);
router.get("/:id", getPaymentById);

export default router;

export function attachPaymentRoutes(app) {
  app.post("/ledgers/:id/payments", authenticate, authorize("canRecordPayment"), createPayment);
}
