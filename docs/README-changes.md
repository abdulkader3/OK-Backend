# OK Backend - Infrastructure Changes

This document describes the new scripts, environment variables, and CI expectations added during the Phase 1 infrastructure hardening.

## New Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with nodemon |
| `npm run start` | Start production server |
| `npm run build` | Run TypeScript type checking (`tsc --noEmit`) |
| `npm run test` | Run all tests |
| `npm run test:quick` | Run tests without e2e tests |
| `npm run lint` | Run ESLint on src/ |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run format` | Format code with Prettier |
| `npm run check-env` | Validate required environment variables |
| `npm run migrate` | Run database migrations |
| `npm run seed` | Seed database with initial data |

## Required Environment Variables

The application requires the following environment variables. Use `.env.sample` as a reference.

### Database
- `MONGODB_URI` - MongoDB connection string

### Authentication
- `ACCESS_TOKEN_SECRET` - JWT access token secret (min 32 chars)
- `ACCESS_TOKEN_EXPIRY` - Access token expiry (e.g., 1d)
- `REFRESH_TOKEN_SECRET` - JWT refresh token secret
- `REFRESH_TOKEN_EXPIRY` - Refresh token expiry (e.g., 10d)

### Cloudinary
- `CLOUDINARY_API_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret

### Server
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development, production, test)
- `CORS_ORIGIN` - Allowed CORS origins (comma-separated or single origin)

### Optional (with defaults)
- `LOG_LEVEL` - Logger level (debug, info, warn, error)
- `RATE_LIMIT_WINDOW_MS` - Rate limit window (default: 60000)
- `RATE_LIMIT_MAX` - Max requests per window (default: 100)
- `LOGIN_LIMIT_WINDOW_MS` - Login rate limit window (default: 900000)
- `LOGIN_LIMIT_MAX` - Max login attempts (default: 20)
- `REGISTER_LIMIT_MAX` - Max registration attempts (default: 5)

## CI Expectations

The project uses Husky for pre-commit hooks. Before committing:

1. `npm run lint` must pass (or only have auto-fixable issues)
2. `npm run test:quick` must pass

To skip pre-commit hooks (not recommended), use: `git commit --no-verify`

## New Middlewares

- **Helmet** - Security headers (`src/app.js`)
- **Request Logger** - Logs all HTTP requests (`src/middlewares/request-logger.middleware.js`)
- **Global Error Handler** - Catches and formats all errors (`src/middlewares/error-handler.middleware.js`)
- **Rate Limiter** - Configurable via env vars (`src/middlewares/rateLimiter.middleware.js`)

## Database

- **Transaction Support** - Use `withTransaction()` helper from `src/db/index.js` for atomic operations
- **Migrations** - Run with `npm run migrate`; add migration files to `src/db/migrations/`

## Logging

The project uses Pino for structured logging. In development, logs are pretty-printed. In production, logs are JSON.

Example log output:
```json
{"level":30,"time":"2026-02-26T12:00:00.000Z","method":"GET","path":"/health","statusCode":200,"duration":"5ms"}
```

## Type Safety

TypeScript is used as a dev dependency. Run `npm run build` to check types without emitting files.

## Security Notes

- **NEVER** commit `.env` file - it contains secrets
- Use `.env.sample` for development setup
- CORS is configured via `CORS_ORIGIN` env var - do not use `*` in production
- Rate limiting is enabled and configurable via environment variables
