#!/usr/bin/env node

/**
 * PostgreSQL Connection Verification Script
 * Run this to test your PostgreSQL setup
 */

require('dotenv').config();
const { Pool } = require('pg');

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

console.log('🔍 Testing PostgreSQL connection...\n');
console.log('Configuration:');
console.log(`  Host: ${config.host || 'from DATABASE_URL'}`);
console.log(`  Database: ${config.database || 'from DATABASE_URL'}`);
console.log(`  User: ${config.user || 'from DATABASE_URL'}`);
console.log('');

const pool = new Pool(config);

pool.query('SELECT NOW() as current_time, version() as pg_version')
  .then(result => {
    console.log('✅ Successfully connected to PostgreSQL!');
    console.log(`  Current time: ${result.rows[0].current_time}`);
    console.log(`  PostgreSQL version: ${result.rows[0].pg_version.split(' ')[0]} ${result.rows[0].pg_version.split(' ')[1]}`);
    console.log('');
    
    // Check if tables exist
    return pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
  })
  .then(result => {
    if (result.rows.length > 0) {
      console.log(`✅ Found ${result.rows.length} tables:`);
      result.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    } else {
      console.log('⚠️  No tables found. Run "node index.js" to initialize the database.');
    }
    console.log('');
    console.log('✅ PostgreSQL setup is working correctly!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Connection failed!');
    console.error('');
    console.error('Error:', err.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Make sure PostgreSQL is running: pg_isready');
    console.error('2. Check your .env file has correct credentials');
    console.error('3. Verify database exists: psql -l | grep nova_accounting');
    console.error('4. Check PostgreSQL is listening: lsof -i :5432');
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
