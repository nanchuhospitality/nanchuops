const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all items
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.query(
      `SELECT 
        i.*,
        ig.name as group_name,
        u.name as unit_name,
        u.abbreviation as unit_abbreviation
      FROM items i
      LEFT JOIN item_groups ig ON i.group_id = ig.id
      LEFT JOIN units u ON i.unit_id = u.id
      ORDER BY i.name`
    );
    res.json({ items: result.rows || [] });
  } catch (error) {
    console.error('Error in GET /api/items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// Get item by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const result = await db.query(
      `SELECT 
        i.*,
        ig.name as group_name,
        u.name as unit_name,
        u.abbreviation as unit_abbreviation
      FROM items i
      LEFT JOIN item_groups ig ON i.group_id = ig.id
      LEFT JOIN units u ON i.unit_id = u.id
      WHERE i.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Error in GET /api/items/:id:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// Create new item (admin only)
router.post(
  '/',
  authenticateToken,
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Item name is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }
      
      const db = getDb();
      const { name, description, unit_price, group_id, unit_id } = req.body;
      
      // Insert new item
      const insertResult = await db.query(
        'INSERT INTO items (name, description, unit_price, group_id, unit_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [
          name,
          description || null,
          unit_price || 0,
          group_id || null,
          unit_id || null
        ]
      );

      // Fetch the created item with joins
      const itemResult = await db.query(
        `SELECT 
          i.*,
          ig.name as group_name,
          u.name as unit_name,
          u.abbreviation as unit_abbreviation
        FROM items i
        LEFT JOIN item_groups ig ON i.group_id = ig.id
        LEFT JOIN units u ON i.unit_id = u.id
        WHERE i.id = $1`,
        [insertResult.rows[0].id]
      );
      
      res.status(201).json({
        message: 'Item created successfully',
        item: itemResult.rows[0]
      });
    } catch (error) {
      console.error('Error in POST /api/items:', error);
      res.status(500).json({ error: 'Failed to create item' });
    }
  }
);

// Update item (admin only)
router.put(
  '/:id',
  authenticateToken,
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Item name is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }
      
      const db = getDb();
      const { id } = req.params;
      const { name, description, unit_price, group_id, unit_id } = req.body;
      
      // Check if item exists
      const itemResult = await db.query('SELECT id FROM items WHERE id = $1', [id]);
      
      if (itemResult.rows.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }
      
      // Update item
      const updateResult = await db.query(
        'UPDATE items SET name = $1, description = $2, unit_price = $3, group_id = $4, unit_id = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6',
        [
          name,
          description || null,
          unit_price || 0,
          group_id || null,
          unit_id || null,
          id
        ]
      );
      
      if (updateResult.rowCount === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }
      
      // Fetch the updated item with joins
      const updatedItemResult = await db.query(
        `SELECT 
          i.*,
          ig.name as group_name,
          u.name as unit_name,
          u.abbreviation as unit_abbreviation
        FROM items i
        LEFT JOIN item_groups ig ON i.group_id = ig.id
        LEFT JOIN units u ON i.unit_id = u.id
        WHERE i.id = $1`,
        [id]
      );
      
      res.json({
        message: 'Item updated successfully',
        item: updatedItemResult.rows[0]
      });
    } catch (error) {
      console.error('Error in PUT /api/items/:id:', error);
      res.status(500).json({ error: 'Failed to update item' });
    }
  }
);

// Delete item (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    // Check if item exists
    const itemResult = await db.query('SELECT id FROM items WHERE id = $1', [id]);
    
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Delete item
    const deleteResult = await db.query('DELETE FROM items WHERE id = $1', [id]);
    
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/items/:id:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;
