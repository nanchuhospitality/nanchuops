const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all groups
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.query('SELECT * FROM item_groups ORDER BY name');
    res.json({ groups: result.rows });
  } catch (error) {
    console.error('Error in GET /api/groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get group by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const result = await db.query('SELECT * FROM item_groups WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json({ group: result.rows[0] });
  } catch (error) {
    console.error('Error in GET /api/groups/:id:', error);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

// Create new group (admin only)
router.post(
  '/',
  authenticateToken,
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Group name is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }
      
      const db = getDb();
      const { name, description } = req.body;
      
      // Check if group already exists
      const existingResult = await db.query('SELECT id FROM item_groups WHERE name = $1', [name]);
      
      if (existingResult.rows.length > 0) {
        return res.status(400).json({ error: 'Group already exists' });
      }
      
      // Insert new group
      const insertResult = await db.query(
        'INSERT INTO item_groups (name, description) VALUES ($1, $2) RETURNING id',
        [name, description || null]
      );
      
      res.status(201).json({
        message: 'Group created successfully',
        group: {
          id: insertResult.rows[0].id,
          name,
          description
        }
      });
    } catch (error) {
      console.error('Error in POST /api/groups:', error);
      res.status(500).json({ error: 'Failed to create group' });
    }
  }
);

// Update group (admin only)
router.put(
  '/:id',
  authenticateToken,
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Group name is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }
      
      const db = getDb();
      const { id } = req.params;
      const { name, description } = req.body;
      
      // Check if group exists
      const groupResult = await db.query('SELECT id FROM item_groups WHERE id = $1', [id]);
      
      if (groupResult.rows.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }
      
      // Check if group name already exists for another group
      const existingResult = await db.query('SELECT id FROM item_groups WHERE name = $1 AND id != $2', [name, id]);
      
      if (existingResult.rows.length > 0) {
        return res.status(400).json({ error: 'Group name already exists' });
      }
      
      // Update group
      const updateResult = await db.query(
        'UPDATE item_groups SET name = $1, description = $2 WHERE id = $3',
        [name, description || null, id]
      );
      
      if (updateResult.rowCount === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }
      
      res.json({
        message: 'Group updated successfully',
        group: {
          id: parseInt(id),
          name,
          description
        }
      });
    } catch (error) {
      console.error('Error in PUT /api/groups/:id:', error);
      res.status(500).json({ error: 'Failed to update group' });
    }
  }
);

// Delete group (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    // Check if group exists
    const groupResult = await db.query('SELECT id FROM item_groups WHERE id = $1', [id]);
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Delete group
    const deleteResult = await db.query('DELETE FROM item_groups WHERE id = $1', [id]);
    
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/groups/:id:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

module.exports = router;
