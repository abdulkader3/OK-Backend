import { Router } from "express";
import { createContact, getContacts, getContactById, updateContact, deleteContact } from "../controllers/contact.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/", createContact);
router.get("/", getContacts);
router.get("/:id", getContactById);
router.patch("/:id", updateContact);
router.delete("/:id", deleteContact);

export default router;
