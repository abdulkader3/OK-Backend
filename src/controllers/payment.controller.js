import mongoose from "mongoose";
import { Ledger, Payment, AuditLog } from "../models/index.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

const createPayment = asyncHandler(async (req, res, _next) => {
  const { id: ledgerId } = req.params;
  const { amount, type, method, note, receiptUrl, idempotencyKey } = req.body;

  if (!amount || amount <= 0) {
    throw new ApiErrors(400, "Valid payment amount is required");
  }

  if (idempotencyKey) {
    const existingPayment = await Payment.findOne({ idempotencyKey });
    if (existingPayment) {
      return res.status(200).json({
        success: true,
        data: { payment: existingPayment },
        message: "Existing payment returned (idempotency)",
      });
    }
  }

  const ledger = await Ledger.findById(ledgerId);

  if (!ledger) {
    throw new ApiErrors(404, "Ledger not found");
  }

  const canRecord =
    ledger.ownerId.toString() === req.user._id.toString() ||
    req.user.role === "owner" ||
    req.user.role === "admin" ||
    req.user.permissions?.canRecordPayment;

  if (!canRecord) {
    throw new ApiErrors(403, "You don't have permission to record payments");
  }

  const previousOutstanding = ledger.outstandingBalance;
  let newOutstanding;

  if (type === "refund") {
    newOutstanding = previousOutstanding + amount;
  } else {
    newOutstanding = previousOutstanding - amount;
  }

  let payment;

  if (mongoose.connection.readyState === 1) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const [createdPayment] = await Payment.create(
          [
            {
              ledgerId,
              amount,
              type: type || "payment",
              method: method || "cash",
              note,
              receiptUrl,
              recordedBy: req.user._id,
              recordedAt: new Date(),
              previousOutstanding,
              newOutstanding,
              idempotencyKey,
              offline: false,
              syncStatus: "synced",
            },
          ],
          { session }
        );

        await Ledger.findByIdAndUpdate(
          ledgerId,
          { outstandingBalance: newOutstanding },
          { session }
        );

        payment = createdPayment;

        await AuditLog.create(
          [
            {
              operation: "create",
              collection: "payments",
              docId: payment._id,
              userId: req.user._id,
              userEmail: req.user.email,
              before: null,
              after: payment.toObject(),
              metadata: { ledgerId, amount, previousOutstanding, newOutstanding },
            },
          ],
          { session }
        );
      });
    } finally {
      session.endSession();
    }
  } else {
    payment = await Payment.create({
      ledgerId,
      amount,
      type: type || "payment",
      method: method || "cash",
      note,
      receiptUrl,
      recordedBy: req.user._id,
      recordedAt: new Date(),
      previousOutstanding,
      newOutstanding,
      idempotencyKey,
      offline: false,
      syncStatus: "synced",
    });

    await Ledger.findByIdAndUpdate(ledgerId, { outstandingBalance: newOutstanding });

    await AuditLog.create({
      operation: "create",
      collection: "payments",
      docId: payment._id,
      userId: req.user._id,
      userEmail: req.user.email,
      before: null,
      after: payment.toObject(),
      metadata: { ledgerId, amount, previousOutstanding, newOutstanding },
    });
  }

  await payment.populate("recordedBy", "name email");

  res.status(201).json({
    success: true,
    data: { payment },
    message: "Payment recorded successfully",
  });
});

const getPayments = asyncHandler(async (req, res, _next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = {};

  if (req.query.ledgerId) {
    filter.ledgerId = req.query.ledgerId;
  }

  if (req.user.role !== "owner" && req.user.role !== "admin" && !req.user.permissions?.canViewAllLedgers) {
    filter.recordedBy = req.user._id;
  } else if (req.query.recordedBy) {
    filter.recordedBy = req.query.recordedBy;
  }

  if (req.query.dateFrom || req.query.dateTo) {
    filter.recordedAt = {};
    if (req.query.dateFrom) {
      filter.recordedAt.$gte = new Date(req.query.dateFrom);
    }
    if (req.query.dateTo) {
      filter.recordedAt.$lte = new Date(req.query.dateTo);
    }
  }

  const payments = await Payment.find(filter)
    .sort({ recordedAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("recordedBy", "name email")
    .populate("ledgerId", "counterpartyName type");

  const total = await Payment.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: {
      payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

const getPaymentById = asyncHandler(async (req, res, _next) => {
  const payment = await Payment.findById(req.params.id)
    .populate("recordedBy", "name email")
    .populate("ledgerId");

  if (!payment) {
    throw new ApiErrors(404, "Payment not found");
  }

  res.status(200).json({
    success: true,
    data: { payment },
  });
});

export { createPayment, getPayments, getPaymentById };
