# Release Checklist

## Pre-Release

- [ ] All tests passing (`npm test`)
- [ ] Lint passing (`npm run lint`)
- [ ] TypeScript check passing (`npm run build`)
- [ ] No high/critical security vulnerabilities (`npm audit`)
- [ ] Migration dry-run completed

## Database

- [ ] Backup taken (for production)
- [ ] Migrations tested in staging
- [ ] Migration status verified

## Configuration

- [ ] Environment variables configured for production
- [ ] CORS_ORIGIN set to production domain
- [ ] JWT secrets rotated (not default values)
- [ ] Cloudinary credentials valid

## Staging Verification

- [ ] Health endpoint returns ok
- [ ] User registration works
- [ ] Ledger creation works
- [ ] Payment recording works
- [ ] Idempotency working
- [ ] Sync batch endpoint working
- [ ] Dashboard totals correct

## Production Deployment

- [ ] Deploy to staging first
- [ ] Run smoke tests against staging
- [ ] Deploy to production
- [ ] Verify health endpoint in production

## Post-Deployment

- [ ] Monitor error logs for 30 minutes
- [ ] Check metrics dashboard
- [ ] Verify payments are processing
- [ ] Test with real user flow

## Rollback Plan

- [ ] Previous commit hash noted
- [ ] Database backup available
- [ ] Rollback procedure documented
