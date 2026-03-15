import { Ledger } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

const getDashboardSummary = asyncHandler(async (req, res, _next) => {
  const userId = req.user._id;
  const now = new Date();

  let ownerFilter = {
    $or: [{ ownerId: userId }, { createdBy: userId }],
  };

  if (req.user.ownerId) {
    ownerFilter.$or.push(
      { ownerId: req.user.ownerId },
      { createdBy: req.user.ownerId }
    );
  }

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

export { getDashboardSummary };
