const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Helper function to check if account has any ledger entries
const hasLedgerEntries = async (db, accountId) => {
  try {
    // Check journal entry lines
    const journalResult = await db.query(
      'SELECT COUNT(*) as count FROM journal_entry_lines WHERE account_id = $1',
      [accountId]
    );
    
    if (parseInt(journalResult.rows[0].count) > 0) {
      return true;
    }
    
    // Check purchases records
    const purchasesResult = await db.query(
      `SELECT COUNT(*) as count FROM purchases_records 
       WHERE purchase_account_id = $1 OR payment_account_id = $1 OR supplier_id = $1`,
      [accountId]
    );
    
    return parseInt(purchasesResult.rows[0].count) > 0;
  } catch (error) {
    throw error;
  }
};

// Helper function to get category prefix
const getCategoryPrefix = (category) => {
  const prefixes = {
    'asset': 1,
    'liability': 2,
    'equity': 3,
    'income': 4,
    'expense': 5
  };
  return prefixes[category] || 1;
};

// Helper function to generate next account code for a category
const generateAccountCode = async (db, category) => {
  const prefix = getCategoryPrefix(category);
  const prefixStr = prefix.toString();
  
  // Find the highest account code for this category
  const result = await db.query(
    `SELECT account_code FROM chart_of_accounts 
     WHERE category = $1 AND account_code LIKE $2 
     ORDER BY CAST(account_code AS INTEGER) DESC 
     LIMIT 1`,
    [category, prefixStr + '%']
  );
  
  let nextNumber = 1;
  
  if (result.rows.length > 0) {
    const lastCode = result.rows[0].account_code;
    const lastNumber = parseInt(lastCode.substring(prefixStr.length)) || 0;
    nextNumber = lastNumber + 1;
  }
  
  // Generate code: prefix + 3-digit number (e.g., 1001, 2001, 6001)
  return prefixStr + String(nextNumber).padStart(3, '0');
};

// Get all accounts
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    
    const result = await db.query(
      `SELECT ca.*,
              CASE 
                WHEN EXISTS (
                  SELECT 1 FROM journal_entry_lines WHERE account_id = ca.id
                  UNION
                  SELECT 1 FROM purchases_records WHERE purchase_account_id = ca.id OR payment_account_id = ca.id OR supplier_id = ca.id
                ) THEN 1
                ELSE 0
              END as has_ledger_entries
       FROM chart_of_accounts ca
       ORDER BY ca.category, ca.account_code`
    );
    
    // Convert has_ledger_entries to boolean
    const accountsWithFlag = result.rows.map(account => ({
      ...account,
      has_ledger_entries: account.has_ledger_entries === 1 || account.has_ledger_entries === true
    }));
    
    res.json({ accounts: accountsWithFlag });
  } catch (error) {
    console.error('Error in GET /api/chart-of-accounts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get account by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const result = await db.query(
      'SELECT * FROM chart_of_accounts WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json({ account: result.rows[0] });
  } catch (error) {
    console.error('Error in GET /api/chart-of-accounts/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new account (admin only)
router.post(
  '/',
  authenticateToken,
  requireAdmin,
  [
    body('account_name').trim().notEmpty().withMessage('Account name is required'),
    body('account_code').optional().trim(),
    body('category').isIn(['asset', 'liability', 'equity', 'income', 'expense']).withMessage('Invalid category'),
    body('subcategory').optional().trim(),
    body('ledger_group').optional().trim(),
    body('opening_balance').optional().isFloat().withMessage('Opening balance must be a number'),
    body('description').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }
      
      const db = getDb();
      const { account_name, account_code, category, subcategory, ledger_group, opening_balance, description } = req.body;
      
      // Generate account code if not provided
      let finalAccountCode = account_code && account_code.trim() !== '' ? account_code : null;
      
      if (!finalAccountCode) {
        try {
          finalAccountCode = await generateAccountCode(db, category);
        } catch (err) {
          console.error('Error generating account code:', err);
          return res.status(500).json({ error: 'Failed to generate account code' });
        }
      }
      
      // Check if account code already exists
      const existingResult = await db.query(
        'SELECT id FROM chart_of_accounts WHERE account_code = $1',
        [finalAccountCode]
      );
      
      if (existingResult.rows.length > 0) {
        return res.status(400).json({ error: 'Account code already exists' });
      }
      
      // Insert new account
      const openingBalance = opening_balance ? parseFloat(opening_balance) : 0;
      const insertResult = await db.query(
        'INSERT INTO chart_of_accounts (account_name, account_code, category, subcategory, ledger_group, opening_balance, description) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [account_name, finalAccountCode, category, subcategory || null, ledger_group || null, openingBalance, description || null]
      );
      
      res.status(201).json({
        message: 'Account created successfully',
        account: {
          id: insertResult.rows[0].id,
          account_name,
          account_code: finalAccountCode,
          category,
          subcategory,
          opening_balance: openingBalance,
          description
        }
      });
    } catch (error) {
      console.error('Error in POST /api/chart-of-accounts:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Update account (admin only)
router.put(
  '/:id',
  authenticateToken,
  requireAdmin,
  [
    body('account_name').trim().notEmpty().withMessage('Account name is required'),
    body('account_code').trim().notEmpty().withMessage('Account code is required'),
    body('category').isIn(['asset', 'liability', 'equity', 'income', 'expense']).withMessage('Invalid category'),
    body('subcategory').optional().trim(),
    body('ledger_group').optional().trim(),
    body('opening_balance').optional().isFloat().withMessage('Opening balance must be a number'),
    body('description').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }
      
      const db = getDb();
      const { id } = req.params;
      const { account_name, account_code, category, subcategory, ledger_group, opening_balance, description } = req.body;
      
      // Check if account exists
      const accountResult = await db.query(
        'SELECT id FROM chart_of_accounts WHERE id = $1',
        [id]
      );
      
      if (accountResult.rows.length === 0) {
        return res.status(404).json({ error: 'Account not found' });
      }
      
      // Check if account has ledger entries - if yes, restrict editing
      const hasEntries = await hasLedgerEntries(db, id);
      
      if (hasEntries) {
        return res.status(400).json({ 
          error: 'Cannot edit account with posted ledger entries. Accounts with transactions cannot be modified to maintain data integrity.' 
        });
      }
      
      // Check if account code already exists for another account
      const existingResult = await db.query(
        'SELECT id FROM chart_of_accounts WHERE account_code = $1 AND id != $2',
        [account_code, id]
      );
      
      if (existingResult.rows.length > 0) {
        return res.status(400).json({ error: 'Account code already exists' });
      }
      
      // Update account
      const openingBalance = opening_balance ? parseFloat(opening_balance) : 0;
      const updateResult = await db.query(
        'UPDATE chart_of_accounts SET account_name = $1, account_code = $2, category = $3, subcategory = $4, ledger_group = $5, opening_balance = $6, description = $7 WHERE id = $8',
        [account_name, account_code, category, subcategory || null, ledger_group || null, openingBalance, description || null, id]
      );
      
      if (updateResult.rowCount === 0) {
        return res.status(404).json({ error: 'Account not found' });
      }
      
      res.json({
        message: 'Account updated successfully',
        account: {
          id: parseInt(id),
          account_name,
          account_code,
          category,
          subcategory,
          opening_balance: openingBalance,
          description
        }
      });
    } catch (error) {
      console.error('Error in PUT /api/chart-of-accounts/:id:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Delete account (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    // Check if account exists
    const accountResult = await db.query(
      'SELECT id FROM chart_of_accounts WHERE id = $1',
      [id]
    );
    
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    // Check if account has ledger entries - if yes, restrict deletion
    const hasEntries = await hasLedgerEntries(db, id);
    
    if (hasEntries) {
      return res.status(400).json({ 
        error: 'Cannot delete account with posted ledger entries. Accounts with transactions cannot be deleted to maintain data integrity.' 
      });
    }
    
    // Delete account
    const deleteResult = await db.query(
      'DELETE FROM chart_of_accounts WHERE id = $1',
      [id]
    );
    
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/chart-of-accounts/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
