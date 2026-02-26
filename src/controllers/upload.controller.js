import { v2 as cloudinary } from "cloudinary";
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
    throw new ApiErrors(403, "You don't have permission to upload files");
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

  res.status(201).json({
    success: true,
    data: {
      url: result.secure_url,
      publicId: result.public_id,
    },
    message: "File uploaded successfully",
  });
});

export { uploadReceipt };
