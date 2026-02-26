import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { User, Ledger, Payment, AuditLog } from "../src/models/index.js";
import { register, login } from "../src/controllers/auth.controller.js";
import { createLedger, getLedgers } from "../src/controllers/ledger.controller.js";
import { createPayment } from "../src/controllers/payment.controller.js";

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await User.deleteMany({});
  await Ledger.deleteMany({});
  await Payment.deleteMany({});
  await AuditLog.deleteMany({});
});

describe("Payment Flow Integration Tests", () => {
  let user, ledger, token;

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
    token = "test-token";

    const ledgerRes = await createLedger(
      {
        body: {
          type: "owes_me",
          counterpartyName: "Test Company",
          initialAmount: 1000,
        },
        user: { _id: user._id },
      },
      {
        status: () => ({
          json: (data) => data,
        }),
      },
      () => {}
    );

    ledger = await Ledger.findOne({ counterpartyName: "Test Company" });
  });

  describe("Idempotency", () => {
    it("should return existing payment for same idempotency key", async () => {
      const idempotencyKey = "test-idempotency-123";

      const payment1 = await createPayment(
        {
          params: { id: ledger._id.toString() },
          body: {
            amount: 500,
            type: "payment",
            idempotencyKey,
          },
          headers: {},
          user: { _id: user._id, role: "owner", email: user.email },
        },
        {
          status: () => ({
            json: (data) => data,
          }),
        },
        () => {}
      );

      const payment2 = await createPayment(
        {
          params: { id: ledger._id.toString() },
          body: {
            amount: 500,
            type: "payment",
            idempotencyKey,
          },
          headers: {},
          user: { _id: user._id, role: "owner", email: user.email },
        },
        {
          status: (code) => ({
            json: (data) => ({ statusCode: code, ...data }),
          }),
        },
        () => {}
      );

      const existingPayments = await Payment.find({ idempotencyKey });
      expect(existingPayments).toHaveLength(1);
    });

    it("should reject payment without idempotency key", async () => {
      await expect(
        createPayment(
          {
            params: { id: ledger._id.toString() },
            body: { amount: 500 },
            headers: {},
            user: { _id: user._id, role: "owner" },
          },
          {
            status: (code) => ({
              json: (data) => ({ statusCode: code, ...data }),
            }),
          },
          () => {}
        )
      ).rejects.toThrow("Idempotency-Key header or idempotencyKey in body is required");
    });
  });

  describe("Transaction Path", () => {
    it("should update ledger balance after payment", async () => {
      const initialBalance = ledger.outstandingBalance;
      const paymentAmount = 300;

      await createPayment(
        {
          params: { id: ledger._id.toString() },
          body: {
            amount: paymentAmount,
            type: "payment",
            idempotencyKey: "payment-update-balance",
          },
          headers: {},
          user: { _id: user._id, role: "owner", email: user.email },
        },
        {
          status: () => ({
            json: (data) => data,
          }),
        },
        () => {}
      );

      const updatedLedger = await Ledger.findById(ledger._id);
      expect(updatedLedger.outstandingBalance).toBe(initialBalance - paymentAmount);
    });

    it("should record payment with correct previous and new outstanding", async () => {
      await createPayment(
        {
          params: { id: ledger._id.toString() },
          body: {
            amount: 400,
            type: "payment",
            idempotencyKey: "payment-balance-records",
          },
          headers: {},
          user: { _id: user._id, role: "owner", email: user.email },
        },
        {
          status: () => ({
            json: (data) => data,
          }),
        },
        () => {}
      );

      const payment = await Payment.findOne({ idempotencyKey: "payment-balance-records" });
      expect(payment.previousOutstanding).toBe(1000);
      expect(payment.newOutstanding).toBe(600);
    });

    it("should handle refund correctly", async () => {
      await createPayment(
        {
          params: { id: ledger._id.toString() },
          body: {
            amount: 200,
            type: "refund",
            idempotencyKey: "payment-refund-test",
          },
          headers: {},
          user: { _id: user._id, role: "owner", email: user.email },
        },
        {
          status: () => ({
            json: (data) => data,
          }),
        },
        () => {}
      );

      const payment = await Payment.findOne({ idempotencyKey: "payment-refund-test" });
      expect(payment.type).toBe("refund");
      expect(payment.newOutstanding).toBe(1200);
    });
  });

  describe("Audit Trail", () => {
    it("should create audit log for payment", async () => {
      await createPayment(
        {
          params: { id: ledger._id.toString() },
          body: {
            amount: 100,
            type: "payment",
            idempotencyKey: "payment-audit-test",
          },
          headers: {},
          user: { _id: user._id, role: "owner", email: user.email },
        },
        {
          status: () => ({
            json: (data) => data,
          }),
        },
        () => {}
      );

      const auditLog = await AuditLog.findOne({ collection: "payments" });
      expect(auditLog).toBeDefined();
      expect(auditLog.operation).toBe("create");
      expect(auditLog.userId.toString()).toBe(user._id.toString());
    });
  });
});

describe("Full Happy Path", () => {
  let user, token;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Ledger.deleteMany({});
    await Payment.deleteMany({});
  });

  it("should complete full flow: register -> create ledger -> record payment -> verify balance", async () => {
    const registerRes = await register(
      {
        body: {
          name: "Full Test User",
          email: "full@test.com",
          password: "password123",
        },
        cookies: {},
        ip: "127.0.0.1",
        get: () => "test",
      },
      { status: () => ({ json: (d) => d }), cookie: () => {} },
      () => {}
    );

    user = await User.findOne({ email: "full@test.com" });
    expect(user).toBeDefined();
    expect(user.role).toBe("owner");

    const ledgerRes = await createLedger(
      {
        body: {
          type: "owes_me",
          counterpartyName: "Full Test Company",
          initialAmount: 5000,
          currency: "USD",
          priority: "high",
        },
        user: { _id: user._id, role: "owner" },
      },
      { status: () => ({ json: (d) => d }), json: (d) => d },
      () => {}
    );

    const ledger = await Ledger.findOne({ counterpartyName: "Full Test Company" });
    expect(ledger.outstandingBalance).toBe(5000);

    await createPayment(
      {
        params: { id: ledger._id.toString() },
        body: {
          amount: 1500,
          type: "payment",
          method: "bank",
          note: "First payment",
          idempotencyKey: "full-flow-payment-1",
        },
        headers: {},
        user: { _id: user._id, role: "owner", email: user.email },
      },
      { status: () => ({ json: (d) => d }) },
      () => {}
    );

    const updatedLedger = await Ledger.findById(ledger._id);
    expect(updatedLedger.outstandingBalance).toBe(3500);

    const payments = await Payment.find({ ledgerId: ledger._id });
    expect(payments).toHaveLength(1);
    expect(payments[0].recordedBy.toString()).toBe(user._id.toString());
  });
});
