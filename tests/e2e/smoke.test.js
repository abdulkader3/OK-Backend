#!/usr/bin/env node

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:4000";
const TEST_TIMEOUT = 30000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async (method, path, body = null, token = null) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${BASE_URL}${path}`, options);
  const data = await response.json();

  return { status: response.status, data };
};

async function runSmokeTests() {
  console.log("Starting E2E Smoke Tests...");
  console.log(`Target: ${BASE_URL}\n`);

  let token;
  let userId;
  let ledgerId;
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    console.log("1. Testing health endpoint...");
    const healthRes = await request("GET", "/health");
    if (healthRes.status === 200 && healthRes.data.status === "ok") {
      console.log("   ✓ Health check passed");
      testsPassed++;
    } else {
      console.log("   ✗ Health check failed");
      testsFailed++;
      process.exit(1);
    }

    console.log("\n2. Registering test user...");
    const registerRes = await request("POST", "/api/auth/register", {
      name: "E2E Test User",
      email: `e2e-${Date.now()}@test.com`,
      password: "testpass123",
    });

    if (registerRes.status === 201) {
      token = registerRes.data.data.tokens.access_token;
      userId = registerRes.data.data.user._id;
      console.log("   ✓ User registered");
      testsPassed++;
    } else {
      console.log("   ✗ Registration failed:", registerRes.data.message);
      testsFailed++;
      throw new Error("Registration failed");
    }

    console.log("\n3. Creating ledger...");
    const ledgerRes = await request(
      "POST",
      "/api/ledgers",
      {
        type: "owes_me",
        counterpartyName: "E2E Test Company",
        initialAmount: 10000,
        currency: "USD",
        priority: "high",
      },
      token
    );

    if (ledgerRes.status === 201) {
      ledgerId = ledgerRes.data.data.ledger._id;
      console.log("   ✓ Ledger created with initial balance:", ledgerRes.data.data.ledger.outstandingBalance);
      testsPassed++;
    } else {
      console.log("   ✗ Ledger creation failed");
      testsFailed++;
      throw new Error("Ledger creation failed");
    }

    console.log("\n4. Recording payment...");
    const idempotencyKey = `e2e-test-${Date.now()}`;
    const paymentRes = await request(
      "POST",
      `/api/ledgers/${ledgerId}/payments`,
      {
        amount: 3000,
        type: "payment",
        method: "bank",
        note: "E2E test payment",
        idempotencyKey,
      },
      token
    );

    if (paymentRes.status === 201) {
      console.log("   ✓ Payment recorded");
      console.log("   - Previous outstanding:", paymentRes.data.data.payment.previousOutstanding);
      console.log("   - New outstanding:", paymentRes.data.data.payment.newOutstanding);
      testsPassed++;
    } else {
      console.log("   ✗ Payment recording failed:", paymentRes.data.message);
      testsFailed++;
      throw new Error("Payment recording failed");
    }

    console.log("\n5. Testing idempotency (duplicate request)...");
    const duplicateRes = await request(
      "POST",
      `/api/ledgers/${ledgerId}/payments`,
      {
        amount: 9999,
        type: "payment",
        idempotencyKey,
      },
      token
    );

    if (duplicateRes.status === 200 && duplicateRes.data.idempotent) {
      console.log("   ✓ Idempotency working - got same payment");
      testsPassed++;
    } else {
      console.log("   ✗ Idempotency failed");
      testsFailed++;
    }

    console.log("\n6. Verifying ledger balance...");
    const ledgerDetailRes = await request("GET", `/api/ledgers/${ledgerId}`, token);

    if (ledgerDetailRes.status === 200) {
      const expectedBalance = 7000;
      const actualBalance = ledgerDetailRes.data.data.ledger.outstandingBalance;
      if (actualBalance === expectedBalance) {
        console.log(`   ✓ Balance correctly updated to: ${actualBalance}`);
        testsPassed++;
      } else {
        console.log(`   ✗ Balance mismatch! Expected: ${expectedBalance}, Got: ${actualBalance}`);
        testsFailed++;
      }
    } else {
      console.log("   ✗ Failed to get ledger details");
      testsFailed++;
    }

    console.log("\n7. Testing dashboard summary...");
    const dashboardRes = await request("GET", "/api/dashboard/summary", token);

    if (dashboardRes.status === 200) {
      const { totalOwedToMe, highPriorityCount } = dashboardRes.data.data;
      console.log("   ✓ Dashboard working");
      console.log(`   - Total owed to me: ${totalOwedToMe}`);
      console.log(`   - High priority count: ${highPriorityCount}`);
      testsPassed++;
    } else {
      console.log("   ✗ Dashboard failed");
      testsFailed++;
    }

    console.log("\n8. Testing sync/status endpoint...");
    const syncRes = await request("GET", "/api/sync/status?since=2020-01-01T00:00:00Z", token);

    if (syncRes.status === 200) {
      console.log("   ✓ Sync status working");
      console.log(`   - Changes count: ${syncRes.data.data.changes.length}`);
      testsPassed++;
    } else {
      console.log("   ✗ Sync status failed");
      testsFailed++;
    }

    console.log("\n" + "=".repeat(50));
    console.log(`SMOKE TESTS COMPLETE`);
    console.log(`Passed: ${testsPassed}`);
    console.log(`Failed: ${testsFailed}`);
    console.log("=".repeat(50));

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("\n✗ Test execution error:", error.message);
    process.exit(1);
  }
}

runSmokeTests();
