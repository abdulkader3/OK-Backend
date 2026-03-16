import mongoose from "mongoose";
import { Ledger, Payment, AuditLog, Product, Sale } from "../models/index.js";
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
      idempotencyKey: op.idempotencyKey,
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
      } else if (op.type === "product") {
        const productResult = await processProductSync(req.user, op);
        result.success = productResult.success;
        result.serverAssignedId = productResult.serverAssignedId;

        if (productResult.idempotent) {
          result.idempotent = true;
        }
      } else if (op.type === "sale") {
        const saleResult = await processSaleSync(req.user, op);
        result.success = saleResult.success;
        result.serverAssignedId = saleResult.serverAssignedId;
        result.ledgerDebtCreated = saleResult.ledgerDebtCreated;
        result.ledgerTxnId = saleResult.ledgerTxnId || null;

        if (saleResult.idempotent) {
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
  const {
    clientTempId,
    idempotencyKey,
    ledgerId,
    amount,
    type,
    method,
    note,
    receiptUrl,
    recordedAtClient,
    offline,
  } = op;

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
  let newOutstanding =
    type === "refund"
      ? previousOutstanding + amount
      : previousOutstanding - amount;

  const clientExpectedOutstanding = op.expectedOutstanding;
  const conflict =
    clientExpectedOutstanding !== undefined &&
    clientExpectedOutstanding !== newOutstanding;

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
        const [createdPayment] = await Payment.create([paymentData], {
          session,
        });
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
              userId: user._id,
              userEmail: user.email,
              before: null,
              after: payment.toObject(),
              metadata: {
                ledgerId,
                amount,
                previousOutstanding,
                newOutstanding,
                offlineSync: true,
                clientTempId,
              },
            },
          ],
          { session }
        );
      });
    } finally {
      session.endSession();
    }
  } else {
    payment = await Payment.create(paymentData);
    await Ledger.findByIdAndUpdate(ledgerId, {
      outstandingBalance: newOutstanding,
    });
    await AuditLog.create({
      operation: "create",
      collection: "payments",
      docId: payment._id,
      userId: user._id,
      userEmail: user.email,
      before: null,
      after: payment.toObject(),
      metadata: {
        ledgerId,
        amount,
        previousOutstanding,
        newOutstanding,
        offlineSync: true,
        clientTempId,
      },
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
      clientExpectedOutstanding: conflict
        ? clientExpectedOutstanding
        : undefined,
    },
  };
}

async function processProductSync(user, op) {
  const { clientTempId, idempotencyKey, name, price, imageUrl, operation } = op;

  if (!name || price === undefined) {
    throw new ApiErrors(400, "name and price are required");
  }

  const ownerId = user.ownerId || user._id;

  if (idempotencyKey) {
    const existingProduct = await Product.findOne({ idempotencyKey });
    if (existingProduct) {
      return {
        success: true,
        serverAssignedId: existingProduct._id.toString(),
        idempotent: true,
      };
    }
  }

  if (operation === "delete") {
    const product = await Product.findOne({ clientTempId, ownerId });
    if (product) {
      product.deleted = true;
      product.syncStatus = "synced";
      await product.save();
      return {
        success: true,
        serverAssignedId: product._id.toString(),
      };
    }
    return {
      success: true,
      serverAssignedId: null,
    };
  }

  const product = await Product.create({
    ownerId,
    name,
    price,
    imageUrl: imageUrl || null,
    clientTempId: clientTempId || null,
    idempotencyKey: idempotencyKey || null,
    syncStatus: "synced",
  });

  await AuditLog.create({
    operation: "create",
    collection: "products",
    docId: product._id,
    userId: user._id,
    userEmail: user.email,
    after: product.toObject(),
    metadata: { offlineSync: true, clientTempId },
  });

  return {
    success: true,
    serverAssignedId: product._id.toString(),
  };
}

async function processSaleSync(user, op) {
  const {
    clientTempId,
    idempotencyKey,
    totalAmount,
    items,
    ledgerId,
    recordedAtClient,
    operation,
  } = op;

  if (!totalAmount || !items || !Array.isArray(items) || items.length === 0) {
    throw new ApiErrors(400, "totalAmount and items are required");
  }

  const ownerId = user.ownerId || user._id;

  if (idempotencyKey) {
    const existingSale = await Sale.findOne({ idempotencyKey });
    if (existingSale) {
      return {
        success: true,
        serverAssignedId: existingSale._id.toString(),
        idempotent: true,
        ledgerDebtCreated: existingSale.ledgerDebtCreated,
        ledgerTxnId: existingSale.ledgerDebtId
          ? existingSale.ledgerDebtId.toString()
          : null,
      };
    }
  }

  if (operation === "delete") {
    const sale = await Sale.findOne({ clientTempId, ownerId });
    if (sale) {
      if (sale.ledgerDebtCreated) {
        throw new ApiErrors(
          400,
          "Cannot delete a sale with ledger debt. Reverse the ledger entry first."
        );
      }
      sale.deleted = true;
      sale.syncStatus = "synced";
      await sale.save();
      return {
        success: true,
        serverAssignedId: sale._id.toString(),
      };
    }
    return {
      success: true,
      serverAssignedId: null,
    };
  }

  let ledgerDebtCreated = false;
  let ledgerDebtId = null;

  const session = await mongoose.startSession();
  let sale;

  try {
    await session.withTransaction(async () => {
      const saleData = {
        ownerId,
        totalAmount,
        items: items.map((item) => ({
          clientProductId: item.productId || null,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          subtotal: item.subtotal,
        })),
        clientTempId: clientTempId || null,
        idempotencyKey: idempotencyKey || null,
        syncStatus: "synced",
        recordedAtClient: recordedAtClient ? new Date(recordedAtClient) : null,
      };

      if (ledgerId) {
        const ledger = await Ledger.findById(ledgerId).session(session);
        if (!ledger) {
          throw new ApiErrors(404, "Ledger not found");
        }

        saleData.ledgerId = ledgerId;

        const previousOutstanding = ledger.outstandingBalance;
        const newOutstanding = previousOutstanding + totalAmount;

        ledger.initialAmount = previousOutstanding + totalAmount;
        ledger.outstandingBalance = newOutstanding;
        await ledger.save({ session });

        const payment = await Payment.create(
          [
            {
              ledgerId,
              amount: totalAmount,
              type: "adjustment",
              method: "other",
              note: "Sale on credit (offline sync)",
              recordedBy: user._id,
              recordedAt: new Date(),
              previousOutstanding,
              newOutstanding,
              idempotencyKey: idempotencyKey
                ? `sale-debt-${idempotencyKey}`
                : `sale-debt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              offline: true,
              syncStatus: "synced",
              clientTempId: clientTempId ? `debt-${clientTempId}` : null,
            },
          ],
          { session }
        );

        saleData.ledgerDebtCreated = true;
        saleData.ledgerDebtId = payment[0]._id;
        ledgerDebtCreated = true;
        ledgerDebtId = payment[0]._id;
      }

      const [createdSale] = await Sale.create([saleData], { session });
      sale = createdSale;

      await AuditLog.create(
        [
          {
            operation: "create",
            collection: "sales",
            docId: sale._id,
            userId: user._id,
            userEmail: user.email,
            after: sale.toObject(),
            metadata: {
              ledgerDebtCreated,
              ledgerDebtId,
              totalAmount,
              itemsCount: items.length,
              offlineSync: true,
              clientTempId,
            },
          },
        ],
        { session }
      );
    });
  } finally {
    session.endSession();
  }

  return {
    success: true,
    serverAssignedId: sale._id.toString(),
    ledgerDebtCreated,
    ledgerTxnId: ledgerDebtId ? ledgerDebtId.toString() : null,
  };
}

const getSyncStatus = asyncHandler(async (req, res, _next) => {
  const since = req.query.since;

  if (!since) {
    throw new ApiErrors(
      400,
      "since query parameter is required (ISO8601 timestamp)"
    );
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
