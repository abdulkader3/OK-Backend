import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  User,
  BigBoss,
  BigBossBill,
  Ledger,
  LedgerTransaction,
  AuditLog,
} from "../src/models/index.js";
import { register } from "../src/controllers/auth.controller.js";
import { getMonthlySummary } from "../src/controllers/dashboard.controller.js";
import { payBill, unpayBill } from "../src/controllers/bigboss.controller.js";

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { directConnection: true });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await User.deleteMany({});
  await BigBoss.deleteMany({});
  await BigBossBill.deleteMany({});
  await Ledger.deleteMany({});
  await LedgerTransaction.deleteMany({});
  await AuditLog.deleteMany({});
});

describe("Monthly Balance Feature Integration Tests", () => {
  let user, bigBoss, bill;

  beforeEach(async () => {
    const res = await register(
      {
        body: {
          name: "Test Owner",
          email: "owner@test.com",
          password: "password123",
        },
        cookies: {},
        ip: "127.0.0.1",
        get: () => "test",
      },
      {
        status: () => ({
          json: (data) => data,
        }),
        cookie: () => {},
      },
      () => {}
    );

    user = await User.findOne({ email: "owner@test.com" });

    bigBoss = await BigBoss.create({
      ownerId: user._id,
      name: "Test Supplier",
      description: "Test vendor",
      createdBy: user._id,
    });

    bill = await BigBossBill.create({
      bigBossId: bigBoss._id,
      ownerId: user._id,
      month: 3,
      year: 2026,
      amount: 1200,
      description: "March bill",
      createdBy: user._id,
    });
  });

  describe("GET /api/dashboard/monthly-summary", () => {
    it("should return zero when no data exists", async () => {
      const result = await getMonthlySummary(
        {
          query: { year: "2026", month: "3" },
          user: { _id: user._id },
        },
        {
          status: () => ({ json: (data) => data }),
        },
        () => {}
      );

      expect(result.success).toBe(true);
      expect(result.data.ledgerOwedTotal).toBe("0.00");
      expect(result.data.ledgerOwedMonthly).toBe("0.00");
      expect(result.data.bigBossPaid).toBe("0.00");
      expect(result.data.balanceMonthly).toBe("0.00");
    });

    it("should include ledgerOwedTotal from outstandingBalance", async () => {
      await Ledger.create({
        ownerId: user._id,
        type: "owes_me",
        counterpartyName: "Test Customer",
        initialAmount: 5000,
        outstandingBalance: 5000,
        createdBy: user._id,
      });

      const result = await getMonthlySummary(
        {
          query: { year: "2026", month: "3" },
          user: { _id: user._id },
        },
        {
          status: () => ({ json: (data) => data }),
        },
        () => {}
      );

      expect(result.data.ledgerOwedTotal).toBe("5000.00");
      expect(result.data.ledgerOwedMonthly).toBe("0.00");
    });

    it("should include ledgerOwedMonthly from LedgerTransaction", async () => {
      const ledger = await Ledger.create({
        ownerId: user._id,
        type: "owes_me",
        counterpartyName: "Test Customer",
        initialAmount: 5000,
        outstandingBalance: 5000,
        createdBy: user._id,
      });

      await LedgerTransaction.create({
        ledgerId: ledger._id,
        ownerId: user._id,
        amount: mongoose.Types.Decimal128.fromString("1000.00"),
        type: "owes_me",
        transactionDate: new Date(2026, 2, 15),
        source: "ledger_create",
      });

      const result = await getMonthlySummary(
        {
          query: { year: "2026", month: "3" },
          user: { _id: user._id },
        },
        {
          status: () => ({ json: (data) => data }),
        },
        () => {}
      );

      expect(result.data.ledgerOwedTotal).toBe("5000.00");
      expect(result.data.ledgerOwedMonthly).toBe("1000.00");
    });
  });

  describe("POST /api/bigboss/bills/:id/pay", () => {
    it("should mark bill as paid and update summary", async () => {
      await Ledger.create({
        ownerId: user._id,
        type: "owes_me",
        counterpartyName: "Test Customer",
        initialAmount: 5000,
        outstandingBalance: 5000,
        createdBy: user._id,
      });

      const result = await payBill(
        {
          params: { billId: bill._id.toString() },
          user: { _id: user._id, email: user.email },
        },
        {
          status: () => ({ json: (data) => data }),
        },
        () => {}
      );

      expect(result.success).toBe(true);
      expect(result.data.bill.isPaid).toBe(true);
      expect(result.data.bill.paidAt).toBeDefined();
      expect(result.data.monthlySummary.bigBossPaid).toBe("1200.00");

      const updatedBill = await BigBossBill.findById(bill._id);
      expect(updatedBill.isPaid).toBe(true);
    });

    it("should be idempotent - calling pay twice returns same result", async () => {
      await payBill(
        {
          params: { billId: bill._id.toString() },
          user: { _id: user._id, email: user.email },
        },
        { status: () => ({ json: (data) => data }) },
        () => {}
      );

      const result2 = await payBill(
        {
          params: { billId: bill._id.toString() },
          user: { _id: user._id, email: user.email },
        },
        {
          status: () => ({ json: (data) => data }),
        },
        () => {}
      );

      expect(result2.success).toBe(true);
      expect(result2.message).toBe("Bill already paid");
      expect(result2.data.monthlySummary.bigBossPaid).toBe("1200.00");
    });

    it("should create audit log entry for pay", async () => {
      await payBill(
        {
          params: { billId: bill._id.toString() },
          user: { _id: user._id, email: user.email },
        },
        { status: () => ({ json: (data) => data }) },
        () => {}
      );

      const auditLog = await AuditLog.findOne({ operation: "pay" });
      expect(auditLog).toBeDefined();
      expect(auditLog.collection).toBe("bigbossbills");
      expect(auditLog.userId.toString()).toBe(user._id.toString());
    });
  });

  describe("POST /api/bigboss/bills/:id/unpay", () => {
    it("should reverse payment and update summary", async () => {
      await payBill(
        {
          params: { billId: bill._id.toString() },
          user: { _id: user._id, email: user.email },
        },
        { status: () => ({ json: (data) => data }) },
        () => {}
      );

      const result = await unpayBill(
        {
          params: { billId: bill._id.toString() },
          user: { _id: user._id, email: user.email },
        },
        {
          status: () => ({ json: (data) => data }),
        },
        () => {}
      );

      expect(result.success).toBe(true);
      expect(result.data.bill.isPaid).toBe(false);
      expect(result.data.bill.paidAt).toBeNull();
      expect(result.data.monthlySummary.bigBossPaid).toBe("0.00");

      const updatedBill = await BigBossBill.findById(bill._id);
      expect(updatedBill.isPaid).toBe(false);
    });

    it("should create audit log entry for unpay", async () => {
      await payBill(
        {
          params: { billId: bill._id.toString() },
          user: { _id: user._id, email: user.email },
        },
        { status: () => ({ json: (data) => data }) },
        () => {}
      );

      await unpayBill(
        {
          params: { billId: bill._id.toString() },
          user: { _id: user._id, email: user.email },
        },
        { status: () => ({ json: (data) => data }) },
        () => {}
      );

      const auditLog = await AuditLog.findOne({ operation: "unpay" });
      expect(auditLog).toBeDefined();
      expect(auditLog.collection).toBe("bigbossbills");
    });
  });

  describe("Error Cases", () => {
    it("should return 404 for non-existent bill", async () => {
      const fakeId = new mongoose.Types.ObjectId();

      await expect(
        payBill(
          {
            params: { billId: fakeId.toString() },
            user: { _id: user._id, email: user.email },
          },
          {
            status: (code) => ({
              json: (data) => {
                throw new Error(`Status ${code}: ${data.message}`);
              },
            }),
          },
          () => {}
        )
      ).rejects.toThrow("404");
    });

    it("should return 403 for bill owned by different user", async () => {
      const otherUser = await User.create({
        name: "Other User",
        email: "other@test.com",
        password: "password123",
        role: "owner",
      });

      const otherBill = await BigBossBill.create({
        bigBossId: bigBoss._id,
        ownerId: otherUser._id,
        month: 3,
        year: 2026,
        amount: 500,
        createdBy: otherUser._id,
      });

      await expect(
        payBill(
          {
            params: { billId: otherBill._id.toString() },
            user: { _id: user._id, email: user.email },
          },
          {
            status: (code) => ({
              json: (data) => {
                throw new Error(`Status ${code}: ${data.message}`);
              },
            }),
          },
          () => {}
        )
      ).rejects.toThrow("403");
    });
  });
});
