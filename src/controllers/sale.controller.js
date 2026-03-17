import mongoose from "mongoose";
import { Sale, Ledger, Payment, AuditLog } from "../models/index.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

const createSale = asyncHandler(async (req, res, _next) => {
  const {
    totalAmount,
    items,
    ledgerId,
    clientTempId,
    idempotencyKey,
    recordedAtClient,
  } = req.body;

  if (!totalAmount || !items || !Array.isArray(items) || items.length === 0) {
    throw new ApiErrors(400, "Total amount and items are required");
  }

  if (idempotencyKey) {
    const existingSale = await Sale.findOne({ idempotencyKey });
    if (existingSale) {
      return res.status(200).json({
        success: true,
        data: { sale: existingSale, idempotent: true },
        message: "Sale already exists",
      });
    }
  }

  const ownerId = req.user.ownerId || req.user._id;
  let ledgerDebtId = null;
  let ledgerDebtCreated = false;

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

        const canEdit =
          ledger.ownerId.toString() === ownerId.toString() ||
          req.user.role === "owner" ||
          req.user.role === "admin" ||
          req.user.permissions?.canEditLedger;

        if (!canEdit) {
          throw new ApiErrors(
            403,
            "You don't have permission to add debt to this ledger"
          );
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
              ownerId,
              ledgerId,
              amount: totalAmount,
              type: "adjustment",
              method: "other",
              note: "Sale on credit",
              recordedBy: req.user._id,
              recordedAt: new Date(),
              previousOutstanding,
              newOutstanding,
              idempotencyKey: idempotencyKey
                ? `sale-debt-${idempotencyKey}`
                : `sale-debt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              offline: false,
              syncStatus: "synced",
              clientTempId: clientTempId ? `debt-${clientTempId}` : null,
            },
          ],
          { session }
        );

        saleData.ledgerDebtCreated = true;
        saleData.ledgerDebtId = payment[0]._id;
        ledgerDebtId = payment[0]._id;
        ledgerDebtCreated = true;
      }

      const [createdSale] = await Sale.create([saleData], { session });
      sale = createdSale;

      await AuditLog.create(
        [
          {
            operation: "create",
            collection: "sales",
            docId: sale._id,
            userId: req.user._id,
            userEmail: req.user.email,
            after: sale.toObject(),
            metadata: {
              ledgerDebtCreated,
              ledgerDebtId,
              totalAmount,
              itemsCount: items.length,
            },
          },
        ],
        { session }
      );
    });
  } finally {
    session.endSession();
  }

  await sale.populate("ledgerId", "counterpartyName outstandingBalance");

  res.status(201).json({
    success: true,
    data: {
      sale,
      ledgerDebtCreated,
    },
    message: ledgerDebtCreated
      ? "Sale created with ledger debt"
      : "Sale created successfully",
  });
});

const getSales = asyncHandler(async (req, res, _next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;
  const since = req.query.since;

  const filter = {
    ownerId: req.user.ownerId || req.user._id,
    deleted: false,
  };

  if (req.query.ledgerId) {
    filter.ledgerId = req.query.ledgerId;
  }

  if (req.query.syncStatus) {
    filter.syncStatus = req.query.syncStatus;
  }

  if (since) {
    const sinceDate = new Date(since);
    if (!isNaN(sinceDate.getTime())) {
      filter.updatedAt = { $gte: sinceDate };
    }
  }

  const sales = await Sale.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("ledgerId", "counterpartyName outstandingBalance");

  const total = await Sale.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: {
      sales,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

const getSaleById = asyncHandler(async (req, res, _next) => {
  const sale = await Sale.findById(req.params.id).populate(
    "ledgerId",
    "counterpartyName outstandingBalance"
  );

  if (!sale) {
    throw new ApiErrors(404, "Sale not found");
  }

  if (
    sale.ownerId.toString() !== (req.user.ownerId || req.user._id).toString()
  ) {
    throw new ApiErrors(403, "Access denied");
  }

  res.status(200).json({
    success: true,
    data: { sale },
  });
});

const deleteSale = asyncHandler(async (req, res, _next) => {
  const sale = await Sale.findById(req.params.id);

  if (!sale) {
    throw new ApiErrors(404, "Sale not found");
  }

  if (
    sale.ownerId.toString() !== (req.user.ownerId || req.user._id).toString()
  ) {
    throw new ApiErrors(403, "Access denied");
  }

  if (sale.ledgerDebtCreated) {
    throw new ApiErrors(
      400,
      "Cannot delete a sale that has an associated ledger debt. Reverse the ledger entry first."
    );
  }

  const before = sale.toObject();
  sale.deleted = true;
  sale.syncStatus = "synced";
  await sale.save();

  await AuditLog.create({
    operation: "delete",
    collection: "sales",
    docId: sale._id,
    userId: req.user._id,
    userEmail: req.user.email,
    before,
    after: null,
  });

  res.status(200).json({
    success: true,
    message: "Sale deleted successfully",
  });
});

export { createSale, getSales, getSaleById, deleteSale };
