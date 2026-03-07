import { Router } from "express";
import multer from "multer";
import {
  paySalary,
  getStaffSalaryHistory,
  getStaffSalarySummary,
  getAllSalaryPayments,
  getMySalary,
  getSalaryPaymentById,
  updateSalaryPayment,
  deleteSalaryPayment,
  getSalarySummary,
} from "../controllers/salary.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

router.use(authenticate);

router.post("/pay", upload.single("attachment"), paySalary);
router.get("/staff/:staffId", getStaffSalaryHistory);
router.get("/staff/:staffId/summary", getStaffSalarySummary);
router.get("/all", getAllSalaryPayments);
router.get("/my-salary", getMySalary);
router.get("/summary", getSalarySummary);
router.get("/:id", getSalaryPaymentById);
router.patch("/:id", updateSalaryPayment);
router.delete("/:id", deleteSalaryPayment);

export default router;
