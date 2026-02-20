const { Pool } = require('pg');
require('dotenv').config();

let pool;

const getDb = () => {
  if (!pool) {
    const config = process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: process.env.DB_PORT || 5432,
          database: process.env.DB_NAME || 'nova_accounting',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || '',
          ssl: false
        };

    pool = new Pool({
      ...config,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });

    console.log('Connected to PostgreSQL database');
  }

  return pool;
};

const initDatabase = async () => {
  const db = getDb();

  const addColumnIfNotExists = async (tableName, columnDef) => {
    try {
      await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`);
      console.log(`✓ Added column to ${tableName}`);
    } catch (err) {
      if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
        console.error(`Error adding column to ${tableName}:`, err.message);
      }
    }
  };

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        code VARCHAR(100) UNIQUE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'employee',
        full_name VARCHAR(255),
        receives_transportation INTEGER DEFAULT 0,
        branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT users_role_check CHECK (role IN ('admin', 'branch_admin', 'employee', 'night_manager', 'rider_incharge'))
      )
    `);

    await addColumnIfNotExists('users', 'receives_transportation INTEGER DEFAULT 0');
    await addColumnIfNotExists('users', 'branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL');

    await db.query(`
      CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        email VARCHAR(255),
        permanent_address TEXT,
        temporary_address TEXT,
        receives_transportation INTEGER DEFAULT 0,
        salary NUMERIC(10, 2) DEFAULT 0,
        emergency_contact_name VARCHAR(255),
        emergency_contact_number VARCHAR(50),
        emergency_contact_relation VARCHAR(100),
        bank_name VARCHAR(255),
        bank_account_number VARCHAR(100),
        joining_date VARCHAR(50),
        post VARCHAR(255),
        date_of_birth VARCHAR(50),
        citizenship_number VARCHAR(100),
        citizenship_issued_by VARCHAR(255),
        citizenship_issued_date VARCHAR(50),
        id_document_path TEXT,
        driving_license_number VARCHAR(100),
        driving_license_document_path TEXT,
        notes TEXT,
        branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
        in_payroll INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await addColumnIfNotExists('employees', 'salary NUMERIC(10, 2) DEFAULT 0');
    await addColumnIfNotExists('employees', 'id_document_path TEXT');
    await addColumnIfNotExists('employees', 'emergency_contact_name VARCHAR(255)');
    await addColumnIfNotExists('employees', 'emergency_contact_number VARCHAR(50)');
    await addColumnIfNotExists('employees', 'emergency_contact_relation VARCHAR(100)');
    await addColumnIfNotExists('employees', 'permanent_address TEXT');
    await addColumnIfNotExists('employees', 'temporary_address TEXT');
    await addColumnIfNotExists('employees', 'bank_name VARCHAR(255)');
    await addColumnIfNotExists('employees', 'bank_account_number VARCHAR(100)');
    await addColumnIfNotExists('employees', 'joining_date VARCHAR(50)');
    await addColumnIfNotExists('employees', 'post VARCHAR(255)');
    await addColumnIfNotExists('employees', 'date_of_birth VARCHAR(50)');
    await addColumnIfNotExists('employees', 'citizenship_number VARCHAR(100)');
    await addColumnIfNotExists('employees', 'citizenship_issued_by VARCHAR(255)');
    await addColumnIfNotExists('employees', 'citizenship_issued_date VARCHAR(50)');
    await addColumnIfNotExists('employees', 'driving_license_number VARCHAR(100)');
    await addColumnIfNotExists('employees', 'driving_license_document_path TEXT');
    await addColumnIfNotExists('employees', 'branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL');
    await addColumnIfNotExists('employees', 'in_payroll INTEGER DEFAULT 0');
    await addColumnIfNotExists('employees', 'is_active INTEGER DEFAULT 1');

    await db.query(`
      CREATE TABLE IF NOT EXISTS sales_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        date VARCHAR(50) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        description TEXT,
        total_qr_sales NUMERIC(15, 2) DEFAULT 0,
        total_cash_sales NUMERIC(15, 2) DEFAULT 0,
        total_food_sales NUMERIC(15, 2) DEFAULT 0,
        total_beverages_sales NUMERIC(15, 2) DEFAULT 0,
        delivery_charge_collected NUMERIC(15, 2) DEFAULT 0,
        total_discount_given NUMERIC(15, 2) DEFAULT 0,
        total_rider_payment NUMERIC(15, 2) DEFAULT 0,
        transportation_amount NUMERIC(15, 2) DEFAULT 0,
        transportation_recipients TEXT,
        rider_payments TEXT,
        other_expenses TEXT,
        voucher_created INTEGER DEFAULT 0,
        record_number VARCHAR(50),
        branch VARCHAR(50),
        branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
        vat_type VARCHAR(20),
        vat_rate NUMERIC(5, 2) DEFAULT 13.00,
        vat_amount NUMERIC(15, 2) DEFAULT 0,
        vat_calculation_method VARCHAR(20),
        total_amount NUMERIC(15, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await addColumnIfNotExists('sales_records', 'total_qr_sales NUMERIC(15, 2) DEFAULT 0');
    await addColumnIfNotExists('sales_records', 'total_cash_sales NUMERIC(15, 2) DEFAULT 0');
    await addColumnIfNotExists('sales_records', 'total_food_sales NUMERIC(15, 2) DEFAULT 0');
    await addColumnIfNotExists('sales_records', 'total_beverages_sales NUMERIC(15, 2) DEFAULT 0');
    await addColumnIfNotExists('sales_records', 'delivery_charge_collected NUMERIC(15, 2) DEFAULT 0');
    await addColumnIfNotExists('sales_records', 'total_discount_given NUMERIC(15, 2) DEFAULT 0');
    await addColumnIfNotExists('sales_records', 'total_rider_payment NUMERIC(15, 2) DEFAULT 0');
    await addColumnIfNotExists('sales_records', 'transportation_amount NUMERIC(15, 2) DEFAULT 0');
    await addColumnIfNotExists('sales_records', 'transportation_recipients TEXT');
    await addColumnIfNotExists('sales_records', 'rider_payments TEXT');
    await addColumnIfNotExists('sales_records', 'other_expenses TEXT');
    await addColumnIfNotExists('sales_records', 'voucher_created INTEGER DEFAULT 0');
    await addColumnIfNotExists('sales_records', 'record_number VARCHAR(50)');
    await addColumnIfNotExists('sales_records', 'branch VARCHAR(50)');
    await addColumnIfNotExists('sales_records', 'branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL');
    await addColumnIfNotExists('sales_records', 'vat_type VARCHAR(20)');
    await addColumnIfNotExists('sales_records', 'vat_rate NUMERIC(5, 2) DEFAULT 13.00');
    await addColumnIfNotExists('sales_records', 'vat_amount NUMERIC(15, 2) DEFAULT 0');
    await addColumnIfNotExists('sales_records', 'vat_calculation_method VARCHAR(20)');
    await addColumnIfNotExists('sales_records', 'total_amount NUMERIC(15, 2)');

    await db.query('CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_employees_branch_id ON employees(branch_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_sales_records_branch_id ON sales_records(branch_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_sales_records_date ON sales_records(date)');

    // Ensure one universal Rider position always exists and is canonicalized.
    try {
      const riderVariantsResult = await db.query(
        `SELECT id, name
         FROM positions
         WHERE LOWER(TRIM(name)) = 'rider'
         ORDER BY id ASC`
      );

      if (riderVariantsResult.rows.length === 0) {
        await db.query(
          'INSERT INTO positions (name, description) VALUES ($1, $2)',
          ['Rider', 'Universal rider position']
        );
      } else {
        const exact = riderVariantsResult.rows.find((row) => row.name === 'Rider');
        const canonical = exact || riderVariantsResult.rows[0];

        if (canonical.name !== 'Rider') {
          await db.query('UPDATE positions SET name = $1 WHERE id = $2', ['Rider', canonical.id]);
        }

        for (const row of riderVariantsResult.rows) {
          if (row.id !== canonical.id) {
            await db.query('DELETE FROM positions WHERE id = $1', [row.id]);
          }
        }
      }
    } catch (riderPositionErr) {
      console.log('⚠ Could not enforce universal Rider position:', riderPositionErr.message);
    }

    // Create default branch
    await db.query(
      `INSERT INTO branches (name, code, is_active)
       VALUES ('Main Branch', 'main', true)
       ON CONFLICT (name) DO NOTHING`
    );

    // Create default admin user
    const adminCheck = await db.query('SELECT * FROM users WHERE username = $1', ['admin']);
    if (adminCheck.rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      await db.query(
        'INSERT INTO users (username, email, password, role, full_name) VALUES ($1, $2, $3, $4, $5)',
        ['admin', 'admin@nova.com', hashedPassword, 'admin', 'Administrator']
      );
      console.log('✓ Default admin user created (username: admin, password: admin123)');
    } else {
      console.log('✓ Admin user already exists');
    }

    console.log('✓ Database initialization completed');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

const closeDatabase = async () => {
  if (pool) {
    await pool.end();
    console.log('Database connection closed');
  }
};

module.exports = {
  getDb,
  initDatabase,
  closeDatabase
};
