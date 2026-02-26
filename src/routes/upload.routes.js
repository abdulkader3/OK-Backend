import { Router } from "express";
import multer from "multer";
import { uploadReceipt } from "../controllers/upload.controller.js";
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

router.post("/receipt", upload.single("file"), uploadReceipt);

export default router;
