import { v2 as cloudinary } from "cloudinary";
import { AuditLog } from "../models/index.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_API_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadReceipt = asyncHandler(async (req, res, _next) => {
  if (!req.file) {
    throw new ApiErrors(400, "No file uploaded");
  }

  const canUpload =
    req.user.role === "owner" ||
    req.user.role === "admin" ||
    req.user.permissions?.canRecordPayment ||
    req.user.permissions?.canCreateLedger;

  if (!canUpload) {
    throw new ApiErrors(403, `User role '${req.user.role}' does not have upload permission. Add canRecordPayment or canCreateLedger permission.`);
  }

  const b64 = Buffer.from(req.file.buffer).toString("base64");
  const dataURI = `data:${req.file.mimetype};base64,${b64}`;

  const result = await cloudinary.uploader.upload(dataURI, {
    folder: "ok_backend/receipts",
    resource_type: "image",
    transformation: [
      { width: 1200, height: 1200, crop: "limit" },
      { quality: "auto", fetch_format: "auto" },
    ],
  });

  await AuditLog.create({
    operation: "create",
    collection: "uploads",
    docId: result.public_id,
    userId: req.user._id,
    userEmail: req.user.email,
    after: {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    },
    metadata: {
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
    },
  });

  res.status(201).json({
    success: true,
    data: {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    },
    message: "File uploaded successfully",
  });
});

export { uploadReceipt };
