const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// SQLite connection
const sqliteDb = new sqlite3.Database(path.join(__dirname, 'nova_accounting.db'));

// PostgreSQL connection
const pgConfig = process.env.DATABASE_URL 
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'nova_accounting',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    };

const pgPool = new Pool(pgConfig);

// Helper function to migrate a table
async function migrateTable(tableName, transformRow = (row) => row, orderBy = 'id') {
  return new Promise((resolve, reject) => {
    console.log(`Migrating ${tableName}...`);
    
    sqliteDb.all(`SELECT * FROM ${tableName} ORDER BY ${orderBy}`, async (err, rows) => {
      if (err) {
        console.error(`Error reading ${tableName} from SQLite:`, err);
        return reject(err);
      }

      if (rows.length === 0) {
        console.log(`  No data in ${tableName}`);
        return resolve();
      }

      let inserted = 0;
      let skipped = 0;

      for (const row of rows) {
        try {
          const transformedRow = transformRow(row);
          const columns = Object.keys(transformedRow);
          const values = Object.values(transformedRow);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
          
          await pgPool.query(
            `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          );
          
          inserted++;
        } catch (error) {
          if (error.code === '23505') { // Unique violation
            skipped++;
          } else {
            console.error(`Error inserting into ${tableName}:`, error.message);
            skipped++;
          }
        }
      }
      
      console.log(`  ✓ Migrated ${inserted} rows, skipped ${skipped} duplicates`);
      resolve();
    });
  });
}

async function migrate() {
  try {
    console.log('Starting migration from SQLite to PostgreSQL...\n');

    // Test PostgreSQL connection
    await pgPool.query('SELECT 1');
    console.log('✓ Connected to PostgreSQL\n');

    // Migrate tables in order (respecting foreign keys)
    await migrateTable('users');
    await migrateTable('positions');
    await migrateTable('subcategories');
    await migrateTable('units');
    await migrateTable('item_groups');
    await migrateTable('chart_of_accounts');
    await migrateTable('employees');
    await migrateTable('items');
    await migrateTable('journal_entries');
    await migrateTable('journal_entry_lines');
    await migrateTable('sales_records');
    await migrateTable('purchases_records');
    
    console.log('\n✓ Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Verify data in PostgreSQL database');
    console.log('2. Update your .env file with PostgreSQL connection details');
    console.log('3. Restart your server');
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  } finally {
    sqliteDb.close();
    await pgPool.end();
  }
}

migrate();
