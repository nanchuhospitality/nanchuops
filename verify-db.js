// Script to verify database schema and show any missing columns
const { getDb } = require('./server/database/init');

const db = getDb();

console.log('Verifying database schema...\n');

// Check employees table structure
db.all("PRAGMA table_info(employees)", (err, columns) => {
  if (err) {
    console.error('Error checking employees table:', err);
    process.exit(1);
  }

  console.log('Employees table columns:');
  const columnNames = columns.map(col => col.name);
  console.log(columnNames.join(', '));
  
  const requiredColumns = [
    'id', 'name', 'phone', 'email', 'address', 
    'receives_transportation', 'salary', 
    'emergency_contact_name', 'emergency_contact_number', 'emergency_contact_relation',
    'id_document_path', 'notes', 'created_at'
  ];
  
  console.log('\nChecking for required columns:');
  const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
  
  if (missingColumns.length > 0) {
    console.log('⚠ Missing columns:', missingColumns.join(', '));
    console.log('\nTo fix: Restart the server to run migrations, or manually add the columns.');
  } else {
    console.log('✓ All required columns exist');
  }
  
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    }
    process.exit(0);
  });
});
