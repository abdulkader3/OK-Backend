import mongoose from "mongoose";
import { Ledger, Payment, AuditLog } from "../models/index.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

const processBatchSync = asyncHandler(async (req, res, _next) => {
  const { operations } = req.body;

  if (!operations || !Array.isArray(operations) || operations.length === 0) {
    throw new ApiErrors(400, "Operations array is required");
  }

  if (operations.length > 100) {
    throw new ApiErrors(400, "Maximum 100 operations per batch");
  }

  const results = [];
  let processed = 0;
  let failed = 0;

  for (const op of operations) {
    const result = {
      clientTempId: op.clientTempId,
      success: false,
    };

    try {
      if (op.type === "payment") {
        const paymentResult = await processPaymentSync(req.user, op);
        result.success = paymentResult.success;
        result.serverAssignedId = paymentResult.serverAssignedId;
        result.conflict = paymentResult.conflict || false;
        result.conflictReason = paymentResult.conflictReason;
        result.serverState = paymentResult.serverState;
        
        if (paymentResult.idempotent) {
          result.idempotent = true;
        }
      } else {
        result.error = `Unknown operation type: ${op.type}`;
        failed++;
      }

      if (result.success) processed++;
      else failed++;
    } catch (error) {
      result.error = error.message;
      failed++;
    }

    results.push(result);
  }

  const response = {
    success: failed === 0,
    data: {
      results,
      processed,
      failed,
    },
  };

  if (failed > 0 && processed > 0) {
    response.message = "Partial batch failure";
  } else if (failed > 0) {
    response.message = "All operations failed";
  }

  res.status(failed === 0 ? 200 : 207).json(response);
});

async function processPaymentSync(user, op) {
  const { clientTempId, idempotencyKey, ledgerId, amount, type, method, note, receiptUrl, recordedAtClient, offline } = op;

  if (!idempotencyKey) {
    throw new ApiErrors(400, "idempotencyKey is required");
  }

  if (!ledgerId || !amount) {
    throw new ApiErrors(400, "ledgerId and amount are required");
  }

  const existingPayment = await Payment.findOne({ idempotencyKey });
  if (existingPayment) {
    return {
      success: true,
      serverAssignedId: existingPayment._id.toString(),
      idempotent: true,
    };
  }

  const ledger = await Ledger.findById(ledgerId);
  if (!ledger) {
    throw new ApiErrors(404, "Ledger not found");
  }

  const canRecord =
    ledger.ownerId.toString() === user._id.toString() ||
    user.role === "owner" ||
    user.role === "admin" ||
    user.permissions?.canRecordPayment;

  if (!canRecord) {
    throw new ApiErrors(403, "You don't have permission to record payments");
  }

  const previousOutstanding = ledger.outstandingBalance;
  let newOutstanding = type === "refund" ? previousOutstanding + amount : previousOutstanding - amount;

  const clientExpectedOutstanding = op.expectedOutstanding;
  const conflict = clientExpectedOutstanding !== undefined && clientExpectedOutstanding !== newOutstanding;

  const paymentData = {
    ledgerId,
    amount,
    type: type || "payment",
    method: method || "cash",
    note,
    receiptUrl,
    recordedBy: user._id,
    recordedAt: new Date(),
    previousOutstanding,
    newOutstanding,
    idempotencyKey,
    offline: offline !== false,
    syncStatus: "synced",
    clientTempId,
    recordedAtClient: recordedAtClient ? new Date(recordedAtClient) : null,
  };

  let payment;

  if (mongoose.connection.readyState === 1) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const [createdPayment] = await Payment.create([paymentData], { session });
        await Ledger.findByIdAndUpdate(ledgerId, { outstandingBalance: newOutstanding }, { session });
        payment = createdPayment;
        await AuditLog.create([{
          operation: "create",
          collection: "payments",
          docId: payment._id,
          userId: user._id,
          userEmail: user.email,
          before: null,
          after: payment.toObject(),
          metadata: { ledgerId, amount, previousOutstanding, newOutstanding, offlineSync: true, clientTempId },
        }], { session });
      });
    } finally {
      session.endSession();
    }
  } else {
    payment = await Payment.create(paymentData);
    await Ledger.findByIdAndUpdate(ledgerId, { outstandingBalance: newOutstanding });
    await AuditLog.create({
      operation: "create",
      collection: "payments",
      docId: payment._id,
      userId: user._id,
      userEmail: user.email,
      before: null,
      after: payment.toObject(),
      metadata: { ledgerId, amount, previousOutstanding, newOutstanding, offlineSync: true, clientTempId },
    });
  }

  return {
    success: true,
    serverAssignedId: payment._id.toString(),
    conflict,
    conflictReason: conflict ? "balance_divergence" : undefined,
    serverState: {
      ledgerId,
      previousOutstanding,
      newOutstanding,
      clientExpectedOutstanding: conflict ? clientExpectedOutstanding : undefined,
    },
  };
}

const getSyncStatus = asyncHandler(async (req, res, _next) => {
  const since = req.query.since;

  if (!since) {
    throw new ApiErrors(400, "since query parameter is required (ISO8601 timestamp)");
  }

  const sinceDate = new Date(since);
  if (isNaN(sinceDate.getTime())) {
    throw new ApiErrors(400, "Invalid since timestamp");
  }

  const [payments, ledgers] = await Promise.all([
    Payment.find({
      updatedAt: { $gte: sinceDate },
    })
      .sort({ updatedAt: -1 })
      .limit(500)
      .populate("recordedBy", "name email")
      .lean(),
    Ledger.find({
      updatedAt: { $gte: sinceDate },
    })
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean(),
  ]);

  const changes = payments.map((payment) => ({
    collection: "payments",
    docId: payment._id.toString(),
    operation: "create",
    timestamp: payment.updatedAt,
    data: {
      ledgerId: payment.ledgerId,
      amount: payment.amount,
      previousOutstanding: payment.previousOutstanding,
      newOutstanding: payment.newOutstanding,
      offline: payment.offline,
      clientTempId: payment.clientTempId,
    },
  }));

  const ledgersUpdated = ledgers.map((ledger) => ({
    docId: ledger._id.toString(),
    outstandingBalance: ledger.outstandingBalance,
    updatedAt: ledger.updatedAt,
  }));

  res.status(200).json({
    success: true,
    data: {
      syncTimestamp: new Date().toISOString(),
      changes,
      ledgersUpdated,
      pagination: {
        changesCount: changes.length,
        ledgersCount: ledgersUpdated.length,
      },
    },
  });
});

export { processBatchSync, getSyncStatus };
