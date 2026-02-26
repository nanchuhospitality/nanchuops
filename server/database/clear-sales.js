const { getDb, closeDatabase } = require('./init');

const clearSalesRecords = async () => {
  const db = getDb();

  try {
    console.log('Starting sales records cleanup...');

    await db.query('DELETE FROM sales_records');
    console.log('✓ Cleared sales_records');

    // Reset the sequence
    try {
      const maxResult = await db.query('SELECT COALESCE(MAX(id), 0) as max_id FROM sales_records');
      const maxId = parseInt(maxResult.rows[0].max_id, 10) || 0;
      await db.query('SELECT setval(\'sales_records_id_seq\', $1, false)', [maxId + 1]);
      console.log(`✓ Fixed sales_records_id_seq: set to ${maxId + 1}`);
    } catch (err) {
      console.log(`⚠ Could not fix sales_records_id_seq: ${err.message}`);
    }

    console.log('\n✅ Sales records cleared successfully!');
  } catch (error) {
    console.error('❌ Error clearing sales records:', error);
    throw error;
  } finally {
    await closeDatabase();
  }
};

if (require.main === module) {
  clearSalesRecords()
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to clear sales records:', error);
      process.exit(1);
    });
}

module.exports = { clearSalesRecords };
