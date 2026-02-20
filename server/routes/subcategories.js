const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Helper function to check if subcategory has any ledger entries
const hasLedgerEntriesForSubcategory = async (db, subcategoryId) => {
  try {
    // First get the subcategory name and parent_subcategory_id to determine if it's a ledger group
    const subcategoryResult = await db.query(
      'SELECT name, parent_subcategory_id FROM subcategories WHERE id = $1',
      [subcategoryId]
    );
    
    if (subcategoryResult.rows.length === 0) {
      return false;
    }
    
    const subcategoryName = subcategoryResult.rows[0].name;
    const isLedgerGroup = subcategoryResult.rows[0].parent_subcategory_id !== null;
    
    // If it's a ledger group, check if any accounts use it in ledger_group column
    // Once all accounts under a ledger group are deleted, the ledger group becomes editable/deletable
    if (isLedgerGroup) {
      const ledgerGroupResult = await db.query(
        'SELECT COUNT(*) as count FROM chart_of_accounts WHERE ledger_group = $1',
        [subcategoryName]
      );
      
      const accountCount = parseInt(ledgerGroupResult.rows[0].count);
      
      // If any accounts currently use this ledger group, lock it
      if (accountCount > 0) {
        return true;
      }
      
      // If no accounts use this ledger group, it's unlocked (can be edited/deleted)
      // No need to check journal entries since accounts don't exist
      return false;
    } else {
      // For top-level subcategories, check subcategory column
      const subcategoryResult_check = await db.query(
        'SELECT COUNT(*) as count FROM chart_of_accounts WHERE subcategory = $1',
        [subcategoryName]
      );
      
      // If any accounts use this subcategory, lock it
      if (parseInt(subcategoryResult_check.rows[0].count) > 0) {
        return true;
      }
    }
    
    // Check if any accounts with this subcategory/ledger group have journal entry lines
    const journalResult = await db.query(
      `SELECT COUNT(*) as count FROM journal_entry_lines jel
       INNER JOIN chart_of_accounts ca ON jel.account_id = ca.id
       WHERE ${isLedgerGroup ? 'ca.ledger_group' : 'ca.subcategory'} = $1`,
      [subcategoryName]
    );
    
    if (parseInt(journalResult.rows[0].count) > 0) {
      return true;
    }
    
    // Check purchase_account_id
    const purchaseResult1 = await db.query(
      `SELECT COUNT(*) as count FROM purchases_records pr
       INNER JOIN chart_of_accounts ca ON pr.purchase_account_id = ca.id
       WHERE ${isLedgerGroup ? 'ca.ledger_group' : 'ca.subcategory'} = $1`,
      [subcategoryName]
    );
    
    if (parseInt(purchaseResult1.rows[0].count) > 0) {
      return true;
    }
    
    // Check payment_account_id
    const purchaseResult2 = await db.query(
      `SELECT COUNT(*) as count FROM purchases_records pr
       INNER JOIN chart_of_accounts ca ON pr.payment_account_id = ca.id
       WHERE ${isLedgerGroup ? 'ca.ledger_group' : 'ca.subcategory'} = $1`,
      [subcategoryName]
    );
    
    if (parseInt(purchaseResult2.rows[0].count) > 0) {
      return true;
    }
    
    // Check supplier_id
    const purchaseResult3 = await db.query(
      `SELECT COUNT(*) as count FROM purchases_records pr
       INNER JOIN chart_of_accounts ca ON pr.supplier_id = ca.id
       WHERE ${isLedgerGroup ? 'ca.ledger_group' : 'ca.subcategory'} = $1`,
      [subcategoryName]
    );
    
    if (parseInt(purchaseResult3.rows[0].count) > 0) {
      return true;
    }
    
    return false;
  } catch (error) {
    throw error;
  }
};

// Get all subcategories
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { category } = req.query;
    
    let query = 'SELECT * FROM subcategories';
    const params = [];
    
    if (category) {
      query += ' WHERE category = $1';
      params.push(category);
    }
    
    query += ' ORDER BY category, name';
    
    const result = await db.query(query, params);
    
    // Check ledger entries for each subcategory
    const subcategoriesWithFlag = await Promise.all(
      result.rows.map(async (subcategory) => {
        try {
          const hasEntries = await hasLedgerEntriesForSubcategory(db, subcategory.id);
          return {
            ...subcategory,
            has_ledger_entries: hasEntries
          };
        } catch (err) {
          console.error(`Error checking ledger entries for subcategory ${subcategory.id}:`, err);
          return {
            ...subcategory,
            has_ledger_entries: false
          };
        }
      })
    );
    
    res.json({ subcategories: subcategoriesWithFlag });
  } catch (error) {
    console.error('Error in GET /api/subcategories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get subcategory by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const result = await db.query(
      'SELECT * FROM subcategories WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    res.json({ subcategory: result.rows[0] });
  } catch (error) {
    console.error('Error in GET /api/subcategories/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new subcategory (admin only)
router.post(
  '/',
  authenticateToken,
  requireAdmin,
  [
    body('category').isIn(['asset', 'liability', 'equity', 'income', 'expense']).withMessage('Invalid category'),
    body('name').trim().notEmpty().withMessage('Subcategory name is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }
      
      const db = getDb();
      const { category, name, parent_subcategory_id } = req.body;
      
      // If parent_subcategory_id is provided, validate it exists and belongs to the same category
      if (parent_subcategory_id) {
        const parentCheck = await db.query(
          'SELECT id, category FROM subcategories WHERE id = $1',
          [parent_subcategory_id]
        );
        if (parentCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Parent subcategory not found' });
        }
        if (parentCheck.rows[0].category !== category) {
          return res.status(400).json({ error: 'Parent subcategory must belong to the same category' });
        }
      }

      // Check if subcategory already exists for this category (considering parent if provided)
      const existingResult = await db.query(
        'SELECT id FROM subcategories WHERE category = $1 AND name = $2 AND COALESCE(parent_subcategory_id, 0) = COALESCE($3, 0)',
        [category, name, parent_subcategory_id || null]
      );
      
      if (existingResult.rows.length > 0) {
        return res.status(400).json({ error: 'Subcategory already exists for this category' });
      }
      
      // Insert new subcategory - user-created items should have is_system = 0
      const insertResult = await db.query(
        'INSERT INTO subcategories (category, name, parent_subcategory_id, is_system) VALUES ($1, $2, $3, $4) RETURNING id',
        [category, name, parent_subcategory_id || null, 0]
      );
      
      res.status(201).json({
        message: 'Subcategory created successfully',
        subcategory: {
          id: insertResult.rows[0].id,
          category,
          name
        }
      });
    } catch (error) {
      console.error('Error in POST /api/subcategories:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Update subcategory (admin only)
router.put(
  '/:id',
  authenticateToken,
  requireAdmin,
  [
    body('category').isIn(['asset', 'liability', 'equity', 'income', 'expense']).withMessage('Invalid category'),
    body('name').trim().notEmpty().withMessage('Subcategory name is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }
      
      const db = getDb();
      const { id } = req.params;
      const { category, name, parent_subcategory_id } = req.body;
      
      // If parent_subcategory_id is provided, validate it exists and belongs to the same category
      if (parent_subcategory_id) {
        const parentCheck = await db.query(
          'SELECT id, category FROM subcategories WHERE id = $1',
          [parent_subcategory_id]
        );
        if (parentCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Parent subcategory not found' });
        }
        if (parentCheck.rows[0].category !== category) {
          return res.status(400).json({ error: 'Parent subcategory must belong to the same category' });
        }
        // Prevent circular references - ensure parent is not the current subcategory
        if (parseInt(parent_subcategory_id) === parseInt(id)) {
          return res.status(400).json({ error: 'A subcategory cannot be its own parent' });
        }
      }
      
      // Check if subcategory exists
      const subcategoryResult = await db.query(
        'SELECT id, is_system FROM subcategories WHERE id = $1',
        [id]
      );
      
      if (subcategoryResult.rows.length === 0) {
        return res.status(404).json({ error: 'Subcategory not found' });
      }
      
      const subcategory = subcategoryResult.rows[0];
      
      // Prevent editing of system subcategories
      if (subcategory.is_system === 1 || subcategory.is_system === true) {
        return res.status(400).json({ error: 'Cannot edit system subcategory. This is a default subcategory that cannot be modified.' });
      }
      
      // Check if subcategory has ledger entries
      const hasEntries = await hasLedgerEntriesForSubcategory(db, id);
      
      if (hasEntries) {
        return res.status(400).json({ 
          error: 'Cannot edit subcategory with posted ledger entries. Subcategories used by accounts with transactions cannot be modified to maintain data integrity.' 
        });
      }
      
      // Check if subcategory name already exists for this category and parent (excluding current)
      const existingResult = await db.query(
        'SELECT id FROM subcategories WHERE category = $1 AND name = $2 AND COALESCE(parent_subcategory_id, 0) = COALESCE($3, 0) AND id != $4',
        [category, name, parent_subcategory_id || null, id]
      );
      
      if (existingResult.rows.length > 0) {
        return res.status(400).json({ error: 'Subcategory name already exists for this category and parent' });
      }
      
      // Update subcategory
      const updateResult = await db.query(
        'UPDATE subcategories SET category = $1, name = $2, parent_subcategory_id = $3 WHERE id = $4',
        [category, name, parent_subcategory_id || null, id]
      );
      
      if (updateResult.rowCount === 0) {
        return res.status(404).json({ error: 'Subcategory not found' });
      }
      
      res.json({
        message: 'Subcategory updated successfully',
        subcategory: {
          id: parseInt(id),
          category,
          name
        }
      });
    } catch (error) {
      console.error('Error in PUT /api/subcategories/:id:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Delete subcategory (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    // Check if subcategory exists
    const subcategoryResult = await db.query(
      'SELECT id, is_system FROM subcategories WHERE id = $1',
      [id]
    );
    
    if (subcategoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    const subcategory = subcategoryResult.rows[0];
    
    // Prevent deletion of system subcategories
    if (subcategory.is_system === 1 || subcategory.is_system === true) {
      return res.status(400).json({ error: 'Cannot delete system subcategory. This is a default subcategory that cannot be removed.' });
    }
    
    // Check if subcategory has ledger entries
    const hasEntries = await hasLedgerEntriesForSubcategory(db, id);
    
    if (hasEntries) {
      return res.status(400).json({ 
        error: 'Cannot delete subcategory with posted ledger entries. Subcategories used by accounts with transactions cannot be deleted to maintain data integrity.' 
      });
    }
    
    // Delete subcategory
    const deleteResult = await db.query(
      'DELETE FROM subcategories WHERE id = $1',
      [id]
    );
    
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    res.json({ message: 'Subcategory deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/subcategories/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
