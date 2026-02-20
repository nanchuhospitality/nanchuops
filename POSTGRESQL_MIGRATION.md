# PostgreSQL Migration Guide

This document outlines the migration from SQLite to PostgreSQL for the Nova Accounting application.

## Status

✅ **FULLY COMPLETED - All Routes Converted!**

- ✅ `package.json` - Updated to use `pg` instead of `sqlite3`
- ✅ `server/database/init.js` - Converted to PostgreSQL connection pool
- ✅ `server/index.js` - Updated to handle async database initialization
- ✅ `server/routes/auth.js` - Converted to async/await with PostgreSQL
- ✅ `server/routes/chartOfAccounts.js` - Converted to async/await with PostgreSQL
- ✅ `server/routes/subcategories.js` - Converted to async/await with PostgreSQL
- ✅ `server/routes/purchases.js` - Converted with complex queries
- ✅ `server/routes/journalEntries.js` - Converted with PostgreSQL transactions
- ✅ `server/routes/generalLedger.js` - Converted with date filtering
- ✅ `server/routes/sales.js` - Converted
- ✅ `server/routes/employees.js` - Converted with file upload handling
- ✅ `server/routes/dashboard.js` - Converted with PostgreSQL date functions
- ✅ `server/routes/positions.js` - Converted
- ✅ `server/routes/units.js` - Converted
- ✅ `server/routes/groups.js` - Converted
- ✅ `server/routes/items.js` - Converted
- ✅ `server/database/migrate-to-postgres.js` - Migration script created

## Key Changes Required

### 1. Database Connection
- **Before (SQLite):** `sqlite3.Database()` with callbacks
- **After (PostgreSQL):** `pg.Pool()` with async/await

### 2. Query Syntax
- **Placeholders:** `?` → `$1, $2, $3...`
- **Results:** `result.rows[0]` instead of direct row
- **Multiple rows:** `result.rows` instead of array
- **Last ID:** Use `RETURNING id` clause instead of `this.lastID`

### 3. Data Types
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
- `TEXT` → `VARCHAR(255)` or `TEXT`
- `REAL` → `NUMERIC(15, 2)`
- `DATETIME` → `TIMESTAMP`

### 4. Function Signatures
- Convert all route handlers to `async (req, res) => {}`
- Replace callback-based queries with `await db.query()`

## Conversion Pattern

### Example: GET Route

**Before (SQLite):**
```javascript
router.get('/', (req, res) => {
  const db = getDb();
  db.all('SELECT * FROM table', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ data: rows });
  });
});
```

**After (PostgreSQL):**
```javascript
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.query('SELECT * FROM table');
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});
```

### Example: POST Route

**Before (SQLite):**
```javascript
router.post('/', (req, res) => {
  const db = getDb();
  db.run(
    'INSERT INTO table (name) VALUES (?)',
    [req.body.name],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error' });
      }
      res.json({ id: this.lastID });
    }
  );
});
```

**After (PostgreSQL):**
```javascript
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      'INSERT INTO table (name) VALUES ($1) RETURNING id',
      [req.body.name]
    );
    res.json({ id: result.rows[0].id });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error' });
  }
});
```

## Environment Variables

Create or update `server/.env`:

```env
# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nova_accounting
DB_USER=postgres
DB_PASSWORD=your_password

# Or use connection string (for Heroku)
# DATABASE_URL=postgres://user:password@host:port/database

NODE_ENV=development
JWT_SECRET=your_jwt_secret
```

## Setup Steps

1. **Install PostgreSQL dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Create PostgreSQL database:**
   ```bash
   createdb nova_accounting
   ```

3. **Initialize database schema:**
   ```bash
   node server/index.js
   # This will run initDatabase() and create all tables
   ```

4. **Migrate data (if needed):**
   ```bash
   node server/database/migrate-to-postgres.js
   ```

5. **Update environment variables** in `server/.env`

6. **Test the application:**
   ```bash
   npm run dev
   ```

## For Heroku Deployment

1. **Add PostgreSQL addon:**
   ```bash
   heroku addons:create heroku-postgresql:hobby-dev
   ```

2. **The `DATABASE_URL` will be automatically set**

3. **Deploy:**
   ```bash
   git add .
   git commit -m "Migrate to PostgreSQL"
   git push heroku main
   ```

## Important Notes

1. **Foreign Keys:** PostgreSQL enforces foreign key constraints by default
2. **Case Sensitivity:** PostgreSQL is case-sensitive for identifiers (use lowercase)
3. **Transactions:** Use `BEGIN` / `COMMIT` / `ROLLBACK` properly
4. **Connection Pooling:** The `pg` Pool handles connections automatically
5. **Error Handling:** Always wrap database calls in try-catch blocks

## Testing Checklist

- [ ] User authentication (login/register)
- [ ] Chart of Accounts CRUD operations
- [ ] Subcategories CRUD operations
- [ ] Purchase records creation and listing
- [ ] Journal entries creation
- [ ] General ledger queries
- [ ] Sales records
- [ ] Employee management
- [ ] All other routes

## Rollback Plan

If you need to rollback to SQLite:

1. Revert `package.json` to use `sqlite3`
2. Revert `server/database/init.js` to SQLite connection
3. Revert all route files to callback-based queries
4. Run `npm install` to reinstall SQLite

The SQLite database file (`server/database/nova_accounting.db`) should still exist.
