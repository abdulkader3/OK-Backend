import { Router } from "express";
import { processBatchSync, getSyncStatus } from "../controllers/sync.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/batch", processBatchSync);
router.get("/status", getSyncStatus);

export default router;
