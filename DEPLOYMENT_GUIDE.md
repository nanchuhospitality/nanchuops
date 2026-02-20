# Deployment Guide (Current Monorepo)

This project is now a single repository with:
- `client/` (React frontend)
- `server/` (Express API)

You can deploy in 2 valid ways.

## Option 1: Split Deploy (Netlify + Node Host)

Use this when frontend and backend are hosted separately.

### 1. Deploy Backend (`server`) to your Node host
Examples: Heroku, Render, Railway, Fly.io.

Backend start command:
```bash
cd server
npm start
```

Required backend environment variables:
```env
NODE_ENV=production
JWT_SECRET=your-strong-secret
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME
ALLOWED_ORIGINS=https://your-frontend-domain.netlify.app
```

Notes:
- `ALLOWED_ORIGINS` supports comma-separated domains.
- `PORT` is optional (most hosts inject it automatically).

### 2. Deploy Frontend (`client`) to Netlify
In Netlify site settings:
- Base directory: `client`
- Build command: `npm run build`
- Publish directory: `build`

Frontend environment variable:
```env
REACT_APP_API_URL=https://your-backend-domain.com
```

Important:
- Publish directory must be exactly `build` (no extra characters).
- `client/netlify.toml` already includes SPA redirect handling.

### 3. Verify
- Open `https://your-frontend-domain.netlify.app/login`
- Login and confirm API requests succeed
- Health check backend: `GET /api/health`

---

## Option 2: Single Deploy (Backend serves frontend)

Use this when you want one host for both UI and API.

The backend already serves `client/build` in production when it exists.

### 1. Build frontend
```bash
npm run build
```

### 2. Deploy repo and run backend
Start command:
```bash
npm start
```

Required environment variables:
```env
NODE_ENV=production
JWT_SECRET=your-strong-secret
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME
```

Optional:
- `ALLOWED_ORIGINS` can be omitted if UI and API are on same origin.

---

## Database (Production)

Use PostgreSQL in production.

Preferred:
- `DATABASE_URL` (single connection string)

Fallback (if not using `DATABASE_URL`):
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

---

## Quick Troubleshooting

### Netlify build fails
- Confirm Base directory is `client`
- Confirm Publish directory is exactly `build`
- Confirm `REACT_APP_API_URL` is set for production

### CORS errors
- Ensure backend `ALLOWED_ORIGINS` includes exact frontend URL
- If multiple origins, separate with commas

### Backend boot fails
- Check `JWT_SECRET` is set
- Check database credentials / `DATABASE_URL`
- Check `/api/health` response in logs

---

## Recommended Production Checklist

- [ ] Strong `JWT_SECRET`
- [ ] PostgreSQL configured
- [ ] Correct frontend/backend URLs
- [ ] CORS configured (`ALLOWED_ORIGINS`)
- [ ] Login and core pages tested
- [ ] Sales create/edit/list tested
- [ ] Employee pages tested
