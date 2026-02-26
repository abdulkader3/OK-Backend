import mongoose from "mongoose";
import { Ledger, Payment, AuditLog } from "../../src/models/index.js";
import { createLedger, getLedgers, getLedgerById, updateLedger } from "../../src/controllers/ledger.controller.js";

jest.mock("../../src/models/index.js", () => ({
  Ledger: {
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
  },
  Payment: {
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
  AuditLog: {
    create: jest.fn().mockResolvedValue({}),
  },
}));

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

jest.mock("../../src/config/logger.js", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe("Ledger Controller", () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      body: {},
      query: {},
      params: {},
      user: {
        _id: new mongoose.Types.ObjectId(),
        role: "owner",
        permissions: {},
      },
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe("createLedger", () => {
    it("should create a new ledger with correct initial balance", async () => {
      mockReq.body = {
        type: "owes_me",
        counterpartyName: "ABC Corp",
        initialAmount: 1000,
        currency: "USD",
        priority: "high",
      };

      const mockLedger = {
        _id: "ledger123",
        ownerId: mockReq.user._id,
        type: "owes_me",
        counterpartyName: "ABC Corp",
        initialAmount: 1000,
        outstandingBalance: 1000,
        currency: "USD",
        priority: "high",
        save: jest.fn().mockResolvedValue({}),
      };

      Ledger.create.mockResolvedValue([mockLedger]);

      await createLedger(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(Ledger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          initialAmount: 1000,
          outstandingBalance: 1000,
        })
      );
    });

    it("should create i_owe ledger with negative initial balance", async () => {
      mockReq.body = {
        type: "i_owe",
        counterpartyName: "Supplier XYZ",
        initialAmount: 500,
      };

      const mockLedger = {
        _id: "ledger123",
        type: "i_owe",
        initialAmount: 500,
        outstandingBalance: 500,
      };

      Ledger.create.mockResolvedValue([mockLedger]);

      await createLedger(mockReq, mockRes, mockNext);

      expect(Ledger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "i_owe",
          initialAmount: 500,
        })
      );
    });

    it("should require type field", async () => {
      mockReq.body = {
        counterpartyName: "ABC Corp",
        initialAmount: 1000,
      };

      await createLedger(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it("should require initialAmount", async () => {
      mockReq.body = {
        type: "owes_me",
        counterpartyName: "ABC Corp",
      };

      await createLedger(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe("getLedgers", () => {
    it("should return ledgers for owner", async () => {
      const mockLedgers = [
        { _id: "ledger1", ownerId: mockReq.user._id, type: "owes_me" },
        { _id: "ledger2", ownerId: mockReq.user._id, type: "i_owe" },
      ];

      Ledger.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockLedgers),
          }),
        }),
      });
      Ledger.countDocuments.mockResolvedValue(2);

      await getLedgers(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            ledgers: mockLedgers,
          }),
        })
      );
    });

    it("should filter by type when provided", async () => {
      mockReq.query.type = "owes_me";

      Ledger.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });
      Ledger.countDocuments.mockResolvedValue(0);

      await getLedgers(mockReq, mockRes, mockNext);

      expect(Ledger.find).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "owes_me",
        })
      );
    });
  });

  describe("updateLedger", () => {
    it("should update ledger fields", async () => {
      mockReq.params.id = "ledger123";
      mockReq.body = {
        priority: "low",
        notes: "Updated notes",
      };

      const mockLedger = {
        _id: "ledger123",
        ownerId: mockReq.user._id,
        counterpartyName: "ABC Corp",
        priority: "medium",
        save: jest.fn().mockResolvedValue({}),
      };

      Ledger.findById.mockResolvedValue(mockLedger);
      Ledger.findByIdAndUpdate = jest.fn().mockResolvedValue({
        ...mockLedger,
        priority: "low",
        notes: "Updated notes",
      });

      await updateLedger(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should return 404 for non-existent ledger", async () => {
      mockReq.params.id = "nonexistent";
      mockReq.body = { priority: "low" };

      Ledger.findById.mockResolvedValue(null);

      await updateLedger(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });
});
