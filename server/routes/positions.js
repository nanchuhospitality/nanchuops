const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const UNIVERSAL_RIDER_POSITION = 'Rider';
const isRiderPosition = (name) => String(name || '').trim().toLowerCase() === 'rider';

// Get all positions
router.get('/', authenticateToken, async (req, res) => {
  try {
  const db = getDb();
    const result = await db.query('SELECT * FROM positions ORDER BY name ASC');
    res.json({ positions: result.rows });
  } catch (error) {
    console.error('Error in GET /api/positions:', error);
    res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// Get position by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
  const db = getDb();
    const result = await db.query('SELECT * FROM positions WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Position not found' });
    }
    
    res.json({ position: result.rows[0] });
  } catch (error) {
    console.error('Error in GET /api/positions/:id:', error);
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// Create new position (admin only)
router.post('/',
  authenticateToken,
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Position name is required'),
    body('description').optional().trim()
  ],
  async (req, res) => {
    try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;
    const normalizedName = String(name || '').trim();
    const db = getDb();

      if (isRiderPosition(normalizedName)) {
        const riderResult = await db.query(
          'SELECT * FROM positions WHERE LOWER(TRIM(name)) = $1 ORDER BY id ASC LIMIT 1',
          ['rider']
        );
        if (riderResult.rows.length > 0) {
          return res.status(400).json({ error: 'Universal Rider position already exists and cannot be duplicated' });
        }
      }

      const insertResult = await db.query(
        'INSERT INTO positions (name, description) VALUES ($1, $2) RETURNING id',
        [isRiderPosition(normalizedName) ? UNIVERSAL_RIDER_POSITION : normalizedName, description || null]
      );

      const positionResult = await db.query('SELECT * FROM positions WHERE id = $1', [insertResult.rows[0].id]);
      
      res.status(201).json({ position: positionResult.rows[0] });
    } catch (error) {
      console.error('Error in POST /api/positions:', error);
      if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({ error: 'Position name already exists' });
          }
      res.status(500).json({ error: 'Error creating position: ' + error.message });
          }
  }
);

// Update position (admin only)
router.put('/:id',
  authenticateToken,
  requireAdmin,
  [
    body('name').optional().trim().notEmpty().withMessage('Position name cannot be empty'),
    body('description').optional().trim()
  ],
  async (req, res) => {
    try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const db = getDb();
    const { name, description } = req.body;
    const normalizedName = name === undefined ? undefined : String(name).trim();

      const positionResult = await db.query('SELECT * FROM positions WHERE id = $1', [req.params.id]);
      
      if (positionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Position not found' });
      }
      const existingPosition = positionResult.rows[0];
      const editingRider = isRiderPosition(existingPosition.name);

      if (editingRider && normalizedName !== undefined && !isRiderPosition(normalizedName)) {
        return res.status(400).json({ error: 'Universal Rider position name cannot be changed' });
      }
      if (!editingRider && normalizedName !== undefined && isRiderPosition(normalizedName)) {
        return res.status(400).json({ error: 'Rider is a reserved universal position and cannot be reassigned' });
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        values.push(editingRider ? UNIVERSAL_RIDER_POSITION : normalizedName);
      }
      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        values.push(description);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(req.params.id);
      const query = `UPDATE positions SET ${updates.join(', ')} WHERE id = $${paramCount}`;

      await db.query(query, values);

      const updatedResult = await db.query('SELECT * FROM positions WHERE id = $1', [req.params.id]);
      
      res.json({ position: updatedResult.rows[0] });
    } catch (error) {
      console.error('Error in PUT /api/positions/:id:', error);
      if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({ error: 'Position name already exists' });
          }
      res.status(500).json({ error: 'Error updating position: ' + error.message });
          }
  }
);

// Delete position (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
  const db = getDb();

    const positionResult = await db.query('SELECT * FROM positions WHERE id = $1', [req.params.id]);
    
    if (positionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Position not found' });
    }

    if (isRiderPosition(positionResult.rows[0].name)) {
      return res.status(400).json({ error: 'Universal Rider position cannot be deleted' });
    }

    // Check if any employees are using this position
    const employeesResult = await db.query('SELECT COUNT(*) as count FROM employees WHERE post = $1', [positionResult.rows[0].name]);
    
    if (parseInt(employeesResult.rows[0].count) > 0) {
        return res.status(400).json({ 
        error: `Cannot delete position. ${employeesResult.rows[0].count} employee(s) are assigned to this position.` 
        });
      }

    await db.query('DELETE FROM positions WHERE id = $1', [req.params.id]);
    
    res.json({ message: 'Position deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/positions/:id:', error);
    res.status(500).json({ error: 'Error deleting position: ' + error.message });
  }
});

module.exports = router;
