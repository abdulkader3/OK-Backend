# Offline Sync Protocol

## Overview

This document describes the offline/quick-entry sync protocol for the OK Backend API. It enables mobile clients to queue payments offline and sync them when connectivity is restored.

## Use Cases

1. **Offline Payment Recording**: Record payments when device is offline
2. **Quick-Entry**: Fast payment entry bypassing heavy validation
3. **Conflict Resolution**: Handle cases where server state diverges from client state

---

## Sync API Endpoints

### POST /api/sync/batch

Process a batch of queued operations from offline clients.

#### Request

```http
POST /api/sync/batch
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "operations": [
    {
      "clientTempId": "temp-uuid-123",
      "type": "payment",
      "idempotencyKey": "unique-key-456",
      "ledgerId": "507f1f77bcf86cd799439011",
      "amount": 500,
      "type": "payment",
      "method": "cash",
      "note": "Quick payment",
      "recordedAtClient": "2026-02-26T10:30:00Z",
      "offline": true
    }
  ]
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "clientTempId": "temp-uuid-123",
        "success": true,
        "serverAssignedId": "507f1f77bcf86cd799439022",
        "conflict": false,
        "serverState": {
          "ledgerId": "507f1f77bcf86cd799439011",
          "previousOutstanding": 1000,
          "newOutstanding": 500
        }
      }
    ],
    "processed": 1,
    "failed": 0
  }
}
```

---

### GET /api/sync/status

Get changes since a specific timestamp for reconciliation.

#### Request

```http
GET /api/sync/status?since=2026-02-26T10:00:00Z
Authorization: Bearer <access_token>
```

#### Response

```json
{
  "success": true,
  "data": {
    "syncTimestamp": "2026-02-26T12:00:00Z",
    "changes": [
      {
        "collection": "payments",
        "docId": "507f1f77bcf86cd799439022",
        "operation": "create",
        "timestamp": "2026-02-26T10:30:05Z",
        "data": {
          "ledgerId": "507f1f77bcf86cd799439011",
          "amount": 500,
          "previousOutstanding": 1000,
          "newOutstanding": 500,
          "offline": true,
          "clientTempId": "temp-uuid-123"
        }
      }
    ],
    "ledgersUpdated": [
      {
        "docId": "507f1f77bcf86cd799439011",
        "outstandingBalance": 500,
        "updatedAt": "2026-02-26T10:30:05Z"
      }
    ]
  }
}
```

---

## Request Fields

### Operation Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clientTempId` | string | Yes | Client's temporary ID for mapping results |
| `type` | string | Yes | Operation type: `payment`, `ledger` |
| `idempotencyKey` | string | Yes | Unique key to prevent duplicates |
| `ledgerId` | string | For payment | Target ledger ID |
| `amount` | number | For payment | Payment amount |
| `recordedAtClient` | ISO8601 | No | Client timestamp |
| `offline` | boolean | No | Mark as offline sync |

---

## Conflict Resolution

### Scenario

Client submits a payment with `idempotencyKey` that doesn't exist, but the ledger's outstanding balance has changed since the client was offline.

### Server Behavior

1. **Validate Idempotency**: If `idempotencyKey` exists, return existing payment
2. **Calculate New Balance**: Server computes `newOutstanding` based on current ledger state
3. **Return Conflict Flag**: If client's expected balance differs from server's computed balance

### Example Conflict Response

```json
{
  "clientTempId": "temp-uuid-123",
  "success": true,
  "serverAssignedId": "507f1f77bcf86cd799439022",
  "conflict": true,
  "conflictReason": "balance_divergence",
  "serverState": {
    "ledgerId": "507f1f77bcf86cd799439011",
    "previousOutstanding": 800,
    "newOutstanding": 300,
    "clientExpectedOutstanding": 500
  },
  "message": "Balance updated based on current server state"
}
```

### Client Resolution

Client should:
1. Accept server's computed `newOutstanding` as authoritative
2. Update local ledger balance to match server
3. Mark operation as synced

---

## Idempotency

### Requirements

- Every payment MUST include `idempotencyKey`
- Can be passed in header `Idempotency-Key` or in body
- Key is stored with payment record

### Duplicate Handling

1. If key exists and payment exists → return existing payment (200)
2. If key exists but differs from request → return 409 Conflict

---

## Offline Metadata

Each payment stores:

| Field | Type | Description |
|-------|------|-------------|
| `offline` | boolean | True if submitted via offline sync |
| `clientTempId` | string | Client's temporary ID |
| `recordedAtClient` | Date | Client's timestamp |
| `recordedAtServer` | Date | Server's timestamp |
| `syncStatus` | string | `synced`, `pending`, `failed` |

---

## Quick Entry Mode

For fast payment entry, use `quick: true` in request:

```json
{
  "quick": true,
  "idempotencyKey": "unique-key",
  "ledgerId": "...",
  "amount": 100
}
```

Quick mode:
- Skips optional validation (notes not required)
- Still performs idempotency check
- Creates audit log entry
- Returns full payment object

---

## Receipt Upload During Offline

1. Client captures receipt image offline
2. Stores locally with pending operation
3. When syncing, includes `receiptUrl` from local storage
4. Or uploads receipt when back online, then updates payment with Cloudinary URL

---

## Example Sync Flow

### 1. Client Offline (Payment Recorded)

```javascript
// Local device
const payment = {
  clientTempId: "temp-123",
  idempotencyKey: "idem-123",
  ledgerId: "ledger-456",
  amount: 500,
  offline: true,
  recordedAtClient: new Date().toISOString()
};
// Save to local DB
```

### 2. Back Online - Sync Batch

```javascript
// POST /api/sync/batch
{
  "operations": [{
    ...payment,
    "offline": true
  }]
}
```

### 3. Server Response

```json
{
  "success": true,
  "data": {
    "results": [{
      "clientTempId": "temp-123",
      "success": true,
      "serverAssignedId": "server-payment-789",
      "conflict": false
    }]
  }
}
```

### 4. Client Reconciliation

```javascript
// Update local mapping
localDb.updateMapping("temp-123", "server-payment-789");
```

---

## Error Handling

| Status Code | Description |
|------------|-------------|
| 200 | Success |
| 400 | Invalid request format |
| 401 | Unauthorized |
| 409 | Idempotency conflict |
| 500 | Server error (partial batch may have succeeded) |

### Partial Batch Failure

If some operations succeed and others fail:

```json
{
  "success": false,
  "data": {
    "results": [
      { "clientTempId": "1", "success": true, "serverAssignedId": "..." },
      { "clientTempId": "2", "success": false, "error": "Ledger not found" }
    ],
    "processed": 1,
    "failed": 1
  },
  "message": "Partial batch failure"
}
```
