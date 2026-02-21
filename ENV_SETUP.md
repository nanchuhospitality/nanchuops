# Environment Variables Setup

This project currently supports:
- existing Express backend mode
- migration path to Supabase mode

## 1) Server Variables (`server/.env`)

Use these while Express is still running:

```env
NODE_ENV=production
PORT=3001
JWT_SECRET=your-strong-random-secret-key-here
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME
ALLOWED_ORIGINS=https://yourdomain.com
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_*` variables are required only if you want to create Supabase users from the app UI via the backend.

Generate JWT secret:

```bash
openssl rand -base64 32
```

## 2) Client Variables (`client/.env.production` or Vercel env)

For current API mode:

```env
REACT_APP_API_URL=https://your-api-domain.com
```

For Supabase migration mode:

```env
REACT_APP_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
REACT_APP_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Template file is available at `client/.env.example`.

## 3) Security Notes

- Never commit secrets (`.env*` files are ignored)
- Never expose Supabase service-role key in frontend
- Use strong JWT secret until Express is fully removed
- Restrict CORS origins in production
