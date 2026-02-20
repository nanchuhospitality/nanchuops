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

  try {
    // Helper function to safely add columns
    const addColumnIfNotExists = async (tableName, columnDef) => {
      try {
        await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`);
        console.log(`✓ Added column to ${tableName}`);
      } catch (err) {
        // Column already exists, ignore
        if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
          console.error(`Error adding column to ${tableName}:`, err.message);
        }
      }
    };

  // Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'employee',
        full_name VARCHAR(255),
        receives_transportation INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await addColumnIfNotExists('users', 'receives_transportation INTEGER DEFAULT 0');
    await addColumnIfNotExists('users', 'branch_id INTEGER');

    // Create branches table for dynamic multi-branch setup
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

    // Create positions table
    await db.query(`
      CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    // Create employees table
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
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add columns to employees if they don't exist
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
    await addColumnIfNotExists('employees', 'branch_id INTEGER');
    await addColumnIfNotExists('employees', 'in_payroll INTEGER DEFAULT 0');
    await addColumnIfNotExists('employees', 'is_active INTEGER DEFAULT 1');

    // Create salary_records table (one record per employee per period)
    await db.query(`
      CREATE TABLE IF NOT EXISTS salary_records (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
        period_year INTEGER NOT NULL,
        amount NUMERIC(12, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, period_month, period_year)
      )
    `);

    await addColumnIfNotExists('salary_records', 'total_earnings NUMERIC(12, 2) DEFAULT 0');
    await addColumnIfNotExists('salary_records', 'total_deductable NUMERIC(12, 2) DEFAULT 0');
    await addColumnIfNotExists('salary_records', 'earnings_breakdown TEXT');
    await addColumnIfNotExists('salary_records', 'deductables_breakdown TEXT');

    // Create advance_records table (employee salary/cash advances)
    await db.query(`
      CREATE TABLE IF NOT EXISTS advance_records (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
        amount NUMERIC(12, 2) NOT NULL,
        advance_date VARCHAR(50) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'deducted', 'repaid', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id)
      )
    `);

    // Create chart_of_accounts table
    await db.query(`
      CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id SERIAL PRIMARY KEY,
        account_name VARCHAR(255) NOT NULL,
        account_code VARCHAR(50) UNIQUE NOT NULL,
        category VARCHAR(50) NOT NULL CHECK(category IN ('asset', 'liability', 'equity', 'income', 'expense')),
        subcategory VARCHAR(255),
        opening_balance NUMERIC(15, 2) DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await addColumnIfNotExists('chart_of_accounts', 'subcategory VARCHAR(255)');
    await addColumnIfNotExists('chart_of_accounts', 'ledger_group VARCHAR(255)');
    await addColumnIfNotExists('chart_of_accounts', 'opening_balance NUMERIC(15, 2) DEFAULT 0');
    await addColumnIfNotExists('chart_of_accounts', 'is_locked BOOLEAN DEFAULT false');

    // Create subcategories table
    await db.query(`
      CREATE TABLE IF NOT EXISTS subcategories (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL CHECK(category IN ('asset', 'liability', 'equity', 'income', 'expense')),
        name VARCHAR(255) NOT NULL,
        is_system INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category, name)
      )
    `);

    await addColumnIfNotExists('subcategories', 'is_system INTEGER DEFAULT 0');
    await addColumnIfNotExists('subcategories', 'parent_subcategory_id INTEGER REFERENCES subcategories(id)');

    // Rename "Cash on Hand" ledger group to "Cash"
    try {
      await db.query(`UPDATE subcategories SET name = 'Cash' WHERE name = 'Cash on Hand' AND parent_subcategory_id IS NOT NULL`);
      // Also update any accounts that use this ledger group
      await db.query(`UPDATE chart_of_accounts SET ledger_group = 'Cash' WHERE ledger_group = 'Cash on Hand'`);
      console.log('✓ Renamed "Cash on Hand" ledger group to "Cash"');
    } catch (err) {
      console.log('⚠ Could not rename Cash on Hand ledger group:', err.message);
    }

    // Remove "Petty Cash" ledger group and accounts
    try {
      // First, remove any accounts that use "Petty Cash" as ledger_group
      await db.query(`UPDATE chart_of_accounts SET ledger_group = NULL WHERE ledger_group = 'Petty Cash'`);
      // Remove "Petty Cash" from subcategories (both as subcategory and ledger group)
      await db.query(`DELETE FROM subcategories WHERE name = 'Petty Cash'`);
      // Also remove any accounts with "Petty Cash" as subcategory
      await db.query(`UPDATE chart_of_accounts SET subcategory = NULL WHERE subcategory = 'Petty Cash'`);
      console.log('✓ Removed "Petty Cash" ledger group and related accounts');
    } catch (err) {
      console.log('⚠ Could not remove Petty Cash:', err.message);
    }

    // Remove old expense subcategories (Salary, Marketing and Advertising, Utilities) if they exist
    try {
      await db.query(`DELETE FROM subcategories WHERE category = 'expense' AND name IN ('Salary', 'Marketing and Advertising', 'Utilities')`);
      console.log('✓ Removed old expense subcategories (Salary, Marketing and Advertising, Utilities)');
    } catch (err) {
      console.log('⚠ Could not remove old expense subcategories:', err.message);
    }

    // Create default expense subcategories (system-generated)
    const defaultExpenseSubcategories = ['Cost of Goods Sold', 'Operating Expenses', 'Financial Expenses'];
    for (const subcategoryName of defaultExpenseSubcategories) {
      const result = await db.query(
        'SELECT id FROM subcategories WHERE category = $1 AND name = $2',
        ['expense', subcategoryName]
      );
      
      if (result.rows.length === 0) {
        await db.query(
          'INSERT INTO subcategories (category, name, is_system) VALUES ($1, $2, $3)',
          ['expense', subcategoryName, 1]
        );
        console.log(`✓ Created default expense subcategory: ${subcategoryName}`);
      } else {
        await db.query(
          'UPDATE subcategories SET is_system = 1 WHERE category = $1 AND name = $2 AND is_system = 0',
          ['expense', subcategoryName]
        );
      }
    }

    // Create default asset subcategories (system-generated)
    const defaultAssetSubcategories = ['Current Assets', 'Non-Current Assets'];
    for (const subcategoryName of defaultAssetSubcategories) {
      const result = await db.query(
        'SELECT id FROM subcategories WHERE category = $1 AND name = $2',
        ['asset', subcategoryName]
      );
      
      if (result.rows.length === 0) {
        await db.query(
          'INSERT INTO subcategories (category, name, is_system) VALUES ($1, $2, $3)',
          ['asset', subcategoryName, 1]
        );
        console.log(`✓ Created default asset subcategory: ${subcategoryName}`);
      } else {
        await db.query(
          'UPDATE subcategories SET is_system = 1 WHERE category = $1 AND name = $2 AND is_system = 0',
          ['asset', subcategoryName]
        );
      }
    }

    // Create default liability subcategories (system-generated)
    const defaultLiabilitySubcategories = ['Current Liabilities', 'Non-Current Liabilities'];
    for (const subcategoryName of defaultLiabilitySubcategories) {
      const result = await db.query(
        'SELECT id FROM subcategories WHERE category = $1 AND name = $2',
        ['liability', subcategoryName]
      );
      
      if (result.rows.length === 0) {
        await db.query(
          'INSERT INTO subcategories (category, name, is_system) VALUES ($1, $2, $3)',
          ['liability', subcategoryName, 1]
        );
        console.log(`✓ Created default liability subcategory: ${subcategoryName}`);
      } else {
        await db.query(
          'UPDATE subcategories SET is_system = 1 WHERE category = $1 AND name = $2 AND is_system = 0',
          ['liability', subcategoryName]
        );
      }
    }

    // Create default income subcategories (system-generated)
    const defaultIncomeSubcategories = ['Sales Revenue', 'Other Income'];
    let salesRevenueId = null;
    
    for (const subcategoryName of defaultIncomeSubcategories) {
      const result = await db.query(
        'SELECT id FROM subcategories WHERE category = $1 AND name = $2',
        ['income', subcategoryName]
      );
      
      if (result.rows.length === 0) {
        const insertResult = await db.query(
          'INSERT INTO subcategories (category, name, is_system) VALUES ($1, $2, $3) RETURNING id',
          ['income', subcategoryName, 1]
        );
        console.log(`✓ Created default income subcategory: ${subcategoryName}`);
        
        if (subcategoryName === 'Sales Revenue') {
          salesRevenueId = insertResult.rows[0].id;
        }
      } else {
        await db.query(
          'UPDATE subcategories SET is_system = 1 WHERE category = $1 AND name = $2 AND is_system = 0',
          ['income', subcategoryName]
        );
        
        if (subcategoryName === 'Sales Revenue') {
          salesRevenueId = result.rows[0].id;
        }
      }
    }

    // Get Sales Revenue ID if we didn't capture it above
    if (!salesRevenueId) {
      const salesRevenueResult = await db.query(
        'SELECT id FROM subcategories WHERE category = $1 AND name = $2',
        ['income', 'Sales Revenue']
      );
      if (salesRevenueResult.rows.length > 0) {
        salesRevenueId = salesRevenueResult.rows[0].id;
      }
    }

    // Create ledger groups (sub-ledgers) under Sales Revenue: Food Sales, Beverages Sales, Delivery Charge Collected
    if (salesRevenueId) {
      const ledgerGroups = ['Food Sales', 'Beverages Sales', 'Delivery Charge Collected'];
      
      // Helper function to generate account code
      const generateAccountCode = async (category) => {
        const prefix = category === 'income' ? '4' : '5';
        const result = await db.query(
          `SELECT account_code FROM chart_of_accounts 
           WHERE category = $1 AND account_code LIKE $2 
           ORDER BY CAST(account_code AS INTEGER) DESC 
           LIMIT 1`,
          [category, prefix + '%']
        );
        
        let nextNumber = 1;
        if (result.rows.length > 0) {
          const lastCode = result.rows[0].account_code;
          const lastNumber = parseInt(lastCode.substring(prefix.length)) || 0;
          nextNumber = lastNumber + 1;
        }
        
        return prefix + String(nextNumber).padStart(3, '0');
      };

      for (const ledgerGroupName of ledgerGroups) {
        // Create ledger group (child subcategory) if it doesn't exist
        const ledgerGroupResult = await db.query(
          'SELECT id FROM subcategories WHERE category = $1 AND name = $2 AND parent_subcategory_id = $3',
          ['income', ledgerGroupName, salesRevenueId]
        );
        
        if (ledgerGroupResult.rows.length === 0) {
          await db.query(
            'INSERT INTO subcategories (category, name, parent_subcategory_id, is_system) VALUES ($1, $2, $3, $4)',
            ['income', ledgerGroupName, salesRevenueId, 1]
          );
          console.log(`✓ Created ledger group under Sales Revenue: ${ledgerGroupName}`);
        } else {
          await db.query(
            'UPDATE subcategories SET is_system = 1 WHERE category = $1 AND name = $2 AND parent_subcategory_id = $3 AND is_system = 0',
            ['income', ledgerGroupName, salesRevenueId]
          );
        }

        // Create account with same name if it doesn't exist and lock it
        const accountResult = await db.query(
          'SELECT id FROM chart_of_accounts WHERE category = $1 AND account_name = $2',
          ['income', ledgerGroupName]
        );
        
        if (accountResult.rows.length === 0) {
          const accountCode = await generateAccountCode('income');
          await db.query(
            'INSERT INTO chart_of_accounts (account_name, account_code, category, subcategory, ledger_group, opening_balance, is_locked) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [ledgerGroupName, accountCode, 'income', 'Sales Revenue', ledgerGroupName, 0, true]
          );
          console.log(`✓ Created system account (locked): ${ledgerGroupName} (${accountCode})`);
        } else {
          // Lock existing accounts
          await db.query(
            'UPDATE chart_of_accounts SET is_locked = true WHERE category = $1 AND account_name = $2',
            ['income', ledgerGroupName]
          );
          console.log(`✓ Locked existing account: ${ledgerGroupName}`);
        }
      }
    }

    // Create QR Clearing Account under Clearing Account subcategory
    // First, get Current Assets ID
    const currentAssetsResult = await db.query(
      'SELECT id FROM subcategories WHERE category = $1 AND name = $2',
      ['asset', 'Current Assets']
    );
    
    let currentAssetsId = null;
    if (currentAssetsResult.rows.length > 0) {
      currentAssetsId = currentAssetsResult.rows[0].id;
    }

    // Create "Clearing Account" ledger group under Current Assets if it doesn't exist
    let clearingAccountId = null;
    if (currentAssetsId) {
      const clearingAccountResult = await db.query(
        'SELECT id FROM subcategories WHERE category = $1 AND name = $2 AND parent_subcategory_id = $3',
        ['asset', 'Clearing Account', currentAssetsId]
      );
      
      if (clearingAccountResult.rows.length === 0) {
        const insertResult = await db.query(
          'INSERT INTO subcategories (category, name, parent_subcategory_id, is_system) VALUES ($1, $2, $3, $4) RETURNING id',
          ['asset', 'Clearing Account', currentAssetsId, 1]
        );
        clearingAccountId = insertResult.rows[0].id;
        console.log('✓ Created ledger group under Current Assets: Clearing Account');
      } else {
        clearingAccountId = clearingAccountResult.rows[0].id;
        await db.query(
          'UPDATE subcategories SET is_system = 1 WHERE category = $1 AND name = $2 AND parent_subcategory_id = $3 AND is_system = 0',
          ['asset', 'Clearing Account', currentAssetsId]
        );
      }
    }

    if (clearingAccountId) {
      // Helper function to generate account code for assets
      const generateAssetAccountCode = async () => {
        const result = await db.query(
          `SELECT account_code FROM chart_of_accounts 
           WHERE category = 'asset' AND account_code LIKE '1%' 
           ORDER BY CAST(account_code AS INTEGER) DESC 
           LIMIT 1`
        );
        
        let nextNumber = 1;
        if (result.rows.length > 0) {
          const lastCode = result.rows[0].account_code;
          const lastNumber = parseInt(lastCode.substring(1)) || 0;
          nextNumber = lastNumber + 1;
        }
        
        return '1' + String(nextNumber).padStart(3, '0');
      };

      // Create "QR Clearing Account" ledger group under Clearing Account
      const qrClearingResult = await db.query(
        'SELECT id FROM subcategories WHERE category = $1 AND name = $2 AND parent_subcategory_id = $3',
        ['asset', 'QR Clearing Account', clearingAccountId]
      );
      
      if (qrClearingResult.rows.length === 0) {
        await db.query(
          'INSERT INTO subcategories (category, name, parent_subcategory_id, is_system) VALUES ($1, $2, $3, $4)',
          ['asset', 'QR Clearing Account', clearingAccountId, 1]
        );
        console.log('✓ Created ledger group under Clearing Account: QR Clearing Account');
      } else {
        await db.query(
          'UPDATE subcategories SET is_system = 1 WHERE category = $1 AND name = $2 AND parent_subcategory_id = $3 AND is_system = 0',
          ['asset', 'QR Clearing Account', clearingAccountId]
        );
      }

      // Create QR Clearing Account with same name if it doesn't exist and lock it
      const qrAccountResult = await db.query(
        'SELECT id FROM chart_of_accounts WHERE category = $1 AND account_name = $2',
        ['asset', 'QR Clearing Account']
      );
      
      if (qrAccountResult.rows.length === 0) {
        const accountCode = await generateAssetAccountCode();
        await db.query(
          'INSERT INTO chart_of_accounts (account_name, account_code, category, subcategory, ledger_group, opening_balance, is_locked) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          ['QR Clearing Account', accountCode, 'asset', 'Current Assets', 'QR Clearing Account', 0, true]
        );
        console.log(`✓ Created system account (locked): QR Clearing Account (${accountCode})`);
      } else {
        // Lock existing account
        await db.query(
          'UPDATE chart_of_accounts SET is_locked = true WHERE category = $1 AND account_name = $2',
          ['asset', 'QR Clearing Account']
        );
        console.log('✓ Locked existing account: QR Clearing Account');
      }
    }

    // Create VAT accounts (Input VAT and Output VAT) under Current Liabilities
    // First, get or create Current Liabilities subcategory
    const currentLiabilitiesResult = await db.query(
      'SELECT id FROM subcategories WHERE category = $1 AND name = $2',
      ['liability', 'Current Liabilities']
    );
    
    let currentLiabilitiesId = null;
    if (currentLiabilitiesResult.rows.length > 0) {
      currentLiabilitiesId = currentLiabilitiesResult.rows[0].id;
    } else {
      // Create Current Liabilities subcategory if it doesn't exist
      const insertResult = await db.query(
        'INSERT INTO subcategories (category, name, is_system) VALUES ($1, $2, $3) RETURNING id',
        ['liability', 'Current Liabilities', 1]
      );
      currentLiabilitiesId = insertResult.rows[0].id;
      console.log('✓ Created subcategory: Current Liabilities');
    }

    if (currentLiabilitiesId) {
      // Helper function to generate account code for liabilities
      const generateLiabilityAccountCode = async () => {
        const result = await db.query(
          `SELECT account_code FROM chart_of_accounts 
           WHERE category = 'liability' AND account_code LIKE '2%' 
           ORDER BY CAST(account_code AS INTEGER) DESC 
           LIMIT 1`
        );
        
        let nextNumber = 1;
        if (result.rows.length > 0) {
          const lastCode = result.rows[0].account_code;
          const lastNumber = parseInt(lastCode.substring(1)) || 0;
          nextNumber = lastNumber + 1;
        }
        
        return '2' + String(nextNumber).padStart(3, '0');
      };

      // Create Input VAT account
      const inputVatResult = await db.query(
        'SELECT id FROM chart_of_accounts WHERE category = $1 AND account_name = $2',
        ['liability', 'Input VAT']
      );
      
      if (inputVatResult.rows.length === 0) {
        const accountCode = await generateLiabilityAccountCode();
        await db.query(
          'INSERT INTO chart_of_accounts (account_name, account_code, category, subcategory, opening_balance, is_locked) VALUES ($1, $2, $3, $4, $5, $6)',
          ['Input VAT', accountCode, 'liability', 'Current Liabilities', 0, true]
        );
        console.log(`✓ Created system account (locked): Input VAT (${accountCode})`);
      } else {
        await db.query(
          'UPDATE chart_of_accounts SET is_locked = true WHERE category = $1 AND account_name = $2',
          ['liability', 'Input VAT']
        );
        console.log('✓ Locked existing account: Input VAT');
      }

      // Create Output VAT account
      const outputVatResult = await db.query(
        'SELECT id FROM chart_of_accounts WHERE category = $1 AND account_name = $2',
        ['liability', 'Output VAT']
      );
      
      if (outputVatResult.rows.length === 0) {
        const accountCode = await generateLiabilityAccountCode();
        await db.query(
          'INSERT INTO chart_of_accounts (account_name, account_code, category, subcategory, opening_balance, is_locked) VALUES ($1, $2, $3, $4, $5, $6)',
          ['Output VAT', accountCode, 'liability', 'Current Liabilities', 0, true]
        );
        console.log(`✓ Created system account (locked): Output VAT (${accountCode})`);
      } else {
        await db.query(
          'UPDATE chart_of_accounts SET is_locked = true WHERE category = $1 AND account_name = $2',
          ['liability', 'Output VAT']
        );
        console.log('✓ Locked existing account: Output VAT');
      }
    }

    // Create journal_entries table
    await db.query(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id SERIAL PRIMARY KEY,
        entry_number VARCHAR(50) UNIQUE NOT NULL,
        voucher_number VARCHAR(50),
        entry_date DATE NOT NULL,
        reference VARCHAR(255),
        description TEXT,
        purchase_record_id INTEGER,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    await addColumnIfNotExists('journal_entries', 'voucher_number VARCHAR(50)');
    await addColumnIfNotExists('journal_entries', 'purchase_record_id INTEGER');

    // Create journal_entry_lines table
    await db.query(`
      CREATE TABLE IF NOT EXISTS journal_entry_lines (
        id SERIAL PRIMARY KEY,
        journal_entry_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        debit_amount NUMERIC(15, 2) DEFAULT 0,
        credit_amount NUMERIC(15, 2) DEFAULT 0,
        description TEXT,
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
      )
    `);

    // Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_journal_entry_date ON journal_entries(entry_date)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account ON journal_entry_lines(account_id)
    `);

    // Create sales_records table
    await db.query(`
      CREATE TABLE IF NOT EXISTS sales_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        date VARCHAR(50) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        description TEXT,
        category VARCHAR(50),
        payment_method VARCHAR(50),
        total_qr_sales NUMERIC(15, 2) DEFAULT 0,
        total_cash_sales NUMERIC(15, 2) DEFAULT 0,
        total_rider_payment NUMERIC(15, 2) DEFAULT 0,
        transportation_amount NUMERIC(15, 2) DEFAULT 0,
        transportation_recipient_id INTEGER,
        transportation_recipients TEXT,
        rider_payments TEXT,
        other_expenses TEXT,
        voucher_created INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
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
    await addColumnIfNotExists('sales_records', 'transportation_recipient_id INTEGER');
    await addColumnIfNotExists('sales_records', 'transportation_recipients TEXT');
    await addColumnIfNotExists('sales_records', 'rider_payments TEXT');
    await addColumnIfNotExists('sales_records', 'other_expenses TEXT');
    await addColumnIfNotExists('sales_records', 'voucher_created INTEGER DEFAULT 0');
    await addColumnIfNotExists('sales_records', 'record_number VARCHAR(50)');
    await addColumnIfNotExists('sales_records', 'branch VARCHAR(50)');
    await addColumnIfNotExists('sales_records', 'branch_id INTEGER');
    
    // Add VAT columns to sales_records
    await addColumnIfNotExists('sales_records', 'vat_type VARCHAR(20)');
    await addColumnIfNotExists('sales_records', 'vat_rate NUMERIC(5, 2) DEFAULT 13.00');
    await addColumnIfNotExists('sales_records', 'vat_amount NUMERIC(15, 2) DEFAULT 0');
    await addColumnIfNotExists('sales_records', 'vat_calculation_method VARCHAR(20)');
    await addColumnIfNotExists('sales_records', 'total_amount NUMERIC(15, 2)');

    // Create purchases_records table
    await db.query(`
      CREATE TABLE IF NOT EXISTS purchases_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        date VARCHAR(50) NOT NULL,
        purchase_date VARCHAR(50),
        payment_date VARCHAR(50),
        amount NUMERIC(15, 2) NOT NULL,
        voucher_amount NUMERIC(15, 2),
        description TEXT,
        invoice_number VARCHAR(255),
        reference_number VARCHAR(255),
        payment_account_id INTEGER,
        supplier_id INTEGER,
        purchase_account_id INTEGER NOT NULL,
        voucher_created INTEGER DEFAULT 0,
        record_number VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (supplier_id) REFERENCES chart_of_accounts(id),
        FOREIGN KEY (purchase_account_id) REFERENCES chart_of_accounts(id),
        FOREIGN KEY (payment_account_id) REFERENCES chart_of_accounts(id)
      )
    `);

    await addColumnIfNotExists('purchases_records', 'voucher_created INTEGER DEFAULT 0');
    await addColumnIfNotExists('purchases_records', 'supplier_id INTEGER');
    await addColumnIfNotExists('purchases_records', 'purchase_account_id INTEGER');
    await addColumnIfNotExists('purchases_records', 'payment_account_id INTEGER');
    await addColumnIfNotExists('purchases_records', 'invoice_number VARCHAR(255)');
    await addColumnIfNotExists('purchases_records', 'reference_number VARCHAR(255)');
    await addColumnIfNotExists('purchases_records', 'purchase_date VARCHAR(50)');
    await addColumnIfNotExists('purchases_records', 'payment_date VARCHAR(50)');
    await addColumnIfNotExists('purchases_records', 'record_number VARCHAR(50)');
    await addColumnIfNotExists('purchases_records', 'voucher_amount NUMERIC(15, 2)');
    await addColumnIfNotExists('purchases_records', 'journal_entry_number VARCHAR(50)');
    
    // Add VAT columns to purchases_records
    await addColumnIfNotExists('purchases_records', 'vat_type VARCHAR(20)');
    await addColumnIfNotExists('purchases_records', 'vat_rate NUMERIC(5, 2) DEFAULT 13.00');
    await addColumnIfNotExists('purchases_records', 'vat_amount NUMERIC(15, 2) DEFAULT 0');
    await addColumnIfNotExists('purchases_records', 'vat_calculation_method VARCHAR(20)');
    await addColumnIfNotExists('purchases_records', 'total_amount NUMERIC(15, 2)');

    // Create expenses_records table
    await db.query(`
      CREATE TABLE IF NOT EXISTS expenses_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        date VARCHAR(50) NOT NULL,
        expense_date VARCHAR(50),
        amount NUMERIC(15, 2) NOT NULL,
        description TEXT,
        invoice_number VARCHAR(255),
        reference_number VARCHAR(255),
        expense_account_id INTEGER NOT NULL,
        payment_account_id INTEGER,
        voucher_created INTEGER DEFAULT 0,
        record_number VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (expense_account_id) REFERENCES chart_of_accounts(id),
        FOREIGN KEY (payment_account_id) REFERENCES chart_of_accounts(id)
      )
    `);

    // Migrate existing data: copy date to purchase_date
    try {
      await db.query(`
        UPDATE purchases_records 
        SET purchase_date = date 
        WHERE purchase_date IS NULL AND date IS NOT NULL
      `);
      await db.query(`
        UPDATE purchases_records 
        SET payment_date = purchase_date 
        WHERE payment_account_id IS NOT NULL 
          AND payment_date IS NULL 
          AND purchase_date IS NOT NULL
      `);
    } catch (err) {
      // Ignore if no data exists
    }

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
