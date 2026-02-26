import { Ledger, Payment, AuditLog } from "../models/index.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

const createLedger = asyncHandler(async (req, res, _next) => {
  const { type, counterpartyName, counterpartyContact, initialAmount, currency, dueDate, priority, notes, tags } = req.body;

  const ledger = await Ledger.create({
    ownerId: req.user._id,
    type,
    counterpartyName,
    counterpartyContact,
    initialAmount,
    currency: currency || "USD",
    dueDate,
    priority: priority || "medium",
    notes,
    tags: tags || [],
    createdBy: req.user._id,
    outstandingBalance: initialAmount,
  });

  await AuditLog.create({
    operation: "create",
    collection: "ledgers",
    docId: ledger._id,
    userId: req.user._id,
    userEmail: req.user.email,
    after: ledger.toObject(),
  });

  res.status(201).json({
    success: true,
    data: { ledger },
    message: "Ledger created successfully",
  });
});

const getLedgers = asyncHandler(async (req, res, _next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = {};

  if (req.user.role === "owner" || req.user.role === "admin") {
    if (req.query.ownerId) {
      filter.ownerId = req.query.ownerId;
    } else {
      filter.$or = [
        { ownerId: req.user._id },
        { createdBy: req.user._id },
      ];
    }
  } else if (!req.user.permissions?.canViewAllLedgers) {
    filter.$or = [
      { ownerId: req.user._id },
      { createdBy: req.user._id },
    ];
  }

  if (req.query.type) {
    filter.type = req.query.type;
  }

  if (req.query.priority) {
    filter.priority = req.query.priority;
  }

  if (req.query.dueDateFrom || req.query.dueDateTo) {
    filter.dueDate = {};
    if (req.query.dueDateFrom) {
      filter.dueDate.$gte = new Date(req.query.dueDateFrom);
    }
    if (req.query.dueDateTo) {
      filter.dueDate.$lte = new Date(req.query.dueDateTo);
    }
  }

  if (req.query.search) {
    filter.$or = [
      { counterpartyName: { $regex: req.query.search, $options: "i" } },
      { notes: { $regex: req.query.search, $options: "i" } },
      { tags: { $in: [new RegExp(req.query.search, "i")] } },
    ];
  }

  const ledgers = await Ledger.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("createdBy", "name email");

  const total = await Ledger.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: {
      ledgers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

const getLedgerById = asyncHandler(async (req, res, _next) => {
  const ledger = await Ledger.findById(req.params.id).populate("createdBy", "name email ownerId");

  if (!ledger) {
    throw new ApiErrors(404, "Ledger not found");
  }

  if (
    ledger.ownerId.toString() !== req.user._id.toString() &&
    ledger.createdBy._id.toString() !== req.user._id.toString() &&
    !req.user.permissions?.canViewAllLedgers &&
    req.user.role !== "owner" &&
    req.user.role !== "admin"
  ) {
    throw new ApiErrors(403, "Access denied");
  }

  const recentPayments = await Payment.find({ ledgerId: ledger._id })
    .sort({ recordedAt: -1 })
    .limit(10)
    .populate("recordedBy", "name email");

  res.status(200).json({
    success: true,
    data: {
      ledger,
      recentPayments,
    },
  });
});

const updateLedger = asyncHandler(async (req, res, _next) => {
  const { counterpartyName, counterpartyContact, dueDate, priority, notes, tags } = req.body;

  const ledger = await Ledger.findById(req.params.id);

  if (!ledger) {
    throw new ApiErrors(404, "Ledger not found");
  }

  const canEdit =
    ledger.ownerId.toString() === req.user._id.toString() ||
    ledger.createdBy.toString() === req.user._id.toString() ||
    req.user.role === "owner" ||
    req.user.role === "admin" ||
    req.user.permissions?.canEditLedger;

  if (!canEdit) {
    throw new ApiErrors(403, "You don't have permission to edit this ledger");
  }

  const before = ledger.toObject();

  if (counterpartyName) ledger.counterpartyName = counterpartyName;
  if (counterpartyContact !== undefined) ledger.counterpartyContact = counterpartyContact;
  if (dueDate !== undefined) ledger.dueDate = dueDate;
  if (priority) ledger.priority = priority;
  if (notes !== undefined) ledger.notes = notes;
  if (tags) ledger.tags = tags;

  await ledger.save();

  const changes = [];
  if (counterpartyName && before.counterpartyName !== counterpartyName) {
    changes.push({ field: "counterpartyName", oldValue: before.counterpartyName, newValue: counterpartyName });
  }
  if (dueDate !== undefined && String(before.dueDate) !== String(dueDate)) {
    changes.push({ field: "dueDate", oldValue: before.dueDate, newValue: dueDate });
  }
  if (priority && before.priority !== priority) {
    changes.push({ field: "priority", oldValue: before.priority, newValue: priority });
  }

  await AuditLog.create({
    operation: "update",
    collection: "ledgers",
    docId: ledger._id,
    userId: req.user._id,
    userEmail: req.user.email,
    before,
    after: ledger.toObject(),
    changes,
  });

  res.status(200).json({
    success: true,
    data: { ledger },
    message: "Ledger updated successfully",
  });
});

const deleteLedger = asyncHandler(async (req, res, _next) => {
  const ledger = await Ledger.findById(req.params.id);

  if (!ledger) {
    throw new ApiErrors(404, "Ledger not found");
  }

  const canDelete =
    ledger.ownerId.toString() === req.user._id.toString() ||
    req.user.role === "owner" ||
    req.user.role === "admin" ||
    req.user.permissions?.canDeleteLedger;

  if (!canDelete) {
    throw new ApiErrors(403, "You don't have permission to delete this ledger");
  }

  const payments = await Payment.countDocuments({ ledgerId: ledger._id });

  if (payments > 0) {
    throw new ApiErrors(400, "Cannot delete ledger with existing payments. Archive it instead.");
  }

  await Ledger.findByIdAndDelete(req.params.id);

  await AuditLog.create({
    operation: "delete",
    collection: "ledgers",
    docId: ledger._id,
    userId: req.user._id,
    userEmail: req.user.email,
    before: ledger.toObject(),
  });

  res.status(200).json({
    success: true,
    message: "Ledger deleted successfully",
  });
});

export { createLedger, getLedgers, getLedgerById, updateLedger, deleteLedger };
