import { v2 as cloudinary } from "cloudinary";
import { SalaryPayment, User, AuditLog } from "../models/index.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_API_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const paySalary = asyncHandler(async (req, res, _next) => {
  const { staffId, month, year, amount, paymentMethod, note } = req.body;

  if (!staffId || !month || !year || !amount) {
    throw new ApiErrors(400, "Staff ID, month, year, and amount are required");
  }

  const staff = await User.findById(staffId);
  if (!staff) {
    throw new ApiErrors(404, "Staff member not found");
  }

  if (staff.role === "owner") {
    throw new ApiErrors(400, "Cannot pay salary to owner");
  }

  if (staff.company !== req.user.company) {
    throw new ApiErrors(403, "Staff member is not in your company");
  }

  const existingPayment = await SalaryPayment.findOne({
    staffId,
    month: parseInt(month),
    year: parseInt(year),
  });

  if (existingPayment) {
    throw new ApiErrors(
      400,
      `Salary already paid for ${year}-${String(month).padStart(2, "0")}`
    );
  }

  let attachment = null;
  if (req.file) {
    const b64 = Buffer.from(req.file.buffer).toString("base64");
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: "ok_backend/salary_payments",
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

  const salaryPayment = await SalaryPayment.create({
    staffId,
    ownerId: req.user._id,
    month: parseInt(month),
    year: parseInt(year),
    amount: parseFloat(amount),
    paymentMethod: paymentMethod || "bank",
    note: note?.trim(),
    attachment,
    createdBy: req.user._id,
    paidAt: new Date(),
  });

  await AuditLog.create({
    operation: "create",
    collection: "salarypayments",
    docId: salaryPayment._id,
    userId: req.user._id,
    userEmail: req.user.email,
    after: salaryPayment.toObject(),
    metadata: { staffName: staff.name, staffEmail: staff.email },
  });

  res.status(201).json({
    success: true,
    data: { salaryPayment },
    message: "Salary paid successfully",
  });
});

const getStaffSalaryHistory = asyncHandler(async (req, res, _next) => {
  const { staffId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const staff = await User.findById(staffId);
  if (!staff) {
    throw new ApiErrors(404, "Staff member not found");
  }

  const hasAccess =
    req.user.role === "owner" ||
    (req.user.role === "admin" && staff.company === req.user.company) ||
    req.user._id.toString() === staffId;

  if (!hasAccess) {
    throw new ApiErrors(403, "Access denied");
  }

  const filter = { staffId };
  if (req.query.year) {
    filter.year = parseInt(req.query.year);
  }

  const [payments, total] = await Promise.all([
    SalaryPayment.find(filter)
      .sort({ year: -1, month: -1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email"),
    SalaryPayment.countDocuments(filter),
  ]);

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  res.status(200).json({
    success: true,
    data: {
      staff: {
        _id: staff._id,
        name: staff.name,
        email: staff.email,
        monthlySalary: staff.monthlySalary,
      },
      payments,
      totalPaid,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

const getStaffSalarySummary = asyncHandler(async (req, res, _next) => {
  const { staffId } = req.params;

  const staff = await User.findById(staffId);
  if (!staff) {
    throw new ApiErrors(404, "Staff member not found");
  }

  const hasAccess =
    req.user.role === "owner" ||
    (req.user.role === "admin" && staff.company === req.user.company) ||
    req.user._id.toString() === staffId;

  if (!hasAccess) {
    throw new ApiErrors(403, "Access denied");
  }

  const pipeline = [
    { $match: { staffId: staff._id } },
    {
      $group: {
        _id: null,
        totalPaid: { $sum: "$amount" },
        paymentCount: { $sum: 1 },
        lastPaymentDate: { $max: "$paidAt" },
      },
    },
  ];

  const [summary] = await SalaryPayment.aggregate(pipeline);

  const byYearPipeline = [
    { $match: { staffId: staff._id } },
    {
      $group: {
        _id: "$year",
        totalPaid: { $sum: "$amount" },
        paymentCount: { $sum: 1 },
      },
    },
    { $sort: { _id: -1 } },
  ];

  const byYear = await SalaryPayment.aggregate(byYearPipeline);

  const monthlySalary = staff.monthlySalary || 0;
  const totalPaid = summary?.totalPaid || 0;

  res.status(200).json({
    success: true,
    data: {
      staff: {
        _id: staff._id,
        name: staff.name,
        email: staff.email,
        monthlySalary,
      },
      totalPaid,
      paymentCount: summary?.paymentCount || 0,
      lastPaymentDate: summary?.lastPaymentDate || null,
      byYear: byYear.map((y) => ({
        year: y._id,
        totalPaid: y.totalPaid,
        paymentCount: y.paymentCount,
      })),
    },
  });
});

const getAllSalaryPayments = asyncHandler(async (req, res, _next) => {
  if (req.user.role !== "owner") {
    throw new ApiErrors(403, "Only owners can view all salary payments");
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const filter = { ownerId: req.user._id };

  if (req.query.staffId) {
    filter.staffId = req.query.staffId;
  }

  if (req.query.year) {
    filter.year = parseInt(req.query.year);
  }

  if (req.query.paymentMethod) {
    filter.paymentMethod = req.query.paymentMethod;
  }

  const [payments, total] = await Promise.all([
    SalaryPayment.find(filter)
      .sort({ paidAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("staffId", "name email monthlySalary")
      .populate("createdBy", "name email"),
    SalaryPayment.countDocuments(filter),
  ]);

  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

  res.status(200).json({
    success: true,
    data: {
      payments,
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

const getMySalary = asyncHandler(async (req, res, _next) => {
  if (req.user.role === "owner") {
    throw new ApiErrors(400, "Owners don't have salary records");
  }

  const staff = await User.findById(req.user._id);
  if (!staff) {
    throw new ApiErrors(404, "User not found");
  }

  const filter = { staffId: req.user._id };

  if (req.query.year) {
    filter.year = parseInt(req.query.year);
  }

  const payments = await SalaryPayment.find(filter)
    .sort({ year: -1, month: -1 })
    .populate("createdBy", "name email");

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  const lastPayment = payments[0] || null;

  res.status(200).json({
    success: true,
    data: {
      staff: {
        _id: staff._id,
        name: staff.name,
        email: staff.email,
        monthlySalary: staff.monthlySalary,
      },
      payments,
      totalPaid,
      lastPaymentDate: lastPayment?.paidAt || null,
    },
  });
});

const getSalaryPaymentById = asyncHandler(async (req, res, _next) => {
  const payment = await SalaryPayment.findById(req.params.id)
    .populate("staffId", "name email monthlySalary")
    .populate("createdBy", "name email")
    .populate("ownerId", "name email");

  if (!payment) {
    throw new ApiErrors(404, "Salary payment not found");
  }

  const hasAccess =
    req.user.role === "owner" ||
    payment.ownerId._id.toString() === req.user._id.toString() ||
    payment.staffId._id.toString() === req.user._id.toString();

  if (!hasAccess) {
    throw new ApiErrors(403, "Access denied");
  }

  res.status(200).json({
    success: true,
    data: { payment },
  });
});

const updateSalaryPayment = asyncHandler(async (req, res, _next) => {
  const { amount, paymentMethod, note } = req.body;

  const payment = await SalaryPayment.findById(req.params.id);

  if (!payment) {
    throw new ApiErrors(404, "Salary payment not found");
  }

  if (payment.ownerId.toString() !== req.user._id.toString()) {
    throw new ApiErrors(403, "Access denied");
  }

  const before = payment.toObject();

  if (amount) payment.amount = parseFloat(amount);
  if (paymentMethod) payment.paymentMethod = paymentMethod;
  if (note !== undefined) payment.note = note?.trim();

  await payment.save();

  const changes = [];
  if (amount && before.amount !== parseFloat(amount)) {
    changes.push({
      field: "amount",
      oldValue: before.amount,
      newValue: amount,
    });
  }
  if (paymentMethod && before.paymentMethod !== paymentMethod) {
    changes.push({
      field: "paymentMethod",
      oldValue: before.paymentMethod,
      newValue: paymentMethod,
    });
  }

  await AuditLog.create({
    operation: "update",
    collection: "salarypayments",
    docId: payment._id,
    userId: req.user._id,
    userEmail: req.user.email,
    before,
    after: payment.toObject(),
    changes,
  });

  res.status(200).json({
    success: true,
    data: { payment },
    message: "Salary payment updated successfully",
  });
});

const deleteSalaryPayment = asyncHandler(async (req, res, _next) => {
  const payment = await SalaryPayment.findById(req.params.id);

  if (!payment) {
    throw new ApiErrors(404, "Salary payment not found");
  }

  if (payment.ownerId.toString() !== req.user._id.toString()) {
    throw new ApiErrors(403, "Access denied");
  }

  const staff = await User.findById(payment.staffId);

  await SalaryPayment.findByIdAndDelete(req.params.id);

  await AuditLog.create({
    operation: "delete",
    collection: "salarypayments",
    docId: payment._id,
    userId: req.user._id,
    userEmail: req.user.email,
    before: payment.toObject(),
    metadata: { staffName: staff?.name, staffEmail: staff?.email },
  });

  res.status(200).json({
    success: true,
    message: "Salary payment deleted successfully",
  });
});

const getSalarySummary = asyncHandler(async (req, res, _next) => {
  if (req.user.role !== "owner") {
    throw new ApiErrors(403, "Only owners can view salary summary");
  }

  const filter = { ownerId: req.user._id };

  const totalPipeline = [
    { $match: filter },
    {
      $group: {
        _id: null,
        totalPaid: { $sum: "$amount" },
        paymentCount: { $sum: 1 },
      },
    },
  ];

  const [totalSummary] = await SalaryPayment.aggregate(totalPipeline);

  const byYearPipeline = [
    { $match: filter },
    {
      $group: {
        _id: "$year",
        totalPaid: { $sum: "$amount" },
        paymentCount: { $sum: 1 },
      },
    },
    { $sort: { _id: -1 } },
  ];

  const byYear = await SalaryPayment.aggregate(byYearPipeline);

  const byMonthPipeline = [
    { $match: filter },
    {
      $group: {
        _id: { year: "$year", month: "$month" },
        totalPaid: { $sum: "$amount" },
        paymentCount: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": -1, "_id.month": -1 } },
    { $limit: 12 },
  ];

  const byMonth = await SalaryPayment.aggregate(byMonthPipeline);

  const staffCount = await User.countDocuments({
    company: req.user.company,
    role: { $in: ["admin", "staff"] },
  });

  res.status(200).json({
    success: true,
    data: {
      totalPaid: totalSummary?.totalPaid || 0,
      totalPayments: totalSummary?.paymentCount || 0,
      staffCount,
      byYear: byYear.map((y) => ({
        year: y._id,
        totalPaid: y.totalPaid,
        paymentCount: y.paymentCount,
      })),
      byMonth: byMonth.map((m) => ({
        year: m._id.year,
        month: m._id.month,
        totalPaid: m.totalPaid,
        paymentCount: m.paymentCount,
      })),
    },
  });
});

export {
  paySalary,
  getStaffSalaryHistory,
  getStaffSalarySummary,
  getAllSalaryPayments,
  getMySalary,
  getSalaryPaymentById,
  updateSalaryPayment,
  deleteSalaryPayment,
  getSalarySummary,
};
