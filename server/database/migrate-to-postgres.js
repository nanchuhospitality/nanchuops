const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const sqliteDb = new sqlite3.Database(path.join(__dirname, 'nova_accounting.db'));

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

async function migrateTable(tableName, transformRow = (row) => row, orderBy = 'id') {
  return new Promise((resolve, reject) => {
    console.log(`Migrating ${tableName}...`);

    sqliteDb.all(`SELECT * FROM ${tableName} ORDER BY ${orderBy}`, async (err, rows) => {
      if (err) {
        console.error(`Error reading ${tableName} from SQLite:`, err.message);
        return resolve();
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
          if (error.code !== '23505') {
            console.error(`Error inserting into ${tableName}:`, error.message);
          }
          skipped++;
        }
      }

      console.log(`  ✓ Migrated ${inserted} rows, skipped ${skipped}`);
      resolve();
    });
  });
}

async function migrate() {
  try {
    console.log('Starting migration from SQLite to PostgreSQL...\n');
    await pgPool.query('SELECT 1');
    console.log('✓ Connected to PostgreSQL\n');

    await migrateTable('branches');
    await migrateTable('users');
    await migrateTable('positions');
    await migrateTable('employees');
    await migrateTable('sales_records');

    console.log('\n✓ Migration completed successfully!');
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  } finally {
    sqliteDb.close();
    await pgPool.end();
  }
}

migrate();
