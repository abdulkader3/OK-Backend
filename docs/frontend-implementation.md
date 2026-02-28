# Frontend Implementation Guide

## Base URL

```
Development:
Production: https://ok-backend.onrender.com
```

---

## Authentication

### Register Owner/Staff
```http
POST /api/auth/register
Content-Type: application/json

Request Body:
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+1234567890",
  "company": "Acme Inc",
  "role": "owner"  // optional: "owner", "admin", "staff" (default: owner for first user)
}

Response (201 Created):
{
  "success": true,
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "owner",
      "permissions": {
        "canCreateLedger": false,
        "canEditLedger": false,
        "canDeleteLedger": false,
        "canRecordPayment": false,
        "canViewAllLedgers": false,
        "canManageStaff": false
      },
      "active": true,
      "phone": "+1234567890",
      "company": "Acme Inc",
      "createdAt": "2026-02-27T00:00:00.000Z",
      "updatedAt": "2026-02-27T00:00:00.000Z"
    },
    "tokens": {
      "access_token": "eyJhbGciOiJIUzI1NiIs...",
      "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
    }
  },
  "message": "User registered successfully"
}
```

### Login
```http
POST /api/auth/login
Content-Type: application/json

Request Body:
{
  "email": "john@example.com",
  "password": "password123"
}

Response (200 OK):
{
  "success": true,
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "owner",
      "permissions": { ... },
      "active": true
    },
    "tokens": {
      "access_token": "eyJhbGciOiJIUzI1NiIs...",
      "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
    }
  },
  "message": "Login successful"
}

Cookies Set:
- refreshToken (HttpOnly, Secure)
- accessToken (HttpOnly, Secure)
```

### Logout
```http
POST /api/auth/logout
Authorization: Bearer {access_token}

Response (200 OK):
{
  "success": true,
  "message": "Logout successful"
}
```

---

## Headers

All protected endpoints require:
```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

---

## Users

### Get All Users
```http
GET /api/users?page=1&limit=20
Authorization: Bearer {access_token}

Response (200 OK):
{
  "success": true,
  "data": {
    "users": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "owner",
        "permissions": { ... },
        "active": true,
        "phone": "+1234567890",
        "company": "Acme Inc",
        "createdAt": "2026-02-27T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "pages": 1
    }
  }
}
```

### Get User by ID
```http
GET /api/users/:id
Authorization: Bearer {access_token}

Response (200 OK):
{
  "success": true,
  "data": {
    "user": { ... }
  }
}
```

### Update User Permissions (Owner Only)
```http
PATCH /api/users/:id/permissions
Authorization: Bearer {access_token}

Request Body:
{
  "permissions": {
    "canCreateLedger": true,
    "canRecordPayment": true,
    "canViewAllLedgers": true
  }
}

Response (200 OK):
{
  "success": true,
  "data": {
    "permissions": {
      "canCreateLedger": true,
      "canEditLedger": false,
      "canDeleteLedger": false,
      "canRecordPayment": true,
      "canViewAllLedgers": true,
      "canManageStaff": false
    }
  },
  "message": "Permissions updated successfully"
}
```

---

## Ledgers

### Create Ledger
```http
POST /api/ledgers
Authorization: Bearer {access_token}

Request Body:
{
  "type": "owes_me",           // required: "owes_me" | "i_owe"
  "counterpartyName": "ABC Corp",  // required
  "counterpartyContact": "contact@abccorp.com",
  "initialAmount": 1000,        // required, >= 0
  "currency": "USD",           // default: USD
  "dueDate": "2026-03-31",
  "priority": "high",          // "low" | "medium" | "high"
  "notes": "Invoice #12345",
  "tags": ["invoice", "urgent"]
}

Response (201 Created):
{
  "success": true,
  "data": {
    "ledger": {
      "_id": "507f1f77bcf86cd799439011",
      "ownerId": "507f1f77bcf86cd799439010",
      "type": "owes_me",
      "counterpartyName": "ABC Corp",
      "counterpartyContact": "contact@abccorp.com",
      "initialAmount": 1000,
      "outstandingBalance": 1000,
      "currency": "USD",
      "dueDate": "2026-03-31T00:00:00.000Z",
      "priority": "high",
      "notes": "Invoice #12345",
      "tags": ["invoice", "urgent"],
      "attachments": [],
      "createdBy": "507f1f77bcf86cd799439010",
      "createdAt": "2026-02-27T00:00:00.000Z",
      "updatedAt": "2026-02-27T00:00:00.000Z"
    }
  },
  "message": "Ledger created successfully"
}
```

### Get All Ledgers
```http
GET /api/ledgers?page=1&limit=20&type=owes_me&priority=high&search=abc
Authorization: Bearer {access_token}

Query Parameters:
- page: number (default: 1)
- limit: number (default: 20)
- type: "owes_me" | "i_owe"
- priority: "low" | "medium" | "high"
- dueDateFrom: ISO date
- dueDateTo: ISO date
- search: string (searches counterpartyName, notes, tags)

Response (200 OK):
{
  "success": true,
  "data":gers": [
      {
    "led {
        "_id": "507f1f77bcf86cd799439011",
        "ownerId": "507f1f77bcf86cd799439010",
        "type": "owes_me",
        "counterpartyName": "ABC Corp",
        "initialAmount": 1000,
        "outstandingBalance": 500,
        "currency": "USD",
        "dueDate": "2026-03-31T00:00:00.000Z",
        "priority": "high",
        "tags": ["invoice"],
        "createdBy": {
          "_id": "507f1f77bcf86cd799439010",
          "name": "John Doe",
          "email": "john@example.com"
        },
        "createdAt": "2026-02-27T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "pages": 1
    }
  }
}
```

### Get Ledger by ID
```http
GET /api/ledgers/:id
Authorization: Bearer {access_token}

Response (200 OK):
{
  "success": true,
  "data": {
    "ledger": { ... },
    "recentPayments": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "ledgerId": "507f1f77bcf86cd799439011",
        "amount": 500,
        "type": "payment",
        "method": "bank",
        "note": "Partial payment",
        "recordedBy": {
          "_id": "507f1f77bcf86cd799439010",
          "name": "John Doe",
          "email": "john@example.com"
        },
        "recordedAt": "2026-02-27T00:00:00.000Z",
        "previousOutstanding": 1000,
        "newOutstanding": 500
      }
    ]
  }
}
```

### Update Ledger
```http
PATCH /api/ledgers/:id
Authorization: Bearer {access_token}

Request Body (all fields optional):
{
  "counterpartyName": "ABC Corp Updated",
  "counterpartyContact": "new@contact.com",
  "dueDate": "2026-04-15",
  "priority": "medium",
  "notes": "Updated notes",
  "tags": ["updated"]
}

Response (200 OK):
{
  "success": true,
  "data": {
    "ledger": { ... }
  },
  "message": "Ledger updated successfully"
}
```

### Delete Ledger
```http
DELETE /api/ledgers/:id
Authorization: Bearer {access_token}

Response (200 OK):
{
  "success": true,
  "message": "Ledger deleted successfully"
}
```

---

## Payments

### Record Payment
```http
POST /api/ledgers/:id/payments
Authorization: Bearer {access_token}
Idempotency-Key: unique-key-123  // Header (recommended) or in body

Request Body:
{
  "amount": 500,           // required, > 0
  "type": "payment",       // "payment" | "adjustment" | "refund"
  "method": "cash",        // "cash" | "bank" | "other"
  "note": "Payment for invoice",
  "receiptUrl": "https://cloudinary.com/image.jpg",  // optional
  "idempotencyKey": "unique-key-123",  // optional if header provided
  "quick": true            // optional: bypass heavy validation
}

Response (201 Created):
{
  "success": true,
  "data": {
    "payment": {
      "_id": "507f1f77bcf86cd799439012",
      "ledgerId": "507f1f77bcf86cd799439011",
      "amount": 500,
      "type": "payment",
      "method": "cash",
      "note": "Payment for invoice",
      "receiptUrl": null,
      "recordedBy": {
        "_id": "507f1f77bcf86cd799439010",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "recordedAt": "2026-02-27T00:00:00.000Z",
      "previousOutstanding": 1000,
      "newOutstanding": 500,
      "idempotencyKey": "unique-key-123",
      "offline": false,
      "syncStatus": "synced"
    }
  },
  "message": "Payment recorded successfully"
}

Idempotent Response (200 OK):
{
  "success": true,
  "data": { "payment": { ... } },
  "message": "Existing payment returned (idempotency)",
  "idempotent": true
}
```

### Get All Payments
```http
GET /api/payments?page=1&limit=20&ledgerId=xxx&recordedBy=xxx&dateFrom=2026-01-01
Authorization: Bearer {access_token}

Query Parameters:
- page: number
- limit: number
- ledgerId: string
- recordedBy: string (user ID)
- dateFrom: ISO date
- dateTo: ISO date

Response (200 OK):
{
  "success": true,
  "data": {
    "payments": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "ledgerId": {
          "_id": "507f1f77bcf86cd799439011",
          "counterpartyName": "ABC Corp",
          "type": "owes_me"
        },
        "amount": 500,
        "type": "payment",
        "method": "cash",
        "recordedBy": {
          "_id": "507f1f77bcf86cd799439010",
          "name": "John Doe",
          "email": "john@example.com"
        },
        "recordedAt": "2026-02-27T00:00:00.000Z",
        "previousOutstanding": 1000,
        "newOutstanding": 500
      }
    ],
    "pagination": { ... }
  }
}
```

### Get Payment by ID
```http
GET /api/payments/:id
Authorization: Bearer {access_token}

Response (200 OK):
{
  "success": true,
  "data": {
    "payment": { ... }
  }
}
```

---

## Dashboard

### Get Summary
```http
GET /api/dashboard/summary
Authorization: Bearer {access_token}

Response (200 OK):
{
  "success": true,
  "data": {
    "totalOwedToMe": 5000,      // Sum of all "owes_me" outstanding balances
    "totalIOwe": 2000,          // Sum of all "i_owe" outstanding balances
    "overdueCount": 3,           // Ledgers past due date with balance > 0
    "highPriorityCount": 5,      // High priority ledgers with balance > 0
    "recentLedgers": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "counterpartyName": "ABC Corp",
        "outstandingBalance": 500,
        "type": "owes_me",
        "priority": "high",
        "createdAt": "2026-02-27T00:00:00.000Z"
      }
    ],
    "dueLedgers": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "counterpartyName": "XYZ Ltd",
        "outstandingBalance": 300,
        "dueDate": "2026-02-28T00:00:00.000Z",
        "priority": "medium"
      }
    ]
  }
}
```

---

## Uploads

### Upload Receipt
```http
POST /api/uploads/receipt
Authorization: Bearer {access_token}
Content-Type: multipart/form-data

Form Data:
- file: (binary image file)

Response (201 Created):
{
  "success": true,
  "data": {
    "url": "https://res.cloudinary.com/your-cloud/image/upload/v123/ok_backend/receipts/abc.jpg",
    "publicId": "ok_backend/receipts/abc",
    "width": 1200,
    "height": 800,
    "format": "jpg",
    "bytes": 45678
  },
  "message": "File uploaded successfully"
}
```

---

## Sync

### Batch Sync (Offline Support)
```http
POST /api/sync/batch
Authorization: Bearer {access_token}
Content-Type: application/json

Request Body:
{
  "operations": [
    {
      "clientTempId": "temp-uuid-123",
      "type": "payment",
      "idempotencyKey": "unique-key-456",
      "ledgerId": "507f1f77bcf86cd799439011",
      "amount": 500,
      "method": "cash",
      "recordedAtClient": "2026-02-26T10:30:00Z",
      "offline": true
    }
  ]
}

Response (200 OK):
{
  "success": true,
  "data": {
    "results": [
      {
        "clientTempId": "temp-uuid-123",
        "success": true,
        "serverAssignedId": "507f1f77bcf86cd799439012",
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

Conflict Response:
{
  "success": true,
  "data": {
    "results": [
      {
        "clientTempId": "temp-uuid-123",
        "success": true,
        "serverAssignedId": "507f1f77bcf86cd799439012",
        "conflict": true,
        "conflictReason": "balance_divergence",
        "serverState": {
          "ledgerId": "507f1f77bcf86cd799439011",
          "previousOutstanding": 800,
          "newOutstanding": 300,
          "clientExpectedOutstanding": 500
        }
      }
    ]
  }
}
```

### Get Sync Status
```http
GET /api/sync/status?since=2026-01-01T00:00:00Z
Authorization: Bearer {access_token}

Response (200 OK):
{
  "success": true,
  "data": {
    "syncTimestamp": "2026-02-27T12:00:00.000Z",
    "changes": [
      {
        "collection": "payments",
        "docId": "507f1f77bcf86cd799439012",
        "operation": "create",
        "timestamp": "2026-02-27T10:30:00.000Z",
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
        "updatedAt": "2026-02-27T10:30:00.000Z"
      }
    ],
    "pagination": {
      "changesCount": 1,
      "ledgersCount": 1
    }
  }
}
```

---

## Audit

### Get Audit Logs
```http
GET /api/audit/:entityId?collection=ledgers&page=1&limit=20
Authorization: Bearer {access_token}

Query Parameters:
- entityId: string (required)
- collection: "users" | "ledgers" | "payments" (optional)
- page: number
- limit: number

Response (200 OK):
{
  "success": true,
  "data": {
    "logs": [
      {
        "_id": "507f1f77bcf86cd799439013",
        "operation": "create",
        "collection": "payments",
        "docId": "507f1f77bcf86cd799439012",
        "userId": {
          "_id": "507f1f77bcf86cd799439010",
          "name": "John Doe",
          "email": "john@example.com"
        },
        "timestamp": "2026-02-27T10:30:00.000Z",
        "before": null,
        "after": { ... },
        "changes": [
          {
            "field": "amount",
            "oldValue": null,
            "newValue": 500
          }
        ]
      }
    ],
    "pagination": { ... }
  }
}
```

---

## Health Check

### Get Health
```http
GET /health

Response (200 OK):
{
  "status": "ok",
  "uptime": 3600,
  "timestamp": "2026-02-27T12:00:00.000Z",
  "components": {
    "db": "ok",
    "cloudinary": "ok"
  },
  "version": "1.0.0"
}

Response (503 Degraded):
{
  "status": "degraded",
  "uptime": 3600,
  "timestamp": "2026-02-27T12:00:00.000Z",
  "components": {
    "db": "ok",
    "cloudinary": "error"
  },
  "version": "1.0.0"
}
```

---

## Metrics

### Get Metrics (Prometheus)
```http
GET /metrics

Response:
# HELP payments_created_total Total number of payments created
# TYPE payments_created_total counter
payments_created_total 150

# HELP sync_failures_total Total number of sync failures
# TYPE sync_failures_total counter
sync_failures_total 3
...
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    { "field": "email", "message": "Invalid format" }
  ],
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Error description"
  }
}
```

### Common Status Codes
- `200` - Success
- `201` - Created
- `400` - Validation Error
- `401` - Unauthorized
- `403` - Forbidden (permission denied)
- `404` - Not Found
- `409` - Conflict (duplicate)
- `500` - Server Error

---

## Demo Variables

Use these for testing:

```javascript
// Base URL
const BASE_URL = "http://localhost:4000";

// Demo User
const DEMO_USER = {
  name: "Test User",
  email: "test@example.com",
  password: "password123"
};

// Demo Token (after login)
let ACCESS_TOKEN = "";

// Demo Ledger ID
let LEDGER_ID = "";

// Demo Payment
const DEMO_PAYMENT = {
  amount: 500,
  type: "payment",
  method: "cash",
  note: "Test payment"
};

// Idempotency Key Generator
const generateIdempotencyKey = () => `idem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```
