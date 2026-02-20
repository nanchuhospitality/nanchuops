const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const salesRoutes = require('./routes/sales');
const branchesRoutes = require('./routes/branches');
const dashboardRoutes = require('./routes/dashboard');
const employeesRoutes = require('./routes/employees');
const positionsRoutes = require('./routes/positions');
const { initDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3001;
const clientBuildPath = path.join(__dirname, '..', 'client', 'build');

// Middleware
// CORS configuration - allow specific origins in production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || false
    : true, // Allow all in development
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize database
initDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads', 'employee-ids');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✓ Created uploads directory');
}

// Root endpoint - API information
app.get('/', (req, res) => {
  res.json({
    message: 'Nova Accounting API Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      sales: '/api/sales',
      branches: '/api/branches',
      dashboard: '/api/dashboard',
      employees: '/api/employees',
      positions: '/api/positions'
    },
    documentation: 'See README.md for API documentation'
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const { getDb } = require('./database/init');
  const db = getDb();
  
  // Test database connection
  db.query('SELECT 1 as test')
    .then(() => {
      res.json({ 
        status: 'ok', 
        message: 'Server is running',
        database: 'connected'
      });
    })
    .catch(err => {
      return res.status(500).json({ 
        status: 'error', 
        message: 'Database connection failed',
        error: err.message 
    });
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/positions', positionsRoutes);

// Serve React app in production for a single combined frontend+backend runtime.
if (process.env.NODE_ENV === 'production' && fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    return res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  if (err.stack) {
    console.error('Error Stack:', err.stack);
  }
  
  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 5MB' });
  }
  
  if (err.message) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

// Bind to 0.0.0.0 in production to accept connections from any interface
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
const server = app.listen(PORT, HOST, (err) => {
  if (err) {
    console.error('Error starting server:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Please stop the other process or change the PORT in .env`);
    } else if (err.code === 'EPERM') {
      console.error(`Permission denied to bind to port ${PORT}. Try using a different port (e.g., 3001, 8000)`);
      console.error('Or run with: PORT=3001 npm run server');
    } else {
      console.error('Failed to start server:', err.message);
    }
    process.exit(1);
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.log(`✓ Server running on http://${HOST}:${PORT}`);
      console.log(`✓ API available at http://${HOST}:${PORT}/api`);
      console.log(`✓ Production mode - serving React build`);
    } else {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ API available at http://localhost:${PORT}/api`);
    }
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✗ Port ${PORT} is already in use!`);
    console.error(`  Solution 1: Stop the process using port ${PORT}`);
    console.error(`  Solution 2: Use a different port: PORT=3001 npm run server\n`);
  } else if (err.code === 'EPERM') {
    console.error(`\n✗ Permission denied to bind to port ${PORT}`);
    console.error(`  Solution: Use a different port: PORT=3001 npm run server\n`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
