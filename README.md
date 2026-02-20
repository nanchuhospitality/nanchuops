# NanchuOps

Operations and accounting monorepo with React frontend and Express backend.
Supabase migration scaffolding is added under `supabase/` (Phase 1).

## Stack
- Frontend: React (`client`)
- Backend: Node.js + Express (`server`)
- Database: PostgreSQL (server uses `pg`)

## Monorepo Structure
- `client/` - web app
- `server/` - API server
- `supabase/` - migration SQL and Supabase config
- `package.json` - root scripts to run both apps

## Requirements
- Node.js 18+
- npm 9+
- PostgreSQL

## Setup
1. Install dependencies:
```bash
npm run install-all
```

2. Configure environment variables:
- Create/update `server/.env`
- Set database connection and `JWT_SECRET`

## Run Locally
Start frontend + backend together:
```bash
npm run dev
```

Other useful scripts:
```bash
npm run server      # backend only (nodemon)
npm run client      # frontend only
npm run build       # build frontend
npm run start       # start backend
```

## Frontend Routes
- `/login`
- `/:branchslug/dashboard`
- `/:branchslug/sales`
- `/:branchslug/sales/new`
- `/:branchslug/sales/edit/:id`
- `/:branchslug/employees`
- `/:branchslug/positions`
- `/:branchslug/users`
- `/:branchslug/branches`

## API Overview
- `/api/auth/*`
- `/api/dashboard/*`
- `/api/sales/*`
- `/api/employees/*`
- `/api/positions/*`
- `/api/branches/*`
- `/api/users/*`

## Deployment
See `DEPLOYMENT_GUIDE.md`.
