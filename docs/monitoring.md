# Monitoring & Alerting

## Overview

This document describes the monitoring setup, metrics, and alerting thresholds for the OK Backend production environment.

---

## Health Endpoint

**GET /health**

Returns overall system health:

```json
{
  "status": "ok",
  "uptime": 3600,
  "timestamp": "2026-02-27T12:00:00Z",
  "components": {
    "db": "ok",
    "cloudinary": "ok"
  },
  "version": "1.0.0"
}
```

### Response Codes
- **200**: All components healthy
- **503**: One or more components degraded

---

## Metrics Endpoint

**GET /metrics**

Prometheus-compatible metrics:

```
payments_created_total 150
sync_failures_total 3
failed_auth_total 12
db_transaction_errors_total 0
http_requests_total 5000
```

---

## Alerting Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| `sync_failures_total` | > 2 in 5 min | > 5 in 5 min | Page on-call |
| `db_transaction_errors_total` | > 1 in 5 min | > 3 in 5 min | Page on-call |
| `failed_auth_total` | > 10 in 5 min | > 20 in 5 min | Investigate |
| Health check | - | Any component "error" | Page on-call |
| Response time | > 2s p95 | > 5s p95 | Investigate |

---

## Log Monitoring

### Key Log Patterns to Watch

```
ERROR: MongoDB connection error
WARN: Payment idempotency conflict
ERROR: Transaction failed
WARN: Rate limit exceeded
```

### Log Aggregation

- Development: Console output (pino-pretty)
- Production: JSON logs to stdout (Pino)

---

## Dashboards

### Recommended Grafana Panels

1. **Request Rate** - HTTP requests per second
2. **Error Rate** - 4xx and 5xx responses
3. **Response Time** - p50, p95, p99
4. **Payment Volume** - payments created per minute
5. **Sync Failures** - failed sync operations
6. **Active Users** - unique users in last hour

---

## On-Call

### Escalation

1. **P1**: Health check failing, payment processing down → Page immediately
2. **P2**: Sync failures > threshold, high error rate → Respond within 15 min
3. **P3**: Performance degradation, metrics anomalies → Respond within 1 hour

### Runbooks

**High Sync Failures**
1. Check `/health` for DB status
2. Review recent logs for errors
3. Check MongoDB Atlas dashboard
4. If DB issue, escalate to database team

**Payment Processing Down**
1. Check payment endpoint logs
2. Verify idempotency keys not blocked
3. Check for rate limiting
4. Review recent deployments
