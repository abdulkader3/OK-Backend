import mongoose from "mongoose";
import { Ledger, Payment, AuditLog } from "../models/index.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

const createLedger = asyncHandler(async (req, res, _next) => {
  const {
    type,
    counterpartyName,
    counterpartyContact,
    initialAmount,
    currency,
    dueDate,
    priority,
    notes,
    tags,
  } = req.body;

  const ledger = await Ledger.create({
    ownerId: req.user.ownerId || req.user._id,
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

  if (initialAmount > 0) {
    await Payment.create({
      ownerId: ledger.ownerId,
      ledgerId: ledger._id,
      amount: initialAmount,
      type: "adjustment",
      method: "other",
      note: "Initial amount",
      recordedBy: req.user._id,
      recordedAt: ledger.createdAt,
      previousOutstanding: 0,
      newOutstanding: initialAmount,
      idempotencyKey: `initial-${ledger._id}`,
      offline: false,
      syncStatus: "synced",
    });
  }

  await AuditLog.create({
    operation: "create",
    collection: "ledgers",
    docId: ledger._id,
    userId: req.user._id,
    userEmail: req.user.email,
    after: ledger.toObject(),
  });

  const payments = await Payment.find({ ledgerId: ledger._id })
    .sort({ recordedAt: 1 })
    .populate("recordedBy", "name email");

  res.status(201).json({
    success: true,
    data: { ledger, payments },
    message: "Ledger created successfully",
  });
});

const getLedgers = asyncHandler(async (req, res, _next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = {};

  filter.$or = [{ ownerId: req.user._id }, { createdBy: req.user._id }];

  if (req.user.ownerId) {
    filter.$or.push(
      { ownerId: req.user.ownerId },
      { createdBy: req.user.ownerId }
    );
  }

  if (req.query.search) {
    filter.counterpartyName = { $regex: req.query.search, $options: "i" };
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
  const ledger = await Ledger.findById(req.params.id).populate(
    "createdBy",
    "name email ownerId"
  );

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

const getLedgerPayments = asyncHandler(async (req, res, _next) => {
  const ledger = await Ledger.findById(req.params.id);

  if (!ledger) {
    throw new ApiErrors(404, "Ledger not found");
  }

  const canView =
    ledger.ownerId.toString() === req.user._id.toString() ||
    ledger.createdBy.toString() === req.user._id.toString() ||
    req.user.role === "owner" ||
    req.user.role === "admin" ||
    req.user.permissions?.canViewAllLedgers;

  if (!canView) {
    throw new ApiErrors(403, "Access denied");
  }

  const payments = await Payment.find({ ledgerId: ledger._id })
    .sort({ recordedAt: -1 })
    .populate("recordedBy", "name email");

  const totalPaid = payments
    .filter((p) => p.type === "payment")
    .reduce((sum, p) => sum + p.amount, 0);

  res.status(200).json({
    success: true,
    data: {
      payments,
      summary: {
        totalPayments: payments.length,
        totalPaid,
      },
    },
  });
});

const updateLedger = asyncHandler(async (req, res, _next) => {
  const {
    counterpartyName,
    counterpartyContact,
    dueDate,
    priority,
    notes,
    tags,
  } = req.body;

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
  if (counterpartyContact !== undefined)
    ledger.counterpartyContact = counterpartyContact;
  if (dueDate !== undefined) ledger.dueDate = dueDate;
  if (priority) ledger.priority = priority;
  if (notes !== undefined) ledger.notes = notes;
  if (tags) ledger.tags = tags;

  await ledger.save();

  const changes = [];
  if (counterpartyName && before.counterpartyName !== counterpartyName) {
    changes.push({
      field: "counterpartyName",
      oldValue: before.counterpartyName,
      newValue: counterpartyName,
    });
  }
  if (dueDate !== undefined && String(before.dueDate) !== String(dueDate)) {
    changes.push({
      field: "dueDate",
      oldValue: before.dueDate,
      newValue: dueDate,
    });
  }
  if (priority && before.priority !== priority) {
    changes.push({
      field: "priority",
      oldValue: before.priority,
      newValue: priority,
    });
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
  const { id } = req.params;
  const force = req.query.force === "true";

  const ledger = await Ledger.findById(id);

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

  const paymentsCount = await Payment.countDocuments({ ledgerId: ledger._id });

  if (paymentsCount > 0 && !force) {
    throw new ApiErrors(
      400,
      `Cannot delete ledger with ${paymentsCount} existing payment(s). Use ?force=true to delete anyway.`
    );
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      if (paymentsCount > 0) {
        const paymentsToDelete = await Payment.find({
          ledgerId: ledger._id,
        }).session(session);

        await Payment.deleteMany({ ledgerId: ledger._id }, { session });

        const paymentAuditLogs = paymentsToDelete.map((payment) => ({
          operation: "delete",
          collection: "payments",
          docId: payment._id,
          userId: req.user._id,
          userEmail: req.user.email,
          before: payment.toObject(),
          metadata: {
            cascadeDelete: true,
            ledgerId: ledger._id.toString(),
          },
        }));

        if (paymentAuditLogs.length > 0) {
          await AuditLog.create(paymentAuditLogs, { session, ordered: true });
        }
      }

      await Ledger.findByIdAndDelete(id, { session });

      await AuditLog.create(
        [
          {
            operation: "delete",
            collection: "ledgers",
            docId: ledger._id,
            userId: req.user._id,
            userEmail: req.user.email,
            before: ledger.toObject(),
            metadata: {
              cascadeDelete: paymentsCount > 0,
              paymentsDeleted: paymentsCount,
            },
          },
        ],
        { session }
      );
    });
  } finally {
    session.endSession();
  }

  const message =
    paymentsCount > 0
      ? `Ledger deleted successfully along with ${paymentsCount} payment(s)`
      : "Ledger deleted successfully";

  res.status(200).json({
    success: true,
    message,
  });
});

const addDebt = asyncHandler(async (req, res, _next) => {
  const { id: ledgerId } = req.params;
  const { amount, note } = req.body;

  if (!amount || amount <= 0) {
    throw new ApiErrors(400, "Valid amount is required");
  }

  const ledger = await Ledger.findById(ledgerId);

  if (!ledger) {
    throw new ApiErrors(404, "Ledger not found");
  }

  const canEdit =
    ledger.ownerId.toString() === req.user._id.toString() ||
    req.user.role === "owner" ||
    req.user.role === "admin" ||
    req.user.permissions?.canEditLedger;

  if (!canEdit) {
    throw new ApiErrors(
      403,
      "You don't have permission to add debt to this ledger"
    );
  }

  const previousOutstanding = ledger.outstandingBalance;
  const previousInitialAmount = ledger.initialAmount;

  const newOutstanding = previousOutstanding + amount;

  ledger.outstandingBalance = newOutstanding;

  await ledger.save();

  const payment = await Payment.create({
    ownerId: ledger.ownerId,
    ledgerId: ledger._id,
    amount,
    type: "adjustment",
    method: "other",
    note: note || "Added debt",
    recordedBy: req.user._id,
    recordedAt: new Date(),
    previousOutstanding,
    newOutstanding,
    idempotencyKey: `add-debt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    offline: false,
    syncStatus: "synced",
  });

  await AuditLog.create({
    operation: "update",
    collection: "ledgers",
    docId: ledger._id,
    userId: req.user._id,
    userEmail: req.user.email,
    before: {
      initialAmount: previousInitialAmount,
      outstandingBalance: previousOutstanding,
    },
    after: {
      initialAmount: previousInitialAmount,
      outstandingBalance: newOutstanding,
    },
    metadata: { action: "add_debt", amount, note },
  });

  await payment.populate("recordedBy", "name email");

  res.status(201).json({
    success: true,
    data: { ledger, payment },
    message: "Debt added successfully",
  });
});

export {
  createLedger,
  getLedgers,
  getLedgerById,
  getLedgerPayments,
  updateLedger,
  deleteLedger,
  addDebt,
};
