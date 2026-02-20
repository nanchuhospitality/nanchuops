const { getDb, closeDatabase } = require('./init');

const fixSequences = async () => {
  const db = getDb();

  try {
    console.log('Fixing database sequences...');
    
    // Get the maximum ID from each table and set the sequence to max + 1
    const tables = [
      'journal_entry_lines',
      'journal_entries',
      'sales_records',
      'purchases_records',
      'employees',
      'chart_of_accounts',
      'subcategories',
      'positions',
      'users'
    ];

    for (const table of tables) {
      try {
        // Get max ID from table
        const maxResult = await db.query(`SELECT COALESCE(MAX(id), 0) as max_id FROM ${table}`);
        const maxId = parseInt(maxResult.rows[0].max_id) || 0;
        
        // Set sequence to max + 1
        const sequenceName = `${table}_id_seq`;
        await db.query(`SELECT setval('${sequenceName}', $1, false)`, [maxId + 1]);
        console.log(`✓ Fixed ${sequenceName}: set to ${maxId + 1}`);
      } catch (err) {
        // Table or sequence might not exist, skip it
        if (err.message.includes('does not exist')) {
          console.log(`⚠ Skipped ${table} (table or sequence does not exist)`);
        } else {
          console.error(`✗ Error fixing ${table}:`, err.message);
        }
      }
    }
    
    console.log('\n✅ All sequences fixed!');
    
  } catch (error) {
    console.error('❌ Error fixing sequences:', error);
    throw error;
  } finally {
    await closeDatabase();
  }
};

// Run if called directly
if (require.main === module) {
  fixSequences()
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to fix sequences:', error);
      process.exit(1);
    });
}

module.exports = { fixSequences };
