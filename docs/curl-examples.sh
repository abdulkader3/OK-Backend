# OK Backend API - curl Examples
# Base URL: http://localhost:4000
# Replace <token> with your JWT token

# ============================================
# 1. CREATE PRODUCT
# ============================================
curl -X POST http://localhost:4000/api/products \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lux Soap",
    "price": 80,
    "imageUrl": null,
    "clientTempId": "local-uuid-123"
  }'

# Response:
# {
#   "success": true,
#   "data": {
#     "product": {
#       "_id": "507f1f77bcf86cd799439011",
#       "name": "Lux Soap",
#       "price": 80,
#       "syncStatus": "synced"
#     }
#   }
# }


# ============================================
# 2. UPLOAD IMAGE
# ============================================
curl -X POST http://localhost:4000/api/uploads/receipt \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/image.jpg"

# Response:
# {
#   "success": true,
#   "data": {
#     "url": "https://res.cloudinary.com/xxx/image/upload/v123/abc123.jpg",
#     "publicId": "abc123"
#   }
# }


# ============================================
# 3. CREATE SALE WITH LEDGER
# ============================================
curl -X POST http://localhost:4000/api/sales \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "totalAmount": 280,
    "items": [
      {"name": "Lux Soap", "price": 80, "quantity": 2, "subtotal": 160},
      {"name": "Shampoo", "price": 120, "quantity": 1, "subtotal": 120}
    ],
    "ledgerId": "507f1f77bcf86cd799439099",
    "clientTempId": "local-sale-456",
    "idempotencyKey": "idem-sale-456",
    "recordedAtClient": "2026-03-16T09:30:00Z"
  }'

# Response:
# {
#   "success": true,
#   "data": {
#     "sale": {
#       "_id": "507f1f77bcf86cd799439100",
#       "totalAmount": 280,
#       "ledgerDebtCreated": true,
#       "ledgerDebtId": "507f1f77bcf86cd799439200"
#     },
#     "ledgerDebtCreated": true
#   }
# }


# ============================================
# 4. SYNC BATCH OPERATIONS
# ============================================
curl -X POST http://localhost:4000/api/sync/batch \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "type": "product",
        "clientTempId": "local-prod-1",
        "idempotencyKey": "idem-prod-1",
        "name": "Toothpaste",
        "price": 50
      },
      {
        "type": "product",
        "clientTempId": "local-prod-2", 
        "idempotencyKey": "idem-prod-2",
        "name": "Shampoo",
        "price": 120
      },
      {
        "type": "sale",
        "clientTempId": "local-sale-1",
        "idempotencyKey": "idem-sale-1",
        "totalAmount": 150,
        "items": [
          {"name": "Soap", "price": 50, "quantity": 2, "subtotal": 100},
          {"name": "Toothpaste", "price": 50, "quantity": 1, "subtotal": 50}
        ],
        "ledgerId": "507f1f77bcf86cd799439099",
        "recordedAtClient": "2026-03-16T09:30:00Z"
      }
    ]
  }'

# Response (with full mapping):
# {
#   "success": true,
#   "data": {
#     "results": [
#       {
#         "clientTempId": "local-prod-1",
#         "idempotencyKey": "idem-prod-1",
#         "success": true,
#         "serverAssignedId": "507f1f77bcf86cd799439101"
#       },
#       {
#         "clientTempId": "local-prod-2",
#         "idempotencyKey": "idem-prod-2", 
#         "success": true,
#         "serverAssignedId": "507f1f77bcf86cd799439102"
#       },
#       {
#         "clientTempId": "local-sale-1",
#         "idempotencyKey": "idem-sale-1",
#         "success": true,
#         "serverAssignedId": "507f1f77bcf86cd799439103",
#         "ledgerDebtCreated": true,
#         "ledgerTxnId": "507f1f77bcf86cd799439200"
#       }
#     ],
#     "processed": 3,
#     "failed": 0
#   }
# }


# ============================================
# 5. IDEMPOTENT SYNC (duplicate idempotencyKey)
# ============================================
curl -X POST http://localhost:4000/api/sync/batch \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "type": "product",
        "clientTempId": "local-prod-1",
        "idempotencyKey": "idem-prod-1",
        "name": "Toothpaste",
        "price": 50
      }
    ]
  }'

# Idempotent Response (HTTP 200 - same as success):
# {
#   "success": true,
#   "data": {
#     "results": [
#       {
#         "clientTempId": "local-prod-1",
#         "idempotencyKey": "idem-prod-1",
#         "success": true,
#         "serverAssignedId": "507f1f77bcf86cd799439101",
#         "idempotent": true
#       }
#     ],
#     "processed": 1,
#     "failed": 0
#   }
# }


# ============================================
# 6. INCREMENTAL FETCH
# ============================================

# Get products updated since a timestamp
curl -X GET "http://localhost:4000/api/products?since=2026-03-15T00:00:00Z" \
  -H "Authorization: Bearer <token>"

# Get sales updated since a timestamp  
curl -X GET "http://localhost:4000/api/sales?since=2026-03-15T00:00:00Z" \
  -H "Authorization: Bearer <token>"


# ============================================
# 7. LEDGER DELETE
# ============================================

# Delete ledger (will fail if payments exist)
curl -X DELETE "http://localhost:4000/api/ledgers/507f1f77bcf86cd799439099" \
  -H "Authorization: Bearer <token>"

# Response if payments exist (400):
# {
#   "success": false,
#   "message": "Cannot delete ledger with 3 existing payment(s). Use ?force=true to delete anyway."
# }

# Delete ledger with force (cascade deletes payments)
curl -X DELETE "http://localhost:4000/api/ledgers/507f1f77bcf86cd799439099?force=true" \
  -H "Authorization: Bearer <token>"

# Response (200):
# {
#   "success": true,
#   "message": "Ledger deleted successfully along with 3 payment(s)"
# }


# ============================================
# ADDITIONAL USEFUL COMMANDS
# ============================================

# List products (paginated)
curl -X GET "http://localhost:4000/api/products?page=1&limit=50" \
  -H "Authorization: Bearer <token>"

# List sales (paginated)
curl -X GET "http://localhost:4000/api/sales?page=1&limit=50" \
  -H "Authorization: Bearer <token>"

# List ledgers
curl -X GET "http://localhost:4000/api/ledgers?page=1&limit=20" \
  -H "Authorization: Bearer <token>"

# Get sync status
curl -X GET "http://localhost:4000/api/sync/status?since=2026-03-01T00:00:00Z" \
  -H "Authorization: Bearer <token>"


# ============================================
# ERROR EXAMPLES
# ============================================

# Validation Error (422)
# {
#   "success": false,
#   "message": "Validation failed",
#   "errors": [
#     {"field": "name", "message": "Product name is required"}
#   ]
# }

# Conflict Error (409)
# {
#   "success": false,
#   "message": "Ledger balance diverged",
#   "conflictType": "balance_divergence",
#   "serverState": {
#     "ledgerId": "...",
#     "previousOutstanding": 800,
#     "newOutstanding": 300,
#     "clientExpectedOutstanding": 500
#   }
# }
