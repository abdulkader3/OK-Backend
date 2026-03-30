import {
  Ledger,
  BigBossBill,
  Payment,
  Sale,
  SalaryPayment,
} from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

const getOwnerFilter = (userId, user) => {
  const filter = {
    $or: [{ ownerId: userId }, { createdBy: userId }],
  };
  if (user.ownerId) {
    filter.$or.push({ ownerId: user.ownerId }, { createdBy: user.ownerId });
  }
  return filter;
};

const parseMonthYear = (year, month) => {
  const now = new Date();
  const parsedYear = year ? parseInt(year) : now.getFullYear();
  const parsedMonth = month ? parseInt(month) : now.getMonth() + 1;

  if (parsedYear < 2000 || parsedYear > 2100) {
    throw new Error("Invalid year parameter");
  }
  if (parsedMonth < 1 || parsedMonth > 12) {
    throw new Error("Invalid month parameter");
  }

  return { year: parsedYear, month: parsedMonth };
};

const getMonthDateRange = (year, month) => {
  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  return { startDate, endDate };
};

const formatDecimal = (value) => {
  if (value === null || value === undefined) return "0.00";
  return Number(value).toFixed(2);
};

const getMonthlySummary = asyncHandler(async (req, res, _next) => {
  const { year, month } = req.query;
  const userId = req.user._id;

  const { year: parsedYear, month: parsedMonth } = parseMonthYear(year, month);
  const ownerFilter = getOwnerFilter(userId, req.user);

  const { startDate, endDate } = getMonthDateRange(parsedYear, parsedMonth);

  const ledgerOwedTotalPipeline = [
    {
      $match: {
        ...ownerFilter,
        type: "payment",
      },
    },
    {
      $lookup: {
        from: "ledgers",
        localField: "ledgerId",
        foreignField: "_id",
        as: "ledger",
      },
    },
    { $unwind: "$ledger" },
    { $match: { "ledger.type": "owes_me" } },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
      },
    },
  ];

  const [ledgerTotalResult] = await Payment.aggregate(ledgerOwedTotalPipeline);

  const ledgerOwedMonthlyPipeline = [
    {
      $match: {
        ...ownerFilter,
        type: "payment",
        recordedAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $lookup: {
        from: "ledgers",
        localField: "ledgerId",
        foreignField: "_id",
        as: "ledger",
      },
    },
    { $unwind: "$ledger" },
    { $match: { "ledger.type": "owes_me" } },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
      },
    },
  ];

  const [ledgerMonthlyResult] = await Payment.aggregate(
    ledgerOwedMonthlyPipeline
  );

  const bigBossPaidPipeline = [
    {
      $match: {
        ownerId: userId,
        isPaid: true,
        year: parsedYear,
        month: parsedMonth,
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
      },
    },
  ];

  const [bigBossResult] = await BigBossBill.aggregate(bigBossPaidPipeline);

  const salaryPaidPipeline = [
    {
      $match: {
        ownerId: userId,
        year: parsedYear,
        month: parsedMonth,
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
      },
    },
  ];

  const [salaryResult] = await SalaryPayment.aggregate(salaryPaidPipeline);

  const salesMonthlyPipeline = [
    {
      $match: {
        ownerId: userId,
        deleted: false,
        ledgerId: null,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ];

  const [salesMonthlyResult] = await Sale.aggregate(salesMonthlyPipeline);

  const ledgerOwedTotal = ledgerTotalResult?.total || 0;
  const ledgerOwedMonthly = ledgerMonthlyResult?.total
    ? Number(ledgerMonthlyResult.total.toString())
    : 0;
  const bigBossPaid = bigBossResult?.total || 0;
  const salaryPaid = salaryResult?.total || 0;
  const salesMonthly = salesMonthlyResult?.total || 0;
  const balanceMonthly = ledgerOwedMonthly - bigBossPaid - salaryPaid;
  const balanceTotal =
    ledgerOwedTotal + salesMonthly - bigBossPaid - salaryPaid;

  res.status(200).json({
    success: true,
    data: {
      year: parsedYear,
      month: parsedMonth,
      ledgerOwedTotal: formatDecimal(ledgerOwedTotal),
      ledgerOwedMonthly: formatDecimal(ledgerOwedMonthly),
      salesTotal: formatDecimal(salesMonthly),
      bigBossPaid: formatDecimal(bigBossPaid),
      salaryPaid: formatDecimal(salaryPaid),
      balanceMonthly: formatDecimal(balanceMonthly),
      balanceTotal: formatDecimal(balanceTotal),
    },
  });
});

const getMonthlyHistory = asyncHandler(async (req, res, _next) => {
  const limit = parseInt(req.query.limit) || 12;
  const userId = req.user._id;
  const ownerFilter = getOwnerFilter(userId, req.user);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const months = [];
  for (let i = 0; i < limit; i++) {
    let m = currentMonth - i;
    let y = currentYear;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    months.push({ year: y, month: m });
  }

  const results = await Promise.all(
    months.map(async ({ year, month }) => {
      const { startDate, endDate } = getMonthDateRange(year, month);

      const ledgerOwedTotalPipeline = [
        {
          $match: {
            ...ownerFilter,
            type: "payment",
          },
        },
        {
          $lookup: {
            from: "ledgers",
            localField: "ledgerId",
            foreignField: "_id",
            as: "ledger",
          },
        },
        { $unwind: "$ledger" },
        { $match: { "ledger.type": "owes_me" } },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ];

      const [ledgerTotalResult] = await Payment.aggregate(
        ledgerOwedTotalPipeline
      );

      const ledgerOwedMonthlyPipeline = [
        {
          $match: {
            ...ownerFilter,
            type: "payment",
            recordedAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $lookup: {
            from: "ledgers",
            localField: "ledgerId",
            foreignField: "_id",
            as: "ledger",
          },
        },
        { $unwind: "$ledger" },
        { $match: { "ledger.type": "owes_me" } },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ];

      const [ledgerMonthlyResult] = await Payment.aggregate(
        ledgerOwedMonthlyPipeline
      );

      const bigBossPaidPipeline = [
        {
          $match: {
            ownerId: userId,
            isPaid: true,
            year: year,
            month: month,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ];

      const [bigBossResult] = await BigBossBill.aggregate(bigBossPaidPipeline);

      const salaryPaidPipeline = [
        {
          $match: {
            ownerId: userId,
            year: year,
            month: month,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ];

      const [salaryResult] = await SalaryPayment.aggregate(salaryPaidPipeline);

      const salesMonthlyPipeline = [
        {
          $match: {
            ownerId: userId,
            deleted: false,
            ledgerId: null,
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$totalAmount" },
          },
        },
      ];

      const [salesMonthlyResult] = await Sale.aggregate(salesMonthlyPipeline);

      const ledgerOwedTotal = ledgerTotalResult?.total || 0;
      const ledgerOwedMonthly = ledgerMonthlyResult?.total
        ? Number(ledgerMonthlyResult.total.toString())
        : 0;
      const bigBossPaid = bigBossResult?.total || 0;
      const salaryPaid = salaryResult?.total || 0;
      const salesMonthly = salesMonthlyResult?.total || 0;

      return {
        year,
        month,
        ledgerOwedTotal: formatDecimal(ledgerOwedTotal),
        ledgerOwedMonthly: formatDecimal(ledgerOwedMonthly),
        salesTotal: formatDecimal(salesMonthly),
        bigBossPaid: formatDecimal(bigBossPaid),
        salaryPaid: formatDecimal(salaryPaid),
        balanceMonthly: formatDecimal(
          ledgerOwedMonthly - bigBossPaid - salaryPaid
        ),
        balanceTotal: formatDecimal(
          ledgerOwedTotal + salesMonthly - bigBossPaid - salaryPaid
        ),
      };
    })
  );

  res.status(200).json({
    success: true,
    data: results,
  });
});

const getDashboardSummary = asyncHandler(async (req, res, _next) => {
  const userId = req.user._id;
  const now = new Date();
  const ownerFilter = getOwnerFilter(userId, req.user);

  const [owesMeLedgers, iOweLedgers, overdueLedgers, highPriorityLedgers] =
    await Promise.all([
      Ledger.find({ ...ownerFilter, type: "owes_me" }),
      Ledger.find({ ...ownerFilter, type: "i_owe" }),
      Ledger.find({
        ...ownerFilter,
        dueDate: { $lt: now },
        outstandingBalance: { $gt: 0 },
      }),
      Ledger.find({
        ...ownerFilter,
        priority: "high",
        outstandingBalance: { $gt: 0 },
      }),
    ]);

  const totalOwedToMe = owesMeLedgers.reduce(
    (sum, ledger) => sum + ledger.outstandingBalance,
    0
  );
  const totalIOwe = iOweLedgers.reduce(
    (sum, ledger) => sum + ledger.outstandingBalance,
    0
  );

  const recentLedgers = await Ledger.find(ownerFilter)
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("createdBy", "name email");

  const dueLedgers = await Ledger.find({
    ...ownerFilter,
    dueDate: { $gte: now },
    outstandingBalance: { $gt: 0 },
  })
    .sort({ dueDate: 1 })
    .limit(5)
    .populate("createdBy", "name email");

  res.status(200).json({
    success: true,
    data: {
      totalOwedToMe,
      totalIOwe,
      overdueCount: overdueLedgers.length,
      highPriorityCount: highPriorityLedgers.length,
      recentLedgers,
      dueLedgers,
    },
  });
});

export { getDashboardSummary, getMonthlySummary, getMonthlyHistory };
