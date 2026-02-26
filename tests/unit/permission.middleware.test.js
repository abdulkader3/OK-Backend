import { authorize, requireOwner, requireAdmin } from "../../src/middlewares/permission.middleware.js";

jest.mock("../../src/utils/ApiErrors.js", () => {
  class ApiErrors extends Error {
    constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
      this.message = message;
    }
  }
  return { ApiErrors };
});

jest.mock("../../src/utils/asyncHandlers.js", () => ({
  asyncHandler: (fn) => (req, res, next) => fn(req, res, next),
}));

describe("Permission Middleware", () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      user: null,
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe("authorize", () => {
    it("should allow owner to perform any action", async () => {
      mockReq.user = { role: "owner", permissions: {} };

      const middleware = authorize("canDeleteLedger");

      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should allow user with specific permission", async () => {
      mockReq.user = {
        role: "staff",
        permissions: { canCreateLedger: true },
      };

      const middleware = authorize("canCreateLedger");

      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should deny user without permission", async () => {
      mockReq.user = {
        role: "staff",
        permissions: { canCreateLedger: false },
      };

      const middleware = authorize("canCreateLedger");

      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: "Insufficient permissions",
        })
      );
    });

    it("should allow admin to perform most actions", async () => {
      mockReq.user = {
        role: "admin",
        permissions: {},
      };

      const middleware = authorize("canViewAllLedgers");

      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should deny access when user is not authenticated", async () => {
      mockReq.user = null;

      const middleware = authorize("canCreateLedger");

      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it("should deny inactive user", async () => {
      mockReq.user = { role: "staff", active: false, permissions: {} };

      const middleware = authorize("canCreateLedger");

      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireOwner", () => {
    it("should allow owner", async () => {
      mockReq.user = { role: "owner" };

      await requireOwner(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should deny non-owner", async () => {
      mockReq.user = { role: "admin" };

      await requireOwner(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireAdmin", () => {
    it("should allow owner", async () => {
      mockReq.user = { role: "owner" };

      await requireAdmin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should allow admin", async () => {
      mockReq.user = { role: "admin" };

      await requireAdmin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should deny staff", async () => {
      mockReq.user = { role: "staff" };

      await requireAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });
});
