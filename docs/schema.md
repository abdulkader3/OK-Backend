# Database Schema Documentation

## Overview

This document describes the data Backend expense model for the OK tracking system. The system uses MongoDB with Mongoose ODM.

## Collections

---

## 1. Users Collection

### Schema

```javascript
{
  _id: ObjectId,
  name: String,              // Required, 2-50 chars
  email: String,             // Required, unique, indexed, lowercase
  passwordHash: String,      // Required, bcrypt hash
  role: String,              // Enum: ['owner', 'admin', 'staff'], default: 'staff'
  permissions: {
    canCreateLedger: Boolean,
    canEditLedger: Boolean,
    canDeleteLedger: Boolean,
    canRecordPayment: Boolean,
    canViewAllLedgers: Boolean,
    canManageStaff: Boolean
  },
  active: Boolean,           // Default: true
  phone: String,            // Optional
  company: String,          // Optional
  refreshToken: String,     // For JWT refresh
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index Name | Fields | Unique | Notes |
|------------|--------|--------|-------|
| idx_users_email | email | true | Case-insensitive |
| idx_users_role | role | false | For role-based queries |
| idx_users_active | active | false | For soft-delete queries |

---

## 2. Ledgers Collection

Two ledger types per owner: `owes_me` (money owed to owner) and `i_owe` (money owner owes).

### Schema

```javascript
{
  _id: ObjectId,
  ownerId: ObjectId,        // Ref: User, required, indexed
  type: String,             // Enum: ['owes_me', 'i_owe'], required
  counterpartyName: String,  // Required, 2-100 chars
  counterpartyContact: String, // Optional (phone/email)
  initialAmount: Number,     // Required, decimal, >= 0
  outstandingBalance: Number, // Required, decimal, >= 0
  currency: String,          // Default: 'USD'
  dueDate: Date,            // Optional, indexed
  priority: String,         // Enum: ['low', 'medium', 'high'], default: 'medium'
  notes: String,            // Optional, max 2000 chars
  attachments: [{
    url: String,
    uploadedAt: Date,
    uploadedBy: ObjectId
  }],
  tags: [String],           // Array of strings, indexed
  createdBy: ObjectId,      // Ref: User, required
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index Name | Fields | Unique | Notes |
|------------|--------|--------|-------|
| idx_ledgers_owner | ownerId | false | For owner's ledgers |
| idx_ledgers_type | type | false | Filter by ledger type |
| idx_ledgers_dueDate | dueDate | false | For overdue queries |
| idx_ledgers_priority | priority | false | For priority filtering |
| idx_ledgers_counterparty | counterpartyName | false | Text index for search |
| idx_ledgers_owner_type | ownerId, type | false | Compound for filtered queries |
| idx_ledgers_owner_due | ownerId, dueDate | false | Compound for overdue by owner |
| idx_ledgers_tags | tags | false | For tag-based filtering |

---

## 3. Payments Collection (Ledger Entries)

### Schema

```javascript
{
  _id: ObjectId,
  ledgerId: ObjectId,       // Ref: Ledger, required, indexed
  amount: Number,            // Required, decimal, > 0
  type: String,              // Enum: ['payment', 'adjustment', 'refund']
  method: String,            // Enum: ['cash', 'bank', 'other']
  note: String,              // Optional
  receiptUrl: String,        // Optional, Cloudinary URL
  recordedBy: ObjectId,      // Ref: User, required, indexed
  recordedAt: Date,          // Required, indexed
  previousOutstanding: Number, // Snapshot before payment
  newOutstanding: Number,    // Snapshot after payment
  idempotencyKey: String,   // For duplicate detection, indexed
  offline: Boolean,          // Default: false
  syncStatus: String,       // Enum: ['pending', 'synced', 'failed'], default: 'synced'
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index Name | Fields | Unique | Notes |
|------------|--------|--------|-------|
| idx_payments_ledger | ledgerId | false | For ledger's payments |
| idx_payments_recordedBy | recordedBy | false | Staff audit trail |
| idx_payments_recordedAt | recordedAt | false | Date range queries |
| idx_payments_idempotency | idempotencyKey | false | Duplicate prevention |
| idx_payments_ledger_date | ledgerId, recordedAt | false | Recent payments per ledger |

---

## 4. AuditLogs Collection

Generic audit trail for all changes.

### Schema

```javascript
{
  _id: ObjectId,
  operation: String,         // Enum: ['create', 'update', 'delete', 'login', 'logout']
  collection: String,        // Name of collection (e.g., 'users', 'ledgers', 'payments')
  docId: Mixed,              // Reference to document (ObjectId or string like Cloudinary public_id)
  userId: ObjectId,        // Ref: User who performed action
  userEmail: String,        // Snapshot of user email for historical accuracy
  timestamp: Date,           // When action occurred, indexed
  ipAddress: String,        // Client IP
  userAgent: String,        // Client user agent
  before: Object,           // Document state before change
  after: Object,            // Document state after change
  changes: [{
    field: String,
    oldValue: Mixed,
    newValue: Mixed
  }],
  metadata: Object          // Additional context (e.g., payment amount for payment records)
}
```

### Indexes

| Index Name | Fields | Unique | Notes |
|------------|--------|--------|-------|
| idx_audit_doc | collection, docId | false | Audit trail per document |
| idx_audit_user | userId, timestamp | false | User's activity |
| idx_audit_timestamp | timestamp | false | Time-based queries |

---

## 5. Permissions Collection (Optional)

Dynamic permission mapping per staff member.

### Schema

```javascript
{
  _id: ObjectId,
  userId: ObjectId,         // Ref: User, unique
  ledgerPermissions: [{
    ledgerId: ObjectId,
    canEdit: Boolean,
    canRecordPayment: Boolean,
    canDelete: Boolean
  }],
  globalPermissions: {
    canCreateLedger: Boolean,
    canViewAllLedgers: Boolean,
    canRecordPayment: Boolean,
    canManageStaff: Boolean
  },
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

---

## Atomicity & Concurrency Rules

### Payment Recording Sequence

1. **Validate Idempotency Key**
   - Check if payment with same `idempotencyKey` exists
   - If exists, return existing payment (supports retries/offline)

2. **Start MongoDB Transaction**
   ```javascript
   const session = await mongoose.startSession();
   await session.withTransaction(async () => { ... });
   ```

3. **Lock Ledger Row**
   ```javascript
   const ledger = await Ledger.findById(ledgerId).session(session);
   ```

4. **Insert Payment Document**
   ```javascript
   const payment = await Payment.create([{
     ledgerId,
     amount,
     type,
     method,
     note,
     recordedBy: userId,
     recordedAt: new Date(),
     previousOutstanding: ledger.outstandingBalance,
     newOutstanding: ledger.outstandingBalance - amount,
     idempotencyKey,
     offline: false,
     syncStatus: 'synced'
   }], { session });
   ```

5. **Update Ledger Balance**
   ```javascript
   await Ledger.findByIdAndUpdate(ledgerId, {
     $inc: { outstandingBalance: -amount }
   }, { session });
   ```

6. **Create Audit Log**
   ```javascript
   await AuditLog.create([{
     operation: 'create',
     collection: 'payments',
     docId: payment._id,
     userId,
     timestamp: new Date(),
     before: null,
     after: payment.toObject(),
     metadata: { ledgerId, amount }
   }], { session });
   ```

7. **Commit Transaction**

### Fallback: Optimistic Concurrency

If MongoDB transactions are unavailable (e.g., MongoDB Atlas Free Tier), use:

```javascript
const MAX_RETRIES = 3;
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  const ledger = await Ledger.findById(ledgerId);
  const newOutstanding = ledger.outstandingBalance - amount;
  
  const updated = await Ledger.findOneAndUpdate(
    { _id: ledgerId, outstandingBalance: ledger.outstandingBalance },
    { $set: { outstandingBalance: newOutstanding } },
    { new: true }
  );
  
  if (updated) break; // Success
  // Retry if version changed
}
```

---

## API Response Envelope

All API responses follow this structure:

### Success
```javascript
{
  success: true,
  data: { ... },      // Response payload
  message: "..."      // Optional success message
}
```

### Error
```javascript
{
  success: false,
  message: "Error description",
  errors: [           // Optional validation errors
    { field: "email", message: "Invalid format" }
  ],
  error: {            // Optional programmatic error code
    code: "VALIDATION_ERROR",
    message: "..."
  }
}
```

### Common HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | Success (GET, PATCH) |
| 201 | Created (POST) |
| 400 | Validation error |
| 401 | Unauthorized |
| 403 | Forbidden (permission denied) |
| 404 | Not found |
| 409 | Conflict (duplicate) |
| 429 | Rate limited |
| 500 | Server error |
