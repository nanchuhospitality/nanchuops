// Quick script to check if database is initialized and admin user exists
const { getDb } = require('./server/database/init');

const db = getDb();

console.log('Checking database...\n');

db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
  if (err) {
    console.error('Error checking users table:', err);
    process.exit(1);
  }
  console.log(`Total users in database: ${row.count}`);

  db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, admin) => {
    if (err) {
      console.error('Error checking admin user:', err);
      process.exit(1);
    }

    if (admin) {
      console.log('✓ Admin user exists:');
      console.log(`  - Username: ${admin.username}`);
      console.log(`  - Email: ${admin.email}`);
      console.log(`  - Role: ${admin.role}`);
      console.log(`  - Created: ${admin.created_at}`);
    } else {
      console.log('✗ Admin user does NOT exist!');
      console.log('  The database may not be initialized properly.');
      console.log('  Try restarting the server to initialize the database.');
    }

    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      }
      process.exit(0);
    });
  });
});
