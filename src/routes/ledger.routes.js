import { Router } from "express";
import {
  createLedger,
  getLedgers,
  getLedgerById,
  updateLedger,
  deleteLedger,
  addDebt,
} from "../controllers/ledger.controller.js";
import { createPayment } from "../controllers/payment.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/", getLedgers);
router.post("/", authorize("canCreateLedger"), createLedger);
router.get("/:id", getLedgerById);
router.patch("/:id", authorize("canEditLedger"), updateLedger);
router.delete("/:id", authorize("canDeleteLedger"), deleteLedger);
router.post("/:id/payments", authorize("canRecordPayment"), createPayment);
router.post("/:id/add-debt", authorize("canCreateLedger"), addDebt);

export default router;
