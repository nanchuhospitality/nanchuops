const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  return 'your-secret-key-change-in-production';
})();

const BRANCH_ADMIN_ALLOWED_ROLES = ['employee', 'night_manager', 'rider_incharge'];

const canManageUsers = (role) => role === 'admin' || role === 'branch_admin';

const normalizeRoleInput = (role) => {
  if (!role) return role;
  const normalized = String(role).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'night_manager' || normalized === 'nightmanager' || normalized === 'rider_incharge') {
    return 'night_manager';
  }
  if (normalized === 'branch_admin' || normalized === 'branchadmin') {
    return 'branch_admin';
  }
  if (normalized === 'employee' || normalized === 'admin') {
    return normalized;
  }
  return role;
};

const normalizeRoleOutput = (role) => (role === 'rider_incharge' ? 'night_manager' : role);

// Register new user (admin or branch admin)
router.post('/register',
  authenticateToken,
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('full_name').optional().trim(),
    body('branch_id').optional({ nullable: true }).isInt().withMessage('Branch ID must be an integer')
  ],
  async (req, res) => {
    try {
    if (!canManageUsers(req.user.role)) {
      return res.status(403).json({ error: 'Only admin or branch admin can register new users' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, full_name, role, branch_id } = req.body;
    const normalizedRole = normalizeRoleInput(role);
    const db = getDb();
    let effectiveRole = normalizedRole || 'employee';
    let effectiveBranchId = (branch_id === undefined || branch_id === '' || branch_id === null)
      ? null
      : parseInt(branch_id, 10);

    if (req.user.role === 'branch_admin') {
      if (!req.user.branch_id) {
        return res.status(400).json({ error: 'Branch admin must belong to a branch' });
      }

      if (!BRANCH_ADMIN_ALLOWED_ROLES.includes(effectiveRole)) {
        return res.status(403).json({ error: 'Branch admin can only create employee or night manager users' });
      }

      effectiveBranchId = req.user.branch_id;
    }

    // Check if user already exists
      const existingUser = await db.query(
        'SELECT * FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Username or email already exists' });
      }

      // Validate branch if provided
      if (effectiveBranchId !== null) {
        const branchCheck = await db.query('SELECT id FROM branches WHERE id = $1 AND is_active = true', [effectiveBranchId]);
        if (branchCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Selected branch not found or inactive' });
        }
      }

      // Hash password and create user
      const hashedPassword = bcrypt.hashSync(password, 10);
      const receivesTransportation = req.body.receives_transportation ? 1 : 0;
      
      const result = await db.query(
        'INSERT INTO users (username, email, password, full_name, role, receives_transportation, branch_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [username, email, hashedPassword, full_name || null, effectiveRole, receivesTransportation, effectiveBranchId]
      );

          res.status(201).json({
            message: 'User created successfully',
            user: {
          id: result.rows[0].id,
              username,
              email,
              full_name,
              role: effectiveRole,
              branch_id: effectiveBranchId
            }
          });
    } catch (error) {
      console.error('Error in register route:', error);
      res.status(500).json({ error: 'Error creating user' });
        }
  }
);

// Login
router.post('/login',
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const db = getDb();
      
      if (!db) {
        console.error('Database connection is null');
        return res.status(500).json({ error: 'Database connection failed' });
      }

      const result = await db.query(
        `SELECT u.*, b.name AS branch_name, b.code AS branch_code
         FROM users u
         LEFT JOIN branches b ON u.branch_id = b.id
         WHERE u.username = $1`,
        [username]
      );
      
      if (result.rows.length === 0) {
          return res.status(401).json({ error: 'Invalid username or password' });
        }

      const user = result.rows[0];

        try {
          if (!bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Invalid username or password' });
          }
        } catch (bcryptErr) {
          console.error('Bcrypt error:', bcryptErr);
          return res.status(500).json({ error: 'Password verification failed' });
        }

        try {
          const userRole = normalizeRoleOutput(user.role);
          const token = jwt.sign(
            { id: user.id, username: user.username, role: userRole, branch_id: user.branch_id || null, branch_code: user.branch_code || null },
            JWT_SECRET,
            { expiresIn: '24h' }
          );

          res.json({
            token,
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              full_name: user.full_name,
              role: userRole,
              branch_id: user.branch_id || null,
              branch_name: user.branch_name || null,
              branch_code: user.branch_code || null
            }
          });
        } catch (jwtErr) {
          console.error('JWT error:', jwtErr);
          return res.status(500).json({ error: 'Token generation failed' });
        }
    } catch (error) {
      console.error('Unexpected error in login route:', error);
      console.error('Error stack:', error.stack);
      return res.status(500).json({ error: 'Login failed: ' + error.message });
    }
  }
);

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
  const db = getDb();
    const result = await db.query(
      `SELECT u.id, u.username, u.email, u.full_name, u.role, u.branch_id, b.name AS branch_name, b.code AS branch_code
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    user.role = normalizeRoleOutput(user.role);
    res.json({ user });
  } catch (error) {
    console.error('Error in /me route:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get all users (admin or branch admin)
router.get('/users', authenticateToken, async (req, res) => {
  try {
  const db = getDb();
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(
        `SELECT u.id, u.username, u.email, u.full_name, u.role, u.receives_transportation, u.created_at, u.branch_id, b.name AS branch_name
         FROM users u
         LEFT JOIN branches b ON u.branch_id = b.id
         ORDER BY u.created_at DESC`
      );
    } else if (req.user.role === 'branch_admin') {
      if (!req.user.branch_id) {
        return res.status(400).json({ error: 'Branch admin must belong to a branch' });
      }
      result = await db.query(
        `SELECT u.id, u.username, u.email, u.full_name, u.role, u.receives_transportation, u.created_at, u.branch_id, b.name AS branch_name
         FROM users u
         LEFT JOIN branches b ON u.branch_id = b.id
         WHERE u.branch_id = $1 AND u.role != 'admin'
         ORDER BY u.created_at DESC`,
        [req.user.branch_id]
      );
    } else {
      return res.status(403).json({ error: 'Admin or branch admin access required' });
    }
    
    const users = result.rows.map((u) => ({
      ...u,
      role: normalizeRoleOutput(u.role)
    }));
    res.json({ users });
  } catch (error) {
    console.error('Error in GET /users route:', error);
    res.status(500).json({ error: 'Database error' });
    }
});

// Update user transportation status (admin only)
router.put('/users/:id/transportation', authenticateToken, async (req, res) => {
  try {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { receives_transportation } = req.body;
  const db = getDb();

    await db.query(
      'UPDATE users SET receives_transportation = $1 WHERE id = $2',
      [receives_transportation ? 1 : 0, req.params.id]
    );
    
      res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error in PUT /users/:id/transportation route:', error);
    res.status(500).json({ error: 'Error updating user' });
    }
});

// Update user (admin or branch admin)
router.put('/users/:id',
  authenticateToken,
  [
    body('username').optional().trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').optional().isEmail().withMessage('Invalid email'),
    body('full_name').optional().trim(),
    body('branch_id').optional({ nullable: true }).isInt().withMessage('Branch ID must be an integer')
  ],
  async (req, res) => {
    try {
    if (!canManageUsers(req.user.role)) {
      return res.status(403).json({ error: 'Admin or branch admin access required' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, full_name, role, password, branch_id } = req.body;
    const normalizedRole = normalizeRoleInput(role);
    const db = getDb();

    // Check if user exists
      const userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];
      let effectiveBranchId = branch_id;

      if (req.user.role === 'branch_admin') {
        if (!req.user.branch_id) {
          return res.status(400).json({ error: 'Branch admin must belong to a branch' });
        }

        if (user.branch_id !== req.user.branch_id) {
          return res.status(403).json({ error: 'You can only update users in your own branch' });
        }

        if (!BRANCH_ADMIN_ALLOWED_ROLES.includes(user.role)) {
          return res.status(403).json({ error: 'You can only update employee or night manager users' });
        }

        if (normalizedRole && !BRANCH_ADMIN_ALLOWED_ROLES.includes(normalizedRole)) {
          return res.status(403).json({ error: 'Branch admin can only assign employee or night manager roles' });
        }

        if (branch_id !== undefined && branch_id !== null && branch_id !== '' && parseInt(branch_id, 10) !== req.user.branch_id) {
          return res.status(403).json({ error: 'Branch admin cannot move users to another branch' });
        }

        effectiveBranchId = req.user.branch_id;
      }

      // Check if username or email already exists (excluding current user)
      if (username || email) {
        const existingResult = await db.query(
          'SELECT * FROM users WHERE (username = $1 OR email = $2) AND id != $3',
          [username || user.username, email || user.email, req.params.id]
        );
        
        if (existingResult.rows.length > 0) {
            return res.status(400).json({ error: 'Username or email already exists' });
          }
      }

      if (effectiveBranchId !== undefined && effectiveBranchId !== null && effectiveBranchId !== '') {
        const parsedBranchId = parseInt(effectiveBranchId, 10);
        const branchCheck = await db.query('SELECT id FROM branches WHERE id = $1 AND is_active = true', [parsedBranchId]);
        if (branchCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Selected branch not found or inactive' });
        }
        effectiveBranchId = parsedBranchId;
      }

        const updates = [];
        const values = [];
      let paramCount = 1;

        if (username) {
        updates.push(`username = $${paramCount++}`);
          values.push(username);
        }
        if (email) {
        updates.push(`email = $${paramCount++}`);
          values.push(email);
        }
        if (full_name !== undefined) {
        updates.push(`full_name = $${paramCount++}`);
          values.push(full_name || null);
        }
        if (normalizedRole) {
        updates.push(`role = $${paramCount++}`);
          values.push(normalizedRole);
        }
        if (effectiveBranchId !== undefined) {
          updates.push(`branch_id = $${paramCount++}`);
          values.push(effectiveBranchId || null);
        }
        if (password) {
          const hashedPassword = bcrypt.hashSync(password, 10);
        updates.push(`password = $${paramCount++}`);
          values.push(hashedPassword);
        }

        if (updates.length === 0) {
          return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(req.params.id);
      const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`;

      await db.query(query, values);

      const updatedResult = await db.query(
        `SELECT u.id, u.username, u.email, u.full_name, u.role, u.receives_transportation, u.created_at, u.branch_id, b.name AS branch_name
         FROM users u
         LEFT JOIN branches b ON u.branch_id = b.id
         WHERE u.id = $1`,
        [req.params.id]
      );

      const updatedUser = updatedResult.rows[0];
      updatedUser.role = normalizeRoleOutput(updatedUser.role);
      res.json({ message: 'User updated successfully', user: updatedUser });
    } catch (error) {
      console.error('Error in PUT /users/:id route:', error);
      res.status(500).json({ error: 'Error updating user' });
    }
  }
);

// Delete user (admin or branch admin)
router.delete('/users/:id', authenticateToken, async (req, res) => {
  try {
  if (!canManageUsers(req.user.role)) {
    return res.status(403).json({ error: 'Admin or branch admin access required' });
  }

  // Prevent deleting yourself
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const db = getDb();

  // Check if user exists
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (req.user.role === 'branch_admin') {
      if (!req.user.branch_id) {
        return res.status(400).json({ error: 'Branch admin must belong to a branch' });
      }
      const target = userResult.rows[0];
      if (target.branch_id !== req.user.branch_id) {
        return res.status(403).json({ error: 'You can only delete users in your own branch' });
      }
      if (!BRANCH_ADMIN_ALLOWED_ROLES.includes(target.role)) {
        return res.status(403).json({ error: 'You can only delete employee or night manager users' });
      }
    }

    await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /users/:id route:', error);
    res.status(500).json({ error: 'Error deleting user' });
      }
});

// Get transportation recipients
router.get('/transportation-recipients', authenticateToken, async (req, res) => {
  try {
  const db = getDb();
    const result = await db.query(
      'SELECT id, username, full_name FROM users WHERE receives_transportation = 1 ORDER BY full_name, username'
    );
    
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error in GET /transportation-recipients route:', error);
    res.status(500).json({ error: 'Database error' });
      }
});

module.exports = router;
