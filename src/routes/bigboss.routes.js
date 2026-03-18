import { Router } from "express";
import multer from "multer";
import {
  createBigBoss,
  getBigBosses,
  getBigBossById,
  updateBigBoss,
  deleteBigBoss,
  createBill,
  getBills,
  getBillById,
  updateBill,
  deleteBill,
  getBigBossSummary,
  payBill,
  unpayBill,
} from "../controllers/bigboss.controller.js";
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

router.post("/", createBigBoss);
router.get("/", getBigBosses);
router.get("/summary", getBigBossSummary);
router.get("/:id", getBigBossById);
router.patch("/:id", updateBigBoss);
router.delete("/:id", deleteBigBoss);

router.post("/:id/bills", upload.single("attachment"), createBill);
router.get("/bills/all", getBills);
router.get("/bills/:billId", getBillById);
router.patch("/bills/:billId", updateBill);
router.delete("/bills/:billId", deleteBill);
router.post("/bills/:billId/pay", payBill);
router.post("/bills/:billId/unpay", unpayBill);

export default router;
