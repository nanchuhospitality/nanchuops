const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all units
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.query('SELECT * FROM units ORDER BY name');
    res.json({ units: result.rows });
  } catch (error) {
    console.error('Error in GET /api/units:', error);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

// Get unit by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const result = await db.query('SELECT * FROM units WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json({ unit: result.rows[0] });
  } catch (error) {
    console.error('Error in GET /api/units/:id:', error);
    res.status(500).json({ error: 'Failed to fetch unit' });
  }
});

// Create new unit (admin only)
router.post(
  '/',
  authenticateToken,
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Unit name is required'),
    body('abbreviation').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }
      
      const db = getDb();
      const { name, abbreviation } = req.body;
      
      // Check if unit already exists
      const existingResult = await db.query('SELECT id FROM units WHERE name = $1', [name]);
      
      if (existingResult.rows.length > 0) {
        return res.status(400).json({ error: 'Unit already exists' });
      }
      
      // Insert new unit
      const insertResult = await db.query(
        'INSERT INTO units (name, abbreviation) VALUES ($1, $2) RETURNING id',
        [name, abbreviation || null]
      );
      
      res.status(201).json({
        message: 'Unit created successfully',
        unit: {
          id: insertResult.rows[0].id,
          name,
          abbreviation
        }
      });
    } catch (error) {
      console.error('Error in POST /api/units:', error);
      res.status(500).json({ error: 'Failed to create unit' });
    }
  }
);

// Update unit (admin only)
router.put(
  '/:id',
  authenticateToken,
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Unit name is required'),
    body('abbreviation').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }
      
      const db = getDb();
      const { id } = req.params;
      const { name, abbreviation } = req.body;
      
      // Check if unit exists
      const unitResult = await db.query('SELECT id FROM units WHERE id = $1', [id]);
      
      if (unitResult.rows.length === 0) {
        return res.status(404).json({ error: 'Unit not found' });
      }
      
      // Check if unit name already exists for another unit
      const existingResult = await db.query('SELECT id FROM units WHERE name = $1 AND id != $2', [name, id]);
      
      if (existingResult.rows.length > 0) {
        return res.status(400).json({ error: 'Unit name already exists' });
      }
      
      // Update unit
      const updateResult = await db.query(
        'UPDATE units SET name = $1, abbreviation = $2 WHERE id = $3',
        [name, abbreviation || null, id]
      );
      
      if (updateResult.rowCount === 0) {
        return res.status(404).json({ error: 'Unit not found' });
      }
      
      res.json({
        message: 'Unit updated successfully',
        unit: {
          id: parseInt(id),
          name,
          abbreviation
        }
      });
    } catch (error) {
      console.error('Error in PUT /api/units/:id:', error);
      res.status(500).json({ error: 'Failed to update unit' });
    }
  }
);

// Delete unit (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    // Check if unit exists
    const unitResult = await db.query('SELECT id FROM units WHERE id = $1', [id]);
    
    if (unitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    // Delete unit
    const deleteResult = await db.query('DELETE FROM units WHERE id = $1', [id]);
    
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json({ message: 'Unit deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/units/:id:', error);
    res.status(500).json({ error: 'Failed to delete unit' });
  }
});

module.exports = router;
