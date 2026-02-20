# PostgreSQL Setup Guide for Nova Accounting

## Step-by-Step Setup Instructions

### Step 1: Install PostgreSQL

Since you're on macOS, we'll use Homebrew:

```bash
# Install PostgreSQL
brew install postgresql@14

# Start PostgreSQL service
brew services start postgresql@14
```

**Alternative:** If you prefer the latest version:
```bash
brew install postgresql
brew services start postgresql
```

### Step 2: Create the Database

```bash
# Create the database
createdb nova_accounting
```

If you get a permission error, you might need to create a PostgreSQL user first:
```bash
# Create a PostgreSQL user (if needed)
createuser -s postgres
createdb nova_accounting
```

### Step 3: Configure Environment Variables

Create a `.env` file in the `server` directory:

```bash
cd server
cp .env.example .env
```

Then edit `.env` and set your PostgreSQL credentials:

```env
# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nova_accounting
DB_USER=postgres
DB_PASSWORD=your_password_here

# Application Configuration
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
```

**Note:** If you didn't set a password for PostgreSQL, leave `DB_PASSWORD` empty or use your system user.

### Step 4: Install Dependencies

```bash
cd server
npm install
```

This will install the `pg` package for PostgreSQL.

### Step 5: Initialize Database Schema

```bash
node index.js
```

This will:
- Connect to PostgreSQL
- Create all tables
- Create default subcategories
- Create default admin user

You should see output like:
```
Connected to PostgreSQL database
✓ Database initialization completed
✓ Server running on http://localhost:3001
```

### Step 6: Test the Connection

```bash
# Test health endpoint
curl http://localhost:3001/api/health
```

You should get a response like:
```json
{
  "status": "ok",
  "message": "Server is running",
  "database": "connected"
}
```

## Quick Setup Script

I've created a setup script for you. Run:

```bash
cd server
./setup-postgres.sh
```

This will:
1. Install PostgreSQL if not installed
2. Start the PostgreSQL service
3. Create the database

## Troubleshooting

### PostgreSQL Not Starting

```bash
# Check if PostgreSQL is running
pg_isready

# Start it manually
brew services start postgresql@14
# or
brew services start postgresql
```

### Permission Denied

If you get permission errors:

```bash
# Create a PostgreSQL superuser
createuser -s postgres

# Or use your macOS username
createuser -s $USER
```

Then update `.env` with your username:
```env
DB_USER=your_username
```

### Database Already Exists

If the database already exists, that's fine! The initialization script will just create the tables.

### Connection Refused

1. Check PostgreSQL is running: `pg_isready`
2. Check the port: `lsof -i :5432`
3. Verify credentials in `.env`

### Reset Database (if needed)

```bash
# Drop and recreate
dropdb nova_accounting
createdb nova_accounting
node index.js
```

## Verify Installation

After setup, verify everything works:

1. **Check PostgreSQL is running:**
   ```bash
   pg_isready
   ```

2. **Connect to database:**
   ```bash
   psql nova_accounting
   ```

3. **List tables:**
   ```sql
   \dt
   ```

4. **Exit:**
   ```sql
   \q
   ```

## Next Steps

Once PostgreSQL is set up:

1. ✅ Database is created
2. ✅ Schema is initialized
3. ✅ Default admin user created (username: `admin`, password: `admin123`)
4. ✅ Server is ready to use

You can now:
- Start the server: `npm run dev`
- Access the frontend
- Login with admin credentials
- Start using the application!

## Migration from SQLite (Optional)

If you have existing SQLite data:

```bash
# Make sure SQLite database exists
ls server/database/nova_accounting.db

# Run migration
node server/database/migrate-to-postgres.js
```

---

**Need Help?** Check the error messages in the terminal - they usually point to the issue!
