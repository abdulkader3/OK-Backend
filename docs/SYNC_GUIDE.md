# OK Backend API - Sync & Integration Guide

## Overview

This document describes the sync contract, idempotency semantics, and integration requirements for the OK Backend API.

---

## 1. Batch Sync Response Mapping

### Per-Operation Result Fields

Every operation in `/api/sync/batch` returns:

| Field               | Type     | Description                          |
| ------------------- | -------- | ------------------------------------ |
| `clientTempId`      | string   | Echo of client's temp ID             |
| `idempotencyKey`    | string   | Echo of client's idempotency key     |
| `success`           | boolean  | Whether operation succeeded          |
| `serverAssignedId`  | string?  | MongoDB `_id` of created resource    |
| `idempotent`        | boolean? | True if operation was duplicate      |
| `ledgerDebtCreated` | boolean? | True for sale with ledger debt       |
| `ledgerTxnId`       | string?  | Payment `_id` for ledger transaction |
| `error`             | string?  | Error message when success=false     |

### Example Response

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "clientTempId": "local-prod-1",
        "idempotencyKey": "idem-prod-1",
        "success": true,
        "serverAssignedId": "507f1f77bcf86cd799439011"
      },
      {
        "clientTempId": "local-sale-1",
        "idempotencyKey": "idem-sale-1",
        "success": true,
        "serverAssignedId": "507f1f77bcf86cd799439100",
        "ledgerDebtCreated": true,
        "ledgerTxnId": "507f1f77bcf86cd799439200"
      }
    ],
    "processed": 2,
    "failed": 0
  }
}
```

---

## 2. Idempotency Semantics

### Behavior

- **Same idempotencyKey**: Server returns HTTP 200 with `idempotent: true` and the existing resource's `serverAssignedId`. No duplicate is created.
- **Different idempotencyKey**: Creates new resource with new `_id`.
- **No idempotencyKey**: Creates new resource (not recommended for sync).

### Client Implementation

```javascript
// After sync response
for (const result of results) {
  if (result.success && !result.idempotent) {
    // New resource created - update local ID mapping
    updateLocalRecord(result.clientTempId, result.serverAssignedId, "synced");
  } else if (result.idempotent) {
    // Already exists - update local ID mapping
    updateLocalRecord(result.clientTempId, result.serverAssignedId, "synced");
  } else if (!result.success) {
    // Failed - keep as 'failed' or retry later
    updateLocalRecord(result.clientTempId, null, "failed");
  }
}
```

---

## 3. Incremental Fetch

### Supported Parameters

| Endpoint          | Parameter | Description                                        |
| ----------------- | --------- | -------------------------------------------------- |
| GET /api/products | `since`   | ISO8601 timestamp - returns products updated since |
| GET /api/sales    | `since`   | ISO8601 timestamp - returns sales updated since    |

### Example

```
GET /api/products?since=2026-03-15T00:00:00Z
GET /api/sales?since=2026-03-15T00:00:00Z
```

### Recommended Sync Flow

1. **On app start**: Fetch all with `?since=<lastSyncTimestamp>`
2. **After offline sync**: Run batch sync, then fetch with `?since=<currentTimestamp>`
3. **Merge logic**: Use `clientTempId` or `idempotencyKey` to match local records with server records

---

## 4. Upload Contract

### Endpoint

- **POST** `/api/uploads/receipt`
- **Content-Type**: `multipart/form-data`
- **Field**: `file`

### Request

```bash
curl -X POST http://localhost:4000/api/uploads/receipt \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/image.jpg"
```

### Response

```json
{
  "success": true,
  "data": {
    "url": "https://res.cloudinary.com/xxx/image/upload/v123/abc123.jpg",
    "publicId": "abc123"
  }
}
```

### Constraints

- **Max size**: 5MB
- **Allowed types**: image/\* only
- **Note**: Binary images cannot be included in sync batch. Upload first, then include `imageUrl` in product create operation.

---

## 5. Error Shapes

### Validation Error (422)

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "name", "message": "Product name is required" }]
}
```

### Conflict Error (409)

```json
{
  "success": false,
  "message": "Ledger balance diverged",
  "conflictType": "balance_divergence",
  "serverState": {
    "ledgerId": "...",
    "previousOutstanding": 800,
    "newOutstanding": 300,
    "clientExpectedOutstanding": 500
  }
}
```

### Not Found (404)

```json
{
  "success": false,
  "message": "Ledger not found"
}
```

---

## 6. Atomic Sale + Ledger Behavior

When a sale includes `ledgerId`:

1. **Single DB transaction**: Sale + Payment created atomically
2. **Response includes**:
   - `serverAssignedId`: Sale ID
   - `ledgerDebtCreated`: true
   - `ledgerTxnId`: Payment/transaction ID

### If sale has debt and is deleted:

- Delete fails with 400: "Cannot delete a sale that has an associated ledger debt. Reverse the ledger entry first."

---

## 7. Limits & Constraints

| Item             | Limit               |
| ---------------- | ------------------- |
| Batch operations | max 100 per request |
| File upload      | 5MB max             |
| File types       | image/\* only       |
| Product name     | max 200 chars       |
| Product price    | min 0               |

---

## 8. clientTempId Echo

When products or sales are fetched via GET, the `clientTempId` (if provided during create) is included in responses for easy reconciliation.

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Lux Soap",
  "price": 80,
  "clientTempId": "local-uuid-123",
  "syncStatus": "synced"
}
```

---

## 9. Getting a Test Token

### Option 1: Register new user

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

### Option 2: Login (if user exists)

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

The response includes JWT tokens in cookies. For API testing, extract the `accessToken` from cookies.

---

## Files

- `openapi.json` - Full OpenAPI 3.0 specification
- `curl-examples.sh` - Ready-to-use curl commands
- `sync-mapping-examples.json` - Frontend sync mapping examples
- `sample-data.json` - Seed data for development
