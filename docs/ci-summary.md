# CI/CD Summary

## Overview

This document describes the continuous integration pipeline for the OK Backend project.

---

## Pipeline Stages

### 1. Lint & Environment Check

```bash
npm run lint
npm run check-env
```

**Purpose:** Code quality and environment validation

---

### 2. Security Audit

```bash
npm audit --audit-level=high
```

**Purpose:** Detect known vulnerabilities

---

### 3. Tests

#### Unit Tests
```bash
npm run test:unit -- --coverage
```

#### Integration Tests
```bash
npm run test:integration
```

**Coverage Target:** ≥ 80% for core modules

---

### 4. Build

```bash
npm run build
```

Runs TypeScript type checking without emitting files.

---

## Artifacts

- Test coverage reports
- Build artifacts (if applicable)

---

## GitHub Actions

The CI workflow is defined in `.github/workflows/ci.yml` and runs on:

- Every push to `main`
- Every Pull Request to `main`

---

## Running Locally

```bash
# Full CI locally
npm ci
npm run lint
npm run check-env
npm run test
npm run build
```
