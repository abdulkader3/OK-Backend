import { v2 as cloudinary } from "cloudinary";
import { BigBoss, BigBossBill, AuditLog } from "../models/index.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_API_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const createBigBoss = asyncHandler(async (req, res, _next) => {
  const { name, description } = req.body;

  if (!name || name.trim().length < 2) {
    throw new ApiErrors(400, "Big Boss name is required (min 2 characters)");
  }

  const bigBoss = await BigBoss.create({
    ownerId: req.user._id,
    name: name.trim(),
    description: description?.trim(),
    createdBy: req.user._id,
  });

  await AuditLog.create({
    operation: "create",
    collection: "bigbosses",
    docId: bigBoss._id,
    userId: req.user._id,
    userEmail: req.user.email,
    after: bigBoss.toObject(),
  });

  res.status(201).json({
    success: true,
    data: { bigBoss },
    message: "Big Boss created successfully",
  });
});

const getBigBosses = asyncHandler(async (req, res, _next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = { ownerId: req.user._id };

  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { description: { $regex: req.query.search, $options: "i" } },
    ];
  }

  const [bigBosses, total] = await Promise.all([
    BigBoss.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email"),
    BigBoss.countDocuments(filter),
  ]);

  const bigBossIds = bigBosses.map((bb) => bb._id);

  const totalPaidPipeline = [
    {
      $match: {
        bigBossId: { $in: bigBossIds },
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: "$bigBossId",
        totalPaid: { $sum: "$amount" },
        billCount: { $sum: 1 },
      },
    },
  ];

  const totals = await BigBossBill.aggregate(totalPaidPipeline);

  const totalsMap = new Map(
    totals.map((t) => [
      t._id.toString(),
      { totalPaid: t.totalPaid, billCount: t.billCount },
    ])
  );

  const bigBossesWithTotals = bigBosses.map((bb) => {
    const data = totalsMap.get(bb._id.toString()) || {
      totalPaid: 0,
      billCount: 0,
    };
    return {
      ...bb.toObject(),
      totalPaid: data.totalPaid,
      billCount: data.billCount,
    };
  });

  res.status(200).json({
    success: true,
    data: {
      bigBosses: bigBossesWithTotals,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

const getBigBossById = asyncHandler(async (req, res, _next) => {
  const bigBoss = await BigBoss.findById(req.params.id).populate(
    "createdBy",
    "name email"
  );

  if (!bigBoss) {
    throw new ApiErrors(404, "Big Boss not found");
  }

  if (bigBoss.ownerId.toString() !== req.user._id.toString()) {
    throw new ApiErrors(403, "Access denied");
  }

  const bills = await BigBossBill.find({ bigBossId: bigBoss._id })
    .sort({ year: -1, month: -1 })
    .populate("createdBy", "name email");

  const totalPaid = bills.reduce((sum, bill) => sum + bill.amount, 0);

  res.status(200).json({
    success: true,
    data: {
      bigBoss,
      bills,
      totalPaid,
    },
  });
});

const updateBigBoss = asyncHandler(async (req, res, _next) => {
  const { name, description } = req.body;

  const bigBoss = await BigBoss.findById(req.params.id);

  if (!bigBoss) {
    throw new ApiErrors(404, "Big Boss not found");
  }

  if (bigBoss.ownerId.toString() !== req.user._id.toString()) {
    throw new ApiErrors(403, "Access denied");
  }

  const before = bigBoss.toObject();

  if (name) bigBoss.name = name.trim();
  if (description !== undefined) bigBoss.description = description?.trim();

  await bigBoss.save();

  const changes = [];
  if (name && before.name !== name) {
    changes.push({ field: "name", oldValue: before.name, newValue: name });
  }
  if (description !== undefined && before.description !== description) {
    changes.push({
      field: "description",
      oldValue: before.description,
      newValue: description,
    });
  }

  await AuditLog.create({
    operation: "update",
    collection: "bigbosses",
    docId: bigBoss._id,
    userId: req.user._id,
    userEmail: req.user.email,
    before,
    after: bigBoss.toObject(),
    changes,
  });

  res.status(200).json({
    success: true,
    data: { bigBoss },
    message: "Big Boss updated successfully",
  });
});

const deleteBigBoss = asyncHandler(async (req, res, _next) => {
  const bigBoss = await BigBoss.findById(req.params.id);

  if (!bigBoss) {
    throw new ApiErrors(404, "Big Boss not found");
  }

  if (bigBoss.ownerId.toString() !== req.user._id.toString()) {
    throw new ApiErrors(403, "Access denied");
  }

  bigBoss.deletedAt = new Date();
  await bigBoss.save();

  await BigBossBill.updateMany(
    { bigBossId: bigBoss._id },
    { deletedAt: new Date() }
  );

  await AuditLog.create({
    operation: "delete",
    collection: "bigbosses",
    docId: bigBoss._id,
    userId: req.user._id,
    userEmail: req.user.email,
    before: bigBoss.toObject(),
  });

  res.status(200).json({
    success: true,
    message: "Big Boss moved to bin successfully",
  });
});

const createBill = asyncHandler(async (req, res, _next) => {
  const { month, year, amount, description } = req.body;

  if (!month || !year || !amount) {
    throw new ApiErrors(400, "Month, year, and amount are required");
  }

  const bigBoss = await BigBoss.findById(req.params.id);

  if (!bigBoss) {
    throw new ApiErrors(404, "Big Boss not found");
  }

  if (bigBoss.ownerId.toString() !== req.user._id.toString()) {
    throw new ApiErrors(403, "Access denied");
  }

  const existingBill = await BigBossBill.findOne({
    bigBossId: bigBoss._id,
    month: parseInt(month),
    year: parseInt(year),
  });

  if (existingBill) {
    throw new ApiErrors(
      400,
      `Bill for ${year}-${String(month).padStart(2, "0")} already exists`
    );
  }

  let attachment = null;

  if (req.file) {
    const b64 = Buffer.from(req.file.buffer).toString("base64");
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: "ok_backend/bigboss_bills",
      resource_type: "image",
      transformation: [
        { width: 1200, height: 1200, crop: "limit" },
        { quality: "auto", fetch_format: "auto" },
      ],
    });

    attachment = {
      url: result.secure_url,
      publicId: result.public_id,
      uploadedAt: new Date(),
    };
  }

  const bill = await BigBossBill.create({
    bigBossId: bigBoss._id,
    ownerId: req.user._id,
    month: parseInt(month),
    year: parseInt(year),
    amount: parseFloat(amount),
    description: description?.trim(),
    attachment,
    createdBy: req.user._id,
  });

  await AuditLog.create({
    operation: "create",
    collection: "bigbossbills",
    docId: bill._id,
    userId: req.user._id,
    userEmail: req.user.email,
    after: bill.toObject(),
  });

  res.status(201).json({
    success: true,
    data: { bill },
    message: "Bill created successfully",
  });
});

const getBills = asyncHandler(async (req, res, _next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const filter = { ownerId: req.user._id };

  if (req.query.bigBossId) {
    filter.bigBossId = req.query.bigBossId;
  }

  if (req.query.year) {
    filter.year = parseInt(req.query.year);
  }

  const [bills, total] = await Promise.all([
    BigBossBill.find(filter)
      .sort({ year: -1, month: -1 })
      .skip(skip)
      .limit(limit)
      .populate("bigBossId", "name")
      .populate("createdBy", "name email"),
    BigBossBill.countDocuments(filter),
  ]);

  const totalAmount = bills.reduce((sum, bill) => sum + bill.amount, 0);

  res.status(200).json({
    success: true,
    data: {
      bills,
      totalAmount,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

const getBillById = asyncHandler(async (req, res, _next) => {
  const bill = await BigBossBill.findById(req.params.billId)
    .populate("bigBossId", "name description")
    .populate("createdBy", "name email");

  if (!bill) {
    throw new ApiErrors(404, "Bill not found");
  }

  if (bill.ownerId.toString() !== req.user._id.toString()) {
    throw new ApiErrors(403, "Access denied");
  }

  res.status(200).json({
    success: true,
    data: { bill },
  });
});

const updateBill = asyncHandler(async (req, res, _next) => {
  const { month, year, amount, description } = req.body;

  const bill = await BigBossBill.findById(req.params.billId);

  if (!bill) {
    throw new ApiErrors(404, "Bill not found");
  }

  if (bill.ownerId.toString() !== req.user._id.toString()) {
    throw new ApiErrors(403, "Access denied");
  }

  const before = bill.toObject();

  if (month) bill.month = parseInt(month);
  if (year) bill.year = parseInt(year);
  if (amount) bill.amount = parseFloat(amount);
  if (description !== undefined) bill.description = description?.trim();

  await bill.save();

  const changes = [];
  if (month && before.month !== parseInt(month)) {
    changes.push({ field: "month", oldValue: before.month, newValue: month });
  }
  if (year && before.year !== parseInt(year)) {
    changes.push({ field: "year", oldValue: before.year, newValue: year });
  }
  if (amount && before.amount !== parseFloat(amount)) {
    changes.push({
      field: "amount",
      oldValue: before.amount,
      newValue: amount,
    });
  }

  await AuditLog.create({
    operation: "update",
    collection: "bigbossbills",
    docId: bill._id,
    userId: req.user._id,
    userEmail: req.user.email,
    before,
    after: bill.toObject(),
    changes,
  });

  res.status(200).json({
    success: true,
    data: { bill },
    message: "Bill updated successfully",
  });
});

const deleteBill = asyncHandler(async (req, res, _next) => {
  const bill = await BigBossBill.findById(req.params.billId);

  if (!bill) {
    throw new ApiErrors(404, "Bill not found");
  }

  if (bill.ownerId.toString() !== req.user._id.toString()) {
    throw new ApiErrors(403, "Access denied");
  }

  bill.deletedAt = new Date();
  await bill.save();

  await AuditLog.create({
    operation: "delete",
    collection: "bigbossbills",
    docId: bill._id,
    userId: req.user._id,
    userEmail: req.user.email,
    before: bill.toObject(),
  });

  res.status(200).json({
    success: true,
    message: "Bill moved to bin successfully",
  });
});

const getBigBossSummary = asyncHandler(async (req, res, _next) => {
  const filter = { ownerId: req.user._id, deletedAt: null };

  const totalBigBosses = await BigBoss.countDocuments(filter);

  const totalPaidPipeline = [
    { $match: filter },
    {
      $group: {
        _id: null,
        totalPaid: { $sum: "$amount" },
        billCount: { $sum: 1 },
      },
    },
  ];

  const summary = await BigBossBill.aggregate(totalPaidPipeline);

  const byYearPipeline = [
    { $match: filter },
    {
      $group: {
        _id: "$year",
        totalPaid: { $sum: "$amount" },
        billCount: { $sum: 1 },
      },
    },
    { $sort: { _id: -1 } },
  ];

  const byYear = await BigBossBill.aggregate(byYearPipeline);

  res.status(200).json({
    success: true,
    data: {
      totalBigBosses,
      totalPaid: summary[0]?.totalPaid || 0,
      totalBills: summary[0]?.billCount || 0,
      byYear: byYear.map((y) => ({
        year: y._id,
        totalPaid: y.totalPaid,
        billCount: y.billCount,
      })),
    },
  });
});

export {
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
};
