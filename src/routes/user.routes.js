import { Router } from "express";
import multer from "multer";
import {
  getAllUsers,
  getUserById,
  updateUserPermissions,
  deactivateUser,
  updateProfile,
} from "../controllers/user.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/permission.middleware.js";

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

router.get("/", requireAdmin, getAllUsers);
router.get("/:id", getUserById);
router.patch("/me", upload.single("profileImage"), updateProfile);
router.patch("/:id/permissions", requireAdmin, updateUserPermissions);
router.delete("/:id", requireAdmin, deactivateUser);

export default router;
