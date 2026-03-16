import { Product, AuditLog } from "../models/index.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

const createProduct = asyncHandler(async (req, res, _next) => {
  const { name, price, imageUrl, clientTempId } = req.body;

  if (!name || price === undefined) {
    throw new ApiErrors(400, "Name and price are required");
  }

  const product = await Product.create({
    ownerId: req.user.ownerId || req.user._id,
    name,
    price,
    imageUrl: imageUrl || null,
    clientTempId: clientTempId || null,
    syncStatus: "synced",
  });

  await AuditLog.create({
    operation: "create",
    collection: "products",
    docId: product._id,
    userId: req.user._id,
    userEmail: req.user.email,
    after: product.toObject(),
  });

  res.status(201).json({
    success: true,
    data: { product },
    message: "Product created successfully",
  });
});

const getProducts = asyncHandler(async (req, res, _next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;
  const since = req.query.since;

  const filter = {
    ownerId: req.user.ownerId || req.user._id,
    deleted: false,
  };

  if (req.query.syncStatus) {
    filter.syncStatus = req.query.syncStatus;
  }

  if (since) {
    const sinceDate = new Date(since);
    if (!isNaN(sinceDate.getTime())) {
      filter.updatedAt = { $gte: sinceDate };
    }
  }

  const products = await Product.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Product.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: {
      products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

const getProductById = asyncHandler(async (req, res, _next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new ApiErrors(404, "Product not found");
  }

  if (
    product.ownerId.toString() !== (req.user.ownerId || req.user._id).toString()
  ) {
    throw new ApiErrors(403, "Access denied");
  }

  res.status(200).json({
    success: true,
    data: { product },
  });
});

const updateProduct = asyncHandler(async (req, res, _next) => {
  const { name, price, imageUrl } = req.body;

  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new ApiErrors(404, "Product not found");
  }

  if (
    product.ownerId.toString() !== (req.user.ownerId || req.user._id).toString()
  ) {
    throw new ApiErrors(403, "Access denied");
  }

  const before = product.toObject();

  if (name !== undefined) product.name = name;
  if (price !== undefined) product.price = price;
  if (imageUrl !== undefined) product.imageUrl = imageUrl;
  product.syncStatus = "synced";

  await product.save();

  await AuditLog.create({
    operation: "update",
    collection: "products",
    docId: product._id,
    userId: req.user._id,
    userEmail: req.user.email,
    before,
    after: product.toObject(),
  });

  res.status(200).json({
    success: true,
    data: { product },
    message: "Product updated successfully",
  });
});

const deleteProduct = asyncHandler(async (req, res, _next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new ApiErrors(404, "Product not found");
  }

  if (
    product.ownerId.toString() !== (req.user.ownerId || req.user._id).toString()
  ) {
    throw new ApiErrors(403, "Access denied");
  }

  const before = product.toObject();
  product.deleted = true;
  product.syncStatus = "synced";
  await product.save();

  await AuditLog.create({
    operation: "delete",
    collection: "products",
    docId: product._id,
    userId: req.user._id,
    userEmail: req.user.email,
    before,
    after: null,
  });

  res.status(200).json({
    success: true,
    message: "Product deleted successfully",
  });
});

export {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
