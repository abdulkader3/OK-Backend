# Permissions Documentation

## Overview

This document defines the role-based access control (RBAC) system for the OK Backend API.

## Roles

| Role | Description | Can Create Staff | Can Manage Permissions | Can View All Data |
|------|-------------|------------------|----------------------|-------------------|
| **owner** | Primary account holder | Yes | Yes | Yes |
| **admin** | Manager with elevated access | Yes* | Yes* | Yes |
| **staff** | Default user with limited access | No | No | Limited |

*Admin can only manage staff, not other admins or owners.

---

## Permission Matrix

### Global Permissions

| Action | Owner | Admin | Staff (Default) | Staff (Custom) |
|--------|-------|-------|-----------------|----------------|
| **User Management** |
| Register new user | ✓ | ✗ | ✗ | ✗ |
| List all users | ✓ | ✓ | ✗ | ✗ |
| Update user permissions | ✓ | ✓* | ✗ | ✗ |
| Deactivate user | ✓ | ✓* | ✗ | ✗ |
| **Ledger Management** |
| Create ledger | ✓ | ✓ | ✗ | Configurable |
| View own ledgers | ✓ | ✓ | ✓ | ✓ |
| View all ledgers | ✓ | ✓ | ✗ | Configurable |
| Edit ledger | ✓ | ✓ | ✗ | Configurable |
| Delete ledger | ✓ | ✓ | ✗ | ✗ |
| **Payment Management** |
| Record payment | ✓ | ✓ | ✗ | Configurable |
| View payments | ✓ | ✓ | Own only | Configurable |
| **Audit & Reports** |
| View audit logs | ✓ | ✓ | ✗ | ✗ |
| View dashboard | ✓ | ✓ | Limited | Configurable |
| **File Uploads** |
| Upload receipt | ✓ | ✓ | ✗ | Configurable |

*Admin can only manage staff users, not other admins or owners.

---

## Permission Fields

Each user has a `permissions` object:

```javascript
{
  canCreateLedger: Boolean,      // Default: false
  canEditLedger: Boolean,        // Default: false
  canDeleteLedger: Boolean,       // Default: false
  canRecordPayment: Boolean,     // Default: false
  canViewAllLedgers: Boolean,    // Default: false
  canManageStaff: Boolean        // Default: false
}
```

### Default Permissions by Role

**Owner:**
```javascript
{
  canCreateLedger: true,
  canEditLedger: true,
  canDeleteLedger: true,
  canRecordPayment: true,
  canViewAllLedgers: true,
  canManageStaff: true
}
```

**Admin:**
```javascript
{
  canCreateLedger: true,
  canEditLedger: true,
  canDeleteLedger: true,
  canRecordPayment: true,
  canViewAllLedgers: true,
  canManageStaff: true
}
```

**Staff:**
```javascript
{
  canCreateLedger: false,
  canEditLedger: false,
  canDeleteLedger: false,
  canRecordPayment: false,
  canViewAllLedgers: false,
  canManageStaff: false
}
```

---

## Decision Tree

```
                    Incoming Request
                          │
                          ▼
                ┌─────────────────┐
                │ Is user active? │
                └────────┬────────┘
                    │ No │      │ Yes
                    ▼    │      ▼
              ┌──────────┐  ┌─────────────────┐
              │  Reject  │  │ Is user owner?  │
              │  403     │  └────────┬────────┘
              └──────────┘      │ No │      │ Yes
                                ▼    │      ▼
                    ┌─────────────────┐  ┌──────────┐
                    │ Check role-perm │  │ Allow    │
                    │ for action      │  │  ✓       │
                    └────────┬────────┘  └──────────┘
                         │ No │
                         ▼    │
               ┌─────────────────┐
               │ Has custom perm?│
               └────────┬────────┘
                   │ No │      │ Yes
                   ▼    ▼      ▼
             ┌────────┐  ┌──────────┐
             │ Reject │  │  Allow   │
             │  403   │  │    ✓     │
             └────────┘  └──────────┘
```

---

## Middleware Implementation

### `auth.middleware.js`

Verifies JWT token and attaches user to request:

```javascript
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user || !user.active) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};
```

### `permission.middleware.js`

Checks if user has required permission:

```javascript
const authorize = (...allowedPermissions) => {
  return (req, res, next) => {
    const user = req.user;
    
    // Owner has all permissions
    if (user.role === 'owner') {
      return next();
    }
    
    // Check each required permission
    for (const permission of allowedPermissions) {
      if (user.permissions?.[permission]) {
        return next();
      }
    }
    
    // Check admin role
    if (user.role === 'admin') {
      // Admin can do most things except manage other admins
      if (!allowedPermissions.includes('canManageStaff') || 
          allowedPermissions.includes('canManageOwners')) {
        return next();
      }
    }
    
    return res.status(403).json({
      success: false,
      message: 'Insufficient permissions',
      error: { code: 'FORBIDDEN' }
    });
  };
};
```

---

## Permission Checks by Endpoint

| Endpoint | Method | Required Permission |
|----------|--------|---------------------|
| `/api/auth/register` | POST | None (public) |
| `/api/auth/login` | POST | None (public) |
| `/api/users` | GET | `canManageStaff` (owner/admin) |
| `/api/users/:id/permissions` | PATCH | `canManageStaff` (owner only) |
| `/api/ledgers` | GET | None (own data only) |
| `/api/ledgers` | POST | `canCreateLedger` |
| `/api/ledgers/:id` | GET | Owner of ledger OR `canViewAllLedgers` |
| `/api/ledgers/:id` | PATCH | `canEditLedger` |
| `/api/ledgers/:id/payments` | POST | `canRecordPayment` |
| `/api/payments` | GET | Own payments OR `canViewAllLedgers` |
| `/api/dashboard/summary` | GET | None (own data only) |
| `/api/uploads/receipt` | POST | `canRecordPayment` or `canCreateLedger` |
| `/api/audit/:entityId` | GET | `canManageStaff` (owner/admin only) |

---

## Row-Level Security

For ledgers, staff users can only access ledgers they created or are explicitly shared with:

```javascript
const getLedgerFilter = (user) => {
  if (user.role === 'owner' || user.role === 'admin') {
    return {}; // All ledgers
  }
  
  if (user.permissions?.canViewAllLedgers) {
    return { ownerId: user._id }; // All own ledgers
  }
  
  return { createdBy: user._id }; // Only created by self
};
```

---

## Audit Trail

All permission changes are logged:

```javascript
await AuditLog.create({
  operation: 'update',
  collection: 'users',
  docId: targetUserId,
  userId: modifyingUserId,
  changes: [
    { field: 'permissions.canRecordPayment', oldValue: false, newValue: true }
  ]
});
```
