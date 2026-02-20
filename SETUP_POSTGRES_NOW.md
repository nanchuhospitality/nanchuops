# Quick PostgreSQL Setup - Run These Commands

## Step 1: Install PostgreSQL

```bash
brew install postgresql@14
brew services start postgresql@14
```

## Step 2: Create Database

```bash
createdb nova_accounting
```

If you get an error about permissions, try:
```bash
createuser -s postgres
createdb nova_accounting
```

## Step 3: Create .env File

Create `server/.env` with this content:

```env
# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nova_accounting
DB_USER=postgres
DB_PASSWORD=

# Application Configuration
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
```

**To create the file:**
```bash
cd server
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

## Step 4: Install Dependencies

```bash
cd server
npm install
```

## Step 5: Initialize Database

```bash
node index.js
```

This will create all tables and the default admin user.

## Step 6: Test

```bash
curl http://localhost:3001/api/health
```

You should see:
```json
{"status":"ok","message":"Server is running","database":"connected"}
```

## All Commands in One Go

```bash
# Install PostgreSQL
brew install postgresql@14
brew services start postgresql@14

# Wait a few seconds for PostgreSQL to start
sleep 5

# Create database
createdb nova_accounting

# Create .env file
cd server
cat > .env << 'EOF'
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nova_accounting
DB_USER=postgres
DB_PASSWORD=
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
EOF

# Install dependencies
npm install

# Initialize database
node index.js
```

---

**That's it!** Your PostgreSQL setup is complete. 🎉
