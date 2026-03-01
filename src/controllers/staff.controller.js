import { User } from "../models/index.js";
import { ApiErrors } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandlers.js";

const getCompanyStaff = asyncHandler(async (req, res, _next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const company = req.user.company;

  if (!company) {
    throw new ApiErrors(400, "Company not assigned to user");
  }

  const filter = {
    company: company,
    role: { $in: ["admin", "staff"] },
  };

  const users = await User.find(filter)
    .select("-passwordHash -refreshToken")
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await User.countDocuments(filter);

  res.status(200).json({
    success: true,
    data: {
      staff: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export { getCompanyStaff };
