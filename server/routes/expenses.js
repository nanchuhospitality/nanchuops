const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Helper function to generate next expense record number (ER-YYYY-####)
const generateExpenseRecordNumber = async (db, expenseDate) => {
  try {
    const year = new Date(expenseDate).getFullYear();
    
    const result = await db.query(
      `SELECT record_number FROM expenses_records 
       WHERE record_number LIKE $1 
       ORDER BY record_number DESC LIMIT 1`,
      [`ER-${year}-%`]
    );
    
    let nextSequence = 1;
    if (result.rows.length > 0 && result.rows[0].record_number) {
      const match = result.rows[0].record_number.match(/ER-\d{4}-(\d+)/);
      if (match) {
        nextSequence = parseInt(match[1]) + 1;
      }
    }
    
    return `ER-${year}-${String(nextSequence).padStart(4, '0')}`;
  } catch (error) {
    throw error;
  }
};

// Get all expense records (admin sees all, employees see only their own)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    
    let query = `
      SELECT er.*, u.username, u.full_name, 
             COALESCE(er.voucher_created, 0) as voucher_created,
             er.record_number,
             ea.account_code as expense_account_code,
             ea.account_name as expense_account_name,
             ea.id as expense_account_account_id,
             pay.account_code as payment_account_code,
             pay.account_name as payment_account_name
      FROM expenses_records er
      JOIN users u ON er.user_id = u.id
      LEFT JOIN chart_of_accounts ea ON er.expense_account_id = ea.id
      LEFT JOIN chart_of_accounts pay ON er.payment_account_id = pay.id
    `;
    const params = [];
    const conditions = [];

    if (req.user.role !== 'admin') {
      conditions.push('er.user_id = $1');
      params.push(req.user.id);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY er.date DESC, er.created_at DESC';

    const result = await db.query(query, params);
    res.json({ records: result.rows });
  } catch (error) {
    console.error('Error in GET /api/expenses:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get expense form account options (without exposing accounting module routes)
router.get('/account-options', authenticateToken, async (req, res) => {
  try {
    const db = getDb();

    const [expenseAccountsResult, paymentAccountsResult] = await Promise.all([
      db.query(
        `SELECT id, account_name, category, subcategory
         FROM chart_of_accounts
         WHERE category = 'expense'
         ORDER BY account_name ASC`
      ),
      db.query(
        `SELECT id, account_name, category, subcategory
         FROM chart_of_accounts
         WHERE category = 'asset' AND LOWER(COALESCE(subcategory, '')) = 'current assets'
         ORDER BY account_name ASC`
      )
    ]);

    res.json({
      expense_accounts: expenseAccountsResult.rows,
      payment_accounts: paymentAccountsResult.rows
    });
  } catch (error) {
    console.error('Error in GET /api/expenses/account-options:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get expense record by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    let query = `
      SELECT er.*, u.username, u.full_name,
             er.record_number,
             ea.account_code as expense_account_code,
             ea.account_name as expense_account_name,
             ea.id as expense_account_account_id,
             pay.account_code as payment_account_code,
             pay.account_name as payment_account_name,
             pay.id as payment_account_account_id
      FROM expenses_records er
      JOIN users u ON er.user_id = u.id
      LEFT JOIN chart_of_accounts ea ON er.expense_account_id = ea.id
      LEFT JOIN chart_of_accounts pay ON er.payment_account_id = pay.id
      WHERE er.id = $1
    `;
    const params = [req.params.id];

    if (req.user.role !== 'admin') {
      query += ' AND er.user_id = $2';
      params.push(req.user.id);
    }

    const result = await db.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense record not found' });
    }
    
    res.json({ record: result.rows[0] });
  } catch (error) {
    console.error('Error in GET /api/expenses/:id:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new expense record
router.post('/',
  authenticateToken,
  [
    body('expense_date').notEmpty().withMessage('Expense date is required'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('description').optional().trim(),
    body('invoice_number').optional().trim(),
    body('payment_account_id').optional().custom((value) => {
      if (value === null || value === undefined || value === '') {
        return true;
      }
      return Number.isInteger(parseInt(value));
    }).withMessage('Payment account ID must be an integer or empty'),
    body('expense_account_id').notEmpty().withMessage('Expense account is required').isInt().withMessage('Expense account ID must be an integer')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { expense_date, amount, description, invoice_number, payment_account_id, expense_account_id } = req.body;
      const db = getDb();
      const expenseAmount = parseFloat(amount);
      
      // Validate and parse expense_account_id
      if (!expense_account_id) {
        return res.status(400).json({ error: 'Expense account is required' });
      }
      const expenseAccountId = parseInt(expense_account_id);
      if (isNaN(expenseAccountId)) {
        return res.status(400).json({ error: 'Expense account ID must be a valid integer' });
      }
      
      // Normalize payment_account_id
      let normalizedPaymentAccountId = null;
      if (payment_account_id !== '' && payment_account_id !== undefined && payment_account_id !== null) {
        const parsed = parseInt(payment_account_id);
        if (isNaN(parsed)) {
          return res.status(400).json({ error: 'Payment account ID must be a valid integer' });
        }
        normalizedPaymentAccountId = parsed;
      }

      // Validate expense account
      if (expenseAccountId) {
        const accountResult = await db.query(
          'SELECT id, category FROM chart_of_accounts WHERE id = $1',
          [expenseAccountId]
        );
        
        if (accountResult.rows.length === 0) {
          return res.status(400).json({ error: 'Expense account not found' });
        }
        
        const account = accountResult.rows[0];
        if (account.category !== 'expense') {
          return res.status(400).json({ error: 'Expense account must be an Expense category account' });
        }
      }

      // Generate expense record number
      const recordNumber = await generateExpenseRecordNumber(db, expense_date);
      
      // Create expense record
      const insertResult = await db.query(
        'INSERT INTO expenses_records (user_id, date, expense_date, amount, description, invoice_number, payment_account_id, expense_account_id, voucher_created, record_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
        [
          req.user.id, 
          expense_date,
          expense_date,
          expenseAmount, 
          description || null,
          invoice_number || null,
          normalizedPaymentAccountId,
          expenseAccountId,
          0,
          recordNumber
        ]
      );

      const expenseRecordId = insertResult.rows[0].id;

      // Fetch the created record
      const recordResult = await db.query(
        `SELECT er.*, u.username, u.full_name,
                ea.account_code as expense_account_code,
                ea.account_name as expense_account_name,
                pay.account_code as payment_account_code,
                pay.account_name as payment_account_name
         FROM expenses_records er
         JOIN users u ON er.user_id = u.id
         LEFT JOIN chart_of_accounts ea ON er.expense_account_id = ea.id
         LEFT JOIN chart_of_accounts pay ON er.payment_account_id = pay.id
         WHERE er.id = $1`,
        [expenseRecordId]
      );

      res.status(201).json({ record: recordResult.rows[0] });
    } catch (error) {
      console.error('Error in POST /api/expenses:', error);
      res.status(500).json({ error: 'Error creating expense record: ' + error.message });
    }
  }
);

// Update expense record
router.put('/:id',
  authenticateToken,
  [
    body('expense_date').optional().notEmpty().withMessage('Expense date cannot be empty'),
    body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('description').optional().trim(),
    body('invoice_number').optional().trim(),
    body('payment_account_id').optional().custom((value) => {
      if (value === null || value === undefined || value === '') {
        return true;
      }
      return Number.isInteger(parseInt(value));
    }).withMessage('Payment account ID must be an integer or empty'),
    body('expense_account_id').optional().isInt().withMessage('Expense account ID must be an integer')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const db = getDb();
      const { expense_date, amount, description, invoice_number, payment_account_id, expense_account_id } = req.body;
      const { id } = req.params;

      // Check if record exists and user has permission
      const recordResult = await db.query('SELECT * FROM expenses_records WHERE id = $1', [id]);
      
      if (recordResult.rows.length === 0) {
        return res.status(404).json({ error: 'Expense record not found' });
      }
      
      const record = recordResult.rows[0];
      
      if (req.user.role !== 'admin' && record.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      // Normalize payment_account_id
      let normalizedPaymentAccountId = null;
      if (payment_account_id !== '' && payment_account_id !== undefined && payment_account_id !== null) {
        const parsed = parseInt(payment_account_id);
        if (isNaN(parsed)) {
          return res.status(400).json({ error: 'Payment account ID must be a valid integer' });
        }
        normalizedPaymentAccountId = parsed;
      }

      // Normalize expense_account_id
      let normalizedExpenseAccountId = undefined;
      if (expense_account_id !== undefined) {
        const parsed = parseInt(expense_account_id);
        if (isNaN(parsed)) {
          return res.status(400).json({ error: 'Expense account ID must be a valid integer' });
        }
        normalizedExpenseAccountId = parsed;
      }

      // Build update query dynamically
      const updates = [];
      const params = [];
      let paramCount = 1;

      if (expense_date !== undefined) {
        updates.push(`date = $${paramCount++}`);
        params.push(expense_date);
        updates.push(`expense_date = $${paramCount++}`);
        params.push(expense_date);
      }
      
      if (amount !== undefined) {
        updates.push(`amount = $${paramCount++}`);
        params.push(parseFloat(amount));
      }
      
      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        params.push(description || null);
      }
      
      if (invoice_number !== undefined) {
        updates.push(`invoice_number = $${paramCount++}`);
        params.push(invoice_number || null);
      }
      
      if (payment_account_id !== undefined) {
        updates.push(`payment_account_id = $${paramCount++}`);
        params.push(normalizedPaymentAccountId);
      }
      
      if (expense_account_id !== undefined) {
        updates.push(`expense_account_id = $${paramCount++}`);
        params.push(normalizedExpenseAccountId);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(id);
      await db.query(
        `UPDATE expenses_records SET ${updates.join(', ')} WHERE id = $${paramCount}`,
        params
      );

      // Fetch updated record
      const updatedResult = await db.query(
        `SELECT er.*, u.username, u.full_name,
                ea.account_code as expense_account_code,
                ea.account_name as expense_account_name,
                pay.account_code as payment_account_code,
                pay.account_name as payment_account_name
         FROM expenses_records er
         JOIN users u ON er.user_id = u.id
         LEFT JOIN chart_of_accounts ea ON er.expense_account_id = ea.id
         LEFT JOIN chart_of_accounts pay ON er.payment_account_id = pay.id
         WHERE er.id = $1`,
        [id]
      );

      res.json({ record: updatedResult.rows[0] });
    } catch (error) {
      console.error('Error in PUT /api/expenses/:id:', error);
      res.status(500).json({ error: 'Error updating expense record: ' + error.message });
    }
  }
);

// Delete expense record
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    // Check if record exists and user has permission
    const recordResult = await db.query('SELECT * FROM expenses_records WHERE id = $1', [id]);
    
    if (recordResult.rows.length === 0) {
      return res.status(404).json({ error: 'Expense record not found' });
    }
    
    const record = recordResult.rows[0];
    
    if (req.user.role !== 'admin' && record.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await db.query('DELETE FROM expenses_records WHERE id = $1', [id]);

    res.json({ message: 'Expense record deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/expenses/:id:', error);
    res.status(500).json({ error: 'Failed to delete expense record' });
  }
});

module.exports = router;
