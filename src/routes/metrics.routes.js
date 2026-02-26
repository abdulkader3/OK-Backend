import { Router } from "express";

const router = Router();

const metrics = {
  payments_created_total: 0,
  sync_failures_total: 0,
  failed_auth_total: 0,
  db_transaction_errors_total: 0,
  http_requests_total: 0,
};

export const incrementMetric = (metricName, value = 1) => {
  if (metrics[metricName] !== undefined) {
    metrics[metricName] += value;
  }
};

export const getMetrics = () => metrics;

router.get("/", (req, res) => {
  metrics.http_requests_total++;
  
  res.set("Content-Type", "text/plain");
  res.send(`# HELP payments_created_total Total number of payments created
# TYPE payments_created_total counter
payments_created_total ${metrics.payments_created_total}

# HELP sync_failures_total Total number of sync failures
# TYPE sync_failures_total counter
sync_failures_total ${metrics.sync_failures_total}

# HELP failed_auth_total Total number of failed authentication attempts
# TYPE failed_auth_total counter
failed_auth_total ${metrics.failed_auth_total}

# HELP db_transaction_errors_total Total number of database transaction errors
# TYPE db_transaction_errors_total counter
db_transaction_errors_total ${metrics.db_transaction_errors_total}

# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total ${metrics.http_requests_total}
`);
});

export default router;
