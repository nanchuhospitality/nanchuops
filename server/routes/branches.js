const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get branches
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const includeInactive = req.user.role === 'admin' && req.query.include_inactive === 'true';
    const result = await db.query(
      `SELECT
         b.id,
         b.name,
         b.code,
         b.is_active,
         b.created_at,
         b.updated_at,
         (SELECT COUNT(*)::int FROM employees e WHERE e.branch_id = b.id) AS total_employees,
         (SELECT COUNT(*)::int FROM employees e WHERE e.branch_id = b.id AND e.is_active = 1) AS active_employees
       FROM branches b
       ${includeInactive ? '' : 'WHERE b.is_active = true'}
       ORDER BY b.name ASC`
    );
    res.json({ branches: result.rows });
  } catch (error) {
    console.error('Error in GET /api/branches:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create branch (admin only)
router.post(
  '/',
  authenticateToken,
  [
    body('name').trim().notEmpty().withMessage('Branch name is required'),
    body('code').optional({ nullable: true }).trim(),
    body('admin_username').trim().isLength({ min: 3 }).withMessage('Admin username must be at least 3 characters'),
    body('admin_email').isEmail().withMessage('Admin email is required'),
    body('admin_password').isLength({ min: 6 }).withMessage('Admin password must be at least 6 characters'),
    body('admin_full_name').optional({ nullable: true }).trim()
  ],
  async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const db = getDb();
      const { name, code, admin_username, admin_email, admin_password, admin_full_name } = req.body;
      const client = await db.connect();
      try {
        await client.query('BEGIN');

        const existingUser = await client.query(
          'SELECT id FROM users WHERE username = $1 OR email = $2',
          [admin_username, admin_email]
        );
        if (existingUser.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Branch admin username or email already exists' });
        }

        const branchResult = await client.query(
          'INSERT INTO branches (name, code, is_active) VALUES ($1, $2, true) RETURNING id, name, code, is_active, created_at, updated_at',
          [name, code || null]
        );
        const branch = branchResult.rows[0];

        const hashedPassword = bcrypt.hashSync(admin_password, 10);
        const adminUserResult = await client.query(
          `INSERT INTO users (username, email, password, full_name, role, receives_transportation, branch_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, username, email, full_name, role, branch_id, created_at`,
          [admin_username, admin_email, hashedPassword, admin_full_name || null, 'branch_admin', 0, branch.id]
        );

        await client.query('COMMIT');
        res.status(201).json({ branch, admin_user: adminUserResult.rows[0] });
      } catch (txError) {
        await client.query('ROLLBACK');
        throw txError;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Branch name or code already exists' });
      }
      console.error('Error in POST /api/branches:', error);
      res.status(500).json({ error: 'Error creating branch' });
    }
  }
);

// Update branch (admin only)
router.put(
  '/:id',
  authenticateToken,
  [
    body('name').optional().trim().notEmpty().withMessage('Branch name cannot be empty'),
    body('code').optional({ nullable: true }).trim(),
    body('is_active').optional().isBoolean().withMessage('is_active must be true or false')
  ],
  async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const db = getDb();
      const { id } = req.params;
      const { name, code, is_active } = req.body;

      const check = await db.query('SELECT id FROM branches WHERE id = $1', [id]);
      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Branch not found' });
      }

      const updates = [];
      const values = [];
      let param = 1;

      if (name !== undefined) {
        updates.push(`name = $${param++}`);
        values.push(name);
      }
      if (code !== undefined) {
        updates.push(`code = $${param++}`);
        values.push(code || null);
      }
      if (is_active !== undefined) {
        updates.push(`is_active = $${param++}`);
        values.push(is_active);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      const query = `UPDATE branches SET ${updates.join(', ')} WHERE id = $${param} RETURNING id, name, code, is_active, created_at, updated_at`;
      const result = await db.query(query, values);
      res.json({ branch: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Branch name or code already exists' });
      }
      console.error('Error in PUT /api/branches/:id:', error);
      res.status(500).json({ error: 'Error updating branch' });
    }
  }
);

// Delete branch (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const db = getDb();
    const { id } = req.params;

    const usage = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM users WHERE branch_id = $1) AS users_count,
        (SELECT COUNT(*) FROM sales_records WHERE branch_id = $1) AS sales_count`,
      [id]
    );
    const usersCount = parseInt(usage.rows[0].users_count, 10);
    const salesCount = parseInt(usage.rows[0].sales_count, 10);

    if (usersCount > 0 || salesCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete branch with linked users or sales records. Deactivate it instead.'
      });
    }

    const result = await db.query('DELETE FROM branches WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/branches/:id:', error);
    res.status(500).json({ error: 'Error deleting branch' });
  }
});

module.exports = router;
