# Supabase Migration (Phase 1)

This folder starts the migration from Express API to Supabase + Vercel.

## What is included
- `migrations/20260221_initial_schema.sql`: initial database schema bootstrap in Supabase
- `migrations/20260221_auth_and_rls.sql`: Supabase Auth profile sync + RLS policies for users/branches/employees/positions/storage
- `migrations/20260221_drop_removed_modules.sql`: drops removed accounting module tables from existing DBs

## Apply migration

Option A (Supabase SQL Editor):
1. Open your Supabase project
2. Go to SQL Editor
3. Run `supabase/migrations/20260221_initial_schema.sql`
4. If your DB already has old tables, also run `supabase/migrations/20260221_drop_removed_modules.sql`

Option B (Supabase CLI):
1. Install Supabase CLI
2. Link project
3. Run migration commands with this SQL file

## Next migration steps
1. Move authentication from custom JWT to Supabase Auth
2. Add Row Level Security (RLS) policies per role/branch
3. Replace each frontend API usage (`/api/*`) with `supabase-js` queries or Edge Functions
4. Move uploads from local disk to Supabase Storage
5. Remove Express server after feature parity

## Notes
- Current app still runs with existing Express backend.
- This is a safe starting point to migrate module-by-module.
