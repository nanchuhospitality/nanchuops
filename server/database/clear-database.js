const { getDb, closeDatabase } = require('./init');

const clearDatabase = async () => {
  const db = getDb();

  try {
    console.log('Starting database cleanup...');
    
    // Disable foreign key checks temporarily (PostgreSQL doesn't have this, but we'll delete in order)
    // Delete in reverse order of dependencies to avoid foreign key violations
    
    // First, delete from tables with foreign keys
    await db.query('DELETE FROM journal_entry_lines');
    console.log('✓ Cleared journal_entry_lines');
    
    await db.query('DELETE FROM journal_entries');
    console.log('✓ Cleared journal_entries');
    
    await db.query('DELETE FROM sales_records');
    console.log('✓ Cleared sales_records');
    
    await db.query('DELETE FROM purchases_records');
    console.log('✓ Cleared purchases_records');
    
    // No year-bucket data to preserve
    
    // Clear expenses_records if it exists
    try {
      await db.query('DELETE FROM expenses_records');
      console.log('✓ Cleared expenses_records');
    } catch (err) {
      if (err.code === '42P01') {
        console.log('⚠ Skipped expenses_records (table does not exist)');
      } else {
        throw err;
      }
    }
    
    await db.query('DELETE FROM employees');
    console.log('✓ Cleared employees');
    
    // Skip chart_of_accounts - preserve chart of accounts
    console.log('✓ Preserved chart_of_accounts (not cleared)');
    
    await db.query('DELETE FROM subcategories WHERE is_system = 0');
    console.log('✓ Cleared custom subcategories (kept system subcategories)');
    
    // Remove Bank Account and Cash on Hand subcategories if they exist
    try {
      await db.query(`DELETE FROM subcategories WHERE category = 'asset' AND name IN ('Bank Account', 'Cash on Hand')`);
      console.log('✓ Removed Bank Account and Cash on Hand subcategories');
    } catch (err) {
      console.log('⚠ Could not remove Bank Account/Cash on Hand subcategories:', err.message);
    }
    
    // Remove old expense subcategories (Salary, Marketing and Advertising, Utilities) if they exist
    try {
      await db.query(`DELETE FROM subcategories WHERE category = 'expense' AND name IN ('Salary', 'Marketing and Advertising', 'Utilities')`);
      console.log('✓ Removed old expense subcategories (Salary, Marketing and Advertising, Utilities)');
    } catch (err) {
      console.log('⚠ Could not remove old expense subcategories:', err.message);
    }
    
    await db.query('DELETE FROM positions');
    console.log('✓ Cleared positions');
    
    // Keep admin user, but delete other users
    await db.query("DELETE FROM users WHERE username != 'admin'");
    console.log('✓ Cleared users (kept admin user)');
    
    // Fix sequences for auto-increment IDs based on actual max ID
    const fixSequence = async (tableName) => {
      try {
        const maxResult = await db.query(`SELECT COALESCE(MAX(id), 0) as max_id FROM ${tableName}`);
        const maxId = parseInt(maxResult.rows[0].max_id) || 0;
        await db.query(`SELECT setval('${tableName}_id_seq', $1, false)`, [maxId + 1]);
        console.log(`✓ Fixed ${tableName}_id_seq: set to ${maxId + 1}`);
      } catch (err) {
        console.log(`⚠ Could not fix ${tableName}_id_seq: ${err.message}`);
      }
    };
    
    await fixSequence('journal_entry_lines');
    await fixSequence('journal_entries');
    await fixSequence('sales_records');
    await fixSequence('purchases_records');
    // Fix expenses_records sequence if table exists
    try {
      await fixSequence('expenses_records');
    } catch (err) {
      if (err.code === '42P01') {
        console.log('⚠ Skipped expenses_records_id_seq (table does not exist)');
      } else {
        throw err;
      }
    }
    await fixSequence('employees');
    // Skip chart_of_accounts sequence - preserved
    await fixSequence('subcategories');
    await fixSequence('positions');
    await fixSequence('users');
    console.log('✓ Fixed all sequences');
    
    console.log('\n✅ Database cleared successfully!');
    console.log('   - All transaction data has been deleted');
    console.log('   - Financial years have been preserved');
    console.log('   - Chart of accounts has been preserved');
    console.log('   - Admin user has been preserved');
    console.log('   - System subcategories have been preserved');
    console.log('   - All sequences have been reset');
    
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    throw error;
  } finally {
    await closeDatabase();
  }
};

// Run if called directly
if (require.main === module) {
  clearDatabase()
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to clear database:', error);
      process.exit(1);
    });
}

module.exports = { clearDatabase };
