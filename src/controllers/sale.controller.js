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
    paymentMethod,
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
        createdAt: recordedAtClient ? new Date(recordedAtClient) : new Date(),
        recordedAtClient: recordedAtClient ? new Date(recordedAtClient) : null,
        paymentMethod: ledgerId ? null : paymentMethod || null,
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
              recordedAt: recordedAtClient
                ? new Date(recordedAtClient)
                : new Date(),
              previousOutstanding,
              newOutstanding,
              idempotencyKey: idempotencyKey
                ? `sale-debt-${idempotencyKey}`
                : `sale-debt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              offline: false,
              syncStatus: "synced",
              clientTempId: clientTempId ? `debt-${clientTempId}` : null,
              recordedAtClient: recordedAtClient
                ? new Date(recordedAtClient)
                : null,
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

  if (req.query.since) {
    const sinceDate = new Date(req.query.since);
    if (!isNaN(sinceDate.getTime())) {
      filter.updatedAt = { $gte: sinceDate };
    }
  }

  if (req.query.dateFrom || req.query.dateTo) {
    filter.createdAt = {};
    if (req.query.dateFrom) {
      filter.createdAt.$gte = new Date(req.query.dateFrom);
    }
    if (req.query.dateTo) {
      const toDate = new Date(req.query.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = toDate;
    }
  }

  const sales = await Sale.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("ledgerId", "counterpartyName outstandingBalance");

  const total = await Sale.countDocuments(filter);

  const formattedSales = sales.map((sale) => ({
    _id: sale._id,
    totalAmount: sale.totalAmount,
    items: sale.items,
    paymentStatus: sale.ledgerId ? "not_paid" : "paid",
    paymentMethod: sale.paymentMethod,
    ledgerId: sale.ledgerId?._id || null,
    ledgerName: sale.ledgerId?.counterpartyName || null,
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
  }));

  res.status(200).json({
    success: true,
    data: {
      sales: formattedSales,
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

const getSalesByDate = asyncHandler(async (req, res, _next) => {
  const { dateFrom, dateTo } = req.query;
  const userId = req.user._id;
  const ownerId = req.user.ownerId || req.user._id;

  const ownerFilter = {
    $or: [{ ownerId: userId }, { createdBy: userId }],
  };
  if (req.user.ownerId) {
    ownerFilter.$or.push(
      { ownerId: req.user.ownerId },
      { createdBy: req.user.ownerId }
    );
  }

  const salesFilter = {
    ownerId,
    deleted: false,
  };

  if (dateFrom || dateTo) {
    salesFilter.createdAt = {};
    if (dateFrom) {
      const [year, month, day] = dateFrom.split("-").map(Number);
      salesFilter.createdAt.$gte = new Date(year, month - 1, day, 0, 0, 0, 0);
    }
    if (dateTo) {
      const [year, month, day] = dateTo.split("-").map(Number);
      salesFilter.createdAt.$lte = new Date(
        year,
        month - 1,
        day,
        23,
        59,
        59,
        999
      );
    }
  }

  const sales = await Sale.find(salesFilter)
    .sort({ createdAt: -1 })
    .populate("ledgerId", "counterpartyName outstandingBalance");

  const paymentFilter = {
    ...ownerFilter,
    type: "payment",
  };

  if (dateFrom || dateTo) {
    paymentFilter.recordedAt = {};
    if (dateFrom) {
      const [year, month, day] = dateFrom.split("-").map(Number);
      paymentFilter.recordedAt.$gte = new Date(
        year,
        month - 1,
        day,
        0,
        0,
        0,
        0
      );
    }
    if (dateTo) {
      const [year, month, day] = dateTo.split("-").map(Number);
      paymentFilter.recordedAt.$lte = new Date(
        year,
        month - 1,
        day,
        23,
        59,
        59,
        999
      );
    }
  }

  const payments = await Payment.find(paymentFilter)
    .sort({ recordedAt: -1 })
    .populate({
      path: "ledgerId",
      select: "counterpartyName type",
      match: { type: "owes_me" },
    });

  const filteredPayments = payments.filter((p) => p.ledgerId !== null);

  const groupedByDate = {};

  sales.forEach((sale) => {
    const dateKey = sale.createdAt.toISOString().split("T")[0];

    if (!groupedByDate[dateKey]) {
      groupedByDate[dateKey] = {
        date: dateKey,
        sales: [],
        totalAmount: 0,
        transactionCount: 0,
        paidCount: 0,
        unpaidCount: 0,
      };
    }

    const isCreditSale = !!sale.ledgerId;

    groupedByDate[dateKey].sales.push({
      type: "sale",
      _id: sale._id,
      total: sale.totalAmount,
      totalAmount: sale.totalAmount,
      items: sale.items,
      paymentStatus: isCreditSale ? "not_paid" : "paid",
      paymentMethod: sale.paymentMethod,
      ledgerId: sale.ledgerId?._id || null,
      ledgerName: sale.ledgerId?.counterpartyName || null,
      createdAt: sale.createdAt,
    });

    groupedByDate[dateKey].totalAmount += sale.totalAmount;
    groupedByDate[dateKey].transactionCount += 1;

    if (isCreditSale) {
      groupedByDate[dateKey].unpaidCount += 1;
    } else {
      groupedByDate[dateKey].paidCount += 1;
    }
  });

  filteredPayments.forEach((payment) => {
    const dateKey = payment.recordedAt.toISOString().split("T")[0];

    if (!groupedByDate[dateKey]) {
      groupedByDate[dateKey] = {
        date: dateKey,
        sales: [],
        totalAmount: 0,
        transactionCount: 0,
        paidCount: 0,
        unpaidCount: 0,
      };
    }

    groupedByDate[dateKey].sales.push({
      type: "payment",
      _id: payment._id,
      total: payment.amount,
      totalAmount: payment.amount,
      items: null,
      paymentStatus: "paid",
      paymentMethod: payment.method,
      note: payment.note,
      ledgerId: payment.ledgerId?._id || null,
      ledgerName: payment.ledgerId?.counterpartyName || null,
      createdAt: payment.recordedAt,
    });

    groupedByDate[dateKey].totalAmount += payment.amount;
    groupedByDate[dateKey].transactionCount += 1;
    groupedByDate[dateKey].paidCount += 1;
  });

  const result = Object.values(groupedByDate).sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  result.forEach((day) => {
    day.sales.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  });

  res.status(200).json({
    success: true,
    data: {
      groupedSales: result,
      totalTransactions: sales.length + filteredPayments.length,
      totalAmount:
        sales.reduce((sum, s) => sum + s.totalAmount, 0) +
        filteredPayments.reduce((sum, p) => sum + p.amount, 0),
    },
  });
});

const getSalesSummary = asyncHandler(async (req, res, _next) => {
  const { dateFrom, dateTo } = req.query;

  const filter = {
    ownerId: req.user.ownerId || req.user._id,
    deleted: false,
  };

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) {
      filter.createdAt.$gte = new Date(dateFrom);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = toDate;
    }
  }

  const sales = await Sale.find(filter)
    .sort({ createdAt: -1 })
    .populate("ledgerId", "counterpartyName outstandingBalance");

  const totalAmount = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const totalTransactions = sales.length;
  const creditSales = sales.filter((s) => s.ledgerId);
  const cashSales = sales.filter((s) => !s.ledgerId);

  const formattedSales = sales.map((sale) => ({
    _id: sale._id,
    totalAmount: sale.totalAmount,
    items: sale.items,
    paymentStatus: sale.ledgerId ? "not_paid" : "paid",
    paymentMethod: sale.paymentMethod,
    ledgerId: sale.ledgerId?._id || null,
    ledgerName: sale.ledgerId?.counterpartyName || null,
    createdAt: sale.createdAt,
  }));

  res.status(200).json({
    success: true,
    data: {
      summary: {
        dateRange: {
          from: dateFrom || null,
          to: dateTo || null,
        },
        totalAmount,
        totalTransactions,
        paidTransactions: cashSales.length,
        unpaidTransactions: creditSales.length,
        paidAmount: cashSales.reduce((sum, s) => sum + s.totalAmount, 0),
        unpaidAmount: creditSales.reduce((sum, s) => sum + s.totalAmount, 0),
      },
      sales: formattedSales,
    },
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

export {
  createSale,
  getSales,
  getSaleById,
  deleteSale,
  getSalesByDate,
  getSalesSummary,
};
