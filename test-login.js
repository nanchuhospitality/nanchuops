// Test script to check login functionality
const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function testLogin() {
  console.log('Testing login endpoint...\n');
  
  try {
    // Test health endpoint first
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${BASE_URL}/api/health`);
    console.log('✓ Health check:', healthResponse.data);
    
    // Test login with default admin
    console.log('\n2. Testing login with admin credentials...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    console.log('✓ Login successful!');
    console.log('  Token received:', loginResponse.data.token ? 'Yes' : 'No');
    console.log('  User:', loginResponse.data.user);
    
  } catch (error) {
    console.error('\n✗ Error occurred:');
    if (error.response) {
      console.error('  Status:', error.response.status);
      console.error('  Error:', error.response.data);
    } else if (error.request) {
      console.error('  No response received. Is the server running?');
      console.error('  Make sure server is running on port 3001');
    } else {
      console.error('  Error:', error.message);
    }
    process.exit(1);
  }
}

testLogin();
