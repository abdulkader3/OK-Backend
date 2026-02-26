import { AuditLog } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

const getAuditLogs = asyncHandler(async (req, res, _next) => {
  const { entityId } = req.params;
  const { collection } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = { docId: entityId };

  if (collection) {
    filter.collection = collection;
  }

  const logs = await AuditLog.find(filter)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .populate("userId", "name email");

  const total = await AuditLog.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export { getAuditLogs };
