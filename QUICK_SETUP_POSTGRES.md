# PostgreSQL Setup - Manual Steps

Since I can't run all commands directly due to permissions, please run these commands in your terminal:

## Step 1: Install PostgreSQL

Open your terminal and run:

```bash
brew install postgresql@14
brew services start postgresql@14
```

**If you get permission errors:**
```bash
sudo chown -R $(whoami) /opt/homebrew/Cellar
brew install postgresql@14
brew services start postgresql@14
```

## Step 2: Wait for PostgreSQL to Start

```bash
# Wait a few seconds, then check if it's running
sleep 5
pg_isready
```

You should see: `accepting connections`

## Step 3: Create Database

```bash
createdb nova_accounting
```

**If you get "role does not exist" error:**
```bash
# Create a PostgreSQL user
createuser -s postgres
createdb nova_accounting
```

**Or use your macOS username:**
```bash
createdb nova_accounting
# Then update .env with DB_USER=your_username
```

## Step 4: Create .env File

Navigate to the server directory and create `.env`:

```bash
cd "/Users/iamishann/Nova Accounting/server"
```

Create the `.env` file with this content:

```bash
cat > .env << 'EOF'
# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nova_accounting
DB_USER=postgres
DB_PASSWORD=

# Application Configuration
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
EOF
```

**Or manually create the file:**
1. Open `server/.env` in your editor
2. Paste the content above
3. Save the file

## Step 5: Install Node Dependencies

```bash
cd "/Users/iamishann/Nova Accounting/server"
npm install
```

## Step 6: Initialize Database Schema

```bash
node index.js
```

You should see:
```
Connected to PostgreSQL database
✓ Database initialization completed
✓ Server running on http://localhost:3001
```

## Step 7: Test Connection

In another terminal:

```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{"status":"ok","message":"Server is running","database":"connected"}
```

## Troubleshooting

### PostgreSQL won't start
```bash
# Check status
brew services list

# Restart
brew services restart postgresql@14
```

### Can't create database
```bash
# Check if PostgreSQL is running
pg_isready

# Try with your username
createdb -U $(whoami) nova_accounting
```

Then update `.env`:
```env
DB_USER=your_username
```

### Connection refused
```bash
# Check PostgreSQL is listening
lsof -i :5432

# Check PostgreSQL logs
tail -f /opt/homebrew/var/log/postgresql@14.log
```

## Verify Everything Works

1. **Check PostgreSQL:**
   ```bash
   psql nova_accounting -c "\dt"
   ```
   Should list all tables.

2. **Check server:**
   ```bash
   curl http://localhost:3001/api/health
   ```

3. **Login to app:**
   - Username: `admin`
   - Password: `admin123`

---

**Run these commands in order, and let me know if you encounter any errors!**
