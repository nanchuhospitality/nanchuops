# 🚀 PostgreSQL Setup - Start Here!

## Quick Setup (Copy & Paste These Commands)

### 1. Install PostgreSQL

```bash
brew install postgresql@14
brew services start postgresql@14
```

### 2. Create Database

```bash
# Wait a few seconds for PostgreSQL to start
sleep 5

# Create the database
createdb nova_accounting
```

### 3. Create .env File

```bash
cd "/Users/iamishann/Nova Accounting/server"

# Create .env file
cat > .env << 'EOF'
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nova_accounting
DB_USER=postgres
DB_PASSWORD=
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
EOF
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Verify Connection

```bash
node verify-postgres.js
```

This will test your PostgreSQL connection and show you what tables exist.

### 6. Initialize Database

```bash
node index.js
```

This creates all tables and the default admin user.

### 7. Test Server

```bash
# In another terminal
curl http://localhost:3001/api/health
```

---

## What Each Step Does

1. **Install PostgreSQL** - Installs the database server
2. **Create Database** - Creates the `nova_accounting` database
3. **Create .env** - Sets up connection configuration
4. **Install Dependencies** - Installs the `pg` package
5. **Verify Connection** - Tests that everything is configured correctly
6. **Initialize Database** - Creates all tables and default data
7. **Test Server** - Verifies the API is working

---

## Common Issues & Solutions

### Issue: "psql: command not found"
**Solution:** PostgreSQL isn't installed. Run: `brew install postgresql@14`

### Issue: "database does not exist"
**Solution:** Run: `createdb nova_accounting`

### Issue: "role does not exist"
**Solution:** 
```bash
createuser -s postgres
# OR use your username in .env: DB_USER=your_username
```

### Issue: "connection refused"
**Solution:** 
```bash
# Check if PostgreSQL is running
pg_isready

# If not, start it
brew services start postgresql@14
```

### Issue: "password authentication failed"
**Solution:** 
- Leave `DB_PASSWORD` empty in `.env` if you didn't set a password
- Or set the correct password in `.env`

---

## After Setup

Once everything is working:

1. ✅ Start the server: `npm run dev`
2. ✅ Open your frontend
3. ✅ Login with:
   - Username: `admin`
   - Password: `admin123`

---

**Need help?** Check the error messages - they usually tell you what's wrong!
