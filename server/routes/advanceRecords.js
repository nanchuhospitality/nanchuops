const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/advance-records — list with optional filters: employee_id, status, start_date, end_date
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    let query = `
      SELECT ar.*, e.name AS employee_name, e.post AS employee_post
      FROM advance_records ar
      JOIN employees e ON ar.employee_id = e.id
      WHERE 1=1
    `;
    const params = [];
    let p = 1;

    if (req.query.employee_id) {
      query += ` AND ar.employee_id = $${p++}`;
      params.push(parseInt(req.query.employee_id));
    }
    if (req.query.status) {
      query += ` AND ar.status = $${p++}`;
      params.push(req.query.status);
    }
    if (req.query.start_date) {
      query += ` AND ar.advance_date >= $${p++}`;
      params.push(req.query.start_date);
    }
    if (req.query.end_date) {
      query += ` AND ar.advance_date <= $${p++}`;
      params.push(req.query.end_date);
    }

    query += ' ORDER BY ar.advance_date DESC, ar.created_at DESC';

    const result = await db.query(query, params);
    res.json({ records: result.rows });
  } catch (error) {
    console.error('Error in GET /api/advance-records:', error);
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// POST /api/advance-records — create (admin only)
router.post('/',
  authenticateToken,
  requireAdmin,
  [
    body('employee_id').isInt({ min: 1 }).withMessage('employee_id is required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('amount must be positive'),
    body('advance_date').notEmpty().withMessage('advance_date is required'),
    body('description').optional({ values: 'falsy' }).isString()
  ],
  async (req, res) => {
    try {
      const err = validationResult(req);
      if (!err.isEmpty()) {
        return res.status(400).json({ errors: err.array() });
      }

      const { employee_id, amount, advance_date, description } = req.body;
      const db = getDb();

      const emp = await db.query(
        'SELECT id, name FROM employees WHERE id = $1 AND is_active = 1',
        [employee_id]
      );
      if (emp.rows.length === 0) {
        return res.status(400).json({ error: 'Employee not found or inactive' });
      }

      const ins = await db.query(
        `INSERT INTO advance_records (employee_id, amount, advance_date, description, status, created_by)
         VALUES ($1, $2, $3, $4, 'pending', $5)
         RETURNING id, employee_id, amount, advance_date, description, status, created_at`,
        [employee_id, parseFloat(amount), String(advance_date).trim(), description || null, req.user?.id || null]
      );

      res.status(201).json({
        message: 'Advance record created',
        record: { ...ins.rows[0], employee_name: emp.rows[0].name }
      });
    } catch (error) {
      console.error('Error in POST /api/advance-records:', error);
      res.status(500).json({ error: 'Database error: ' + error.message });
    }
  }
);

// PUT /api/advance-records/:id/status — update status (admin): 'deducted' | 'repaid' | 'cancelled'
// For 'cancelled', body.password (admin password) is required.
router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, password } = req.body;
    const allowed = ['deducted', 'repaid', 'cancelled'];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ error: 'status must be one of: deducted, repaid, cancelled' });
    }

    if (status === 'cancelled') {
      if (!password || typeof password !== 'string' || !password.trim()) {
        return res.status(400).json({ error: 'Admin password is required to cancel an advance.' });
      }
      const db = getDb();
      const u = await db.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
      if (u.rows.length === 0) {
        return res.status(401).json({ error: 'User not found.' });
      }
      if (!bcrypt.compareSync(password.trim(), u.rows[0].password)) {
        return res.status(403).json({ error: 'Invalid password.' });
      }
    }

    const db = getDb();
    const up = await db.query(
      `UPDATE advance_records SET status = $1
       WHERE id = $2 RETURNING id, employee_id, amount, advance_date, description, status, created_at`,
      [status, id]
    );
    if (up.rows.length === 0) {
      return res.status(404).json({ error: 'Advance record not found' });
    }

    const rec = up.rows[0];
    const emp = await db.query('SELECT name FROM employees WHERE id = $1', [rec.employee_id]);
    res.json({
      message: 'Status updated',
      record: { ...rec, employee_name: emp.rows[0]?.name }
    });
  } catch (error) {
    console.error('Error in PUT /api/advance-records/:id/status:', error);
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

module.exports = router;
