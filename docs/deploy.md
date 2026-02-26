# Deployment Guide

## Overview

This guide covers deploying the OK Backend to various Node.js hosting providers.

---

## Prerequisites

1. Node.js 20+
2. MongoDB (Atlas or self-hosted)
3. Cloudinary account for image uploads
4. Git repository

---

## Environment Variables

Required environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `production` |
| `PORT` | Server port | `4000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://...` |
| `ACCESS_TOKEN_SECRET` | JWT access secret (min 32 chars) | `your-secret-key...` |
| `ACCESS_TOKEN_EXPIRY` | Access token expiry | `1d` |
| `REFRESH_TOKEN_SECRET` | JWT refresh secret | `your-refresh-secret...` |
| `REFRESH_TOKEN_EXPIRY` | Refresh token expiry | `10d` |
| `CORS_ORIGIN` | Allowed origins | `https://yourapp.com` |
| `CLOUDINARY_API_NAME` | Cloudinary cloud name | `your-cloud-name` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `your-api-key` |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | `your-api-secret` |

---

## Deployment Steps

### 1. Prepare Environment

```bash
# Clone repository
git clone <repo-url>
cd ok_backend

# Install dependencies
npm ci

# Create .env file
cp .env.example .env
# Edit .env with production values
```

### 2. Run Migrations

```bash
npm run migrate
```

### 3. (Optional) Seed Data

```bash
# Create initial owner user
npm run seed
```

### 4. Build

```bash
npm run build
```

### 5. Start Production Server

```bash
npm start
```

---

## Render.com Deployment

1. Connect GitHub repository to Render
2. Create new Web Service
3. Settings:
   - Build Command: `npm ci`
   - Start Command: `npm start`
4. Add Environment Variables in Render dashboard
5. Deploy

---

## Heroku Deployment

```bash
# Login
heroku login

# Create app
heroku create ok-backend

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set MONGODB_URI=your-mongodb-uri
# ... other variables

# Deploy
git push heroku main
```

---

## AWS ECS Deployment

1. Create ECR repository
2. Build and push Docker image
3. Create ECS task definition
4. Configure environment variables
5. Deploy to ECS service

---

## Database Backup Schedule

| Frequency | Retention | Method |
|-----------|----------|--------|
| Daily | 30 days | MongoDB Atlas automatic |
| Weekly | 90 days | Export to S3 |
| Monthly | 1 year | Archive |

---

## Rollback Instructions

### Render
1. Go to Deploys in dashboard
2. Click "Rollback" on previous working deployment

### Heroku
```bash
# List releases
heroku releases

# Rollback to previous version
heroku rollback
```

### Manual
```bash
# Revert to previous commit
git revert HEAD
git push origin main
```

---

## Health Check

After deployment, verify:

```bash
curl https://your-domain.com/health
```

Expected response:
```json
{
  "status": "ok",
  "components": {
    "db": "ok",
    "cloudinary": "ok"
  }
}
```
