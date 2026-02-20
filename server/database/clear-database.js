const { getDb, closeDatabase } = require('./init');

const clearDatabase = async () => {
  const db = getDb();

  try {
    console.log('Starting database cleanup...');

    await db.query('DELETE FROM sales_records');
    console.log('✓ Cleared sales_records');

    await db.query('DELETE FROM employees');
    console.log('✓ Cleared employees');

    await db.query('DELETE FROM positions');
    console.log('✓ Cleared positions');

    await db.query("DELETE FROM users WHERE username != 'admin'");
    console.log('✓ Cleared users (kept admin user)');

    const fixSequence = async (tableName) => {
      try {
        const maxResult = await db.query(`SELECT COALESCE(MAX(id), 0) as max_id FROM ${tableName}`);
        const maxId = parseInt(maxResult.rows[0].max_id, 10) || 0;
        await db.query(`SELECT setval('${tableName}_id_seq', $1, false)`, [maxId + 1]);
        console.log(`✓ Fixed ${tableName}_id_seq: set to ${maxId + 1}`);
      } catch (err) {
        console.log(`⚠ Could not fix ${tableName}_id_seq: ${err.message}`);
      }
    };

    await fixSequence('sales_records');
    await fixSequence('employees');
    await fixSequence('positions');
    await fixSequence('users');

    console.log('\n✅ Database cleared successfully!');
    console.log('   - Sales and employee data has been deleted');
    console.log('   - Admin user has been preserved');
    console.log('   - Sequences have been reset');
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    throw error;
  } finally {
    await closeDatabase();
  }
};

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
