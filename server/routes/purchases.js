const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Helper function to calculate VAT
const calculateVAT = (amount, vatType, vatRate, calculationMethod, manualVatAmount) => {
  const baseAmount = parseFloat(amount) || 0;
  let vatAmount = 0;
  
  if (vatType === 'exempt' || vatType === 'zero_rated') {
    vatAmount = 0;
  } else if (vatType === 'standard') {
    if (calculationMethod === 'manual' && manualVatAmount !== undefined && manualVatAmount !== null) {
      vatAmount = parseFloat(manualVatAmount) || 0;
    } else {
      // Auto calculation
      const rate = parseFloat(vatRate) || 13.00;
      vatAmount = baseAmount * (rate / 100);
    }
  }
  
  const totalAmount = baseAmount + vatAmount;
  
  return {
    vatAmount: Math.round(vatAmount * 100) / 100, // Round to 2 decimal places
    totalAmount: Math.round(totalAmount * 100) / 100
  };
};

// Helper function to get period format (YYYY/YY) from a date
const getFinancialYearFormat = async (db, date) => {
  const year = new Date(date).getFullYear();
  return `${year}/${String(year + 1).slice(-2)}`;
};

// Helper function to generate next purchase record number (PR-YYYY/YY-####)
const generatePurchaseRecordNumber = async (db, purchaseDate) => {
  try {
    const fyFormat = await getFinancialYearFormat(db, purchaseDate);
    
    const result = await db.query(
      `SELECT record_number FROM purchases_records 
       WHERE record_number LIKE $1 
       ORDER BY record_number DESC LIMIT 1`,
      [`PR-${fyFormat}-%`]
    );
    
    let nextSequence = 1;
    if (result.rows.length > 0 && result.rows[0].record_number) {
      // Match both new format PR-YYYY/YY-#### and old format PR-YYYY-####
      const newMatch = result.rows[0].record_number.match(/PR-\d{4}\/\d{2}-(\d+)/);
      const oldMatch = result.rows[0].record_number.match(/PR-\d{4}-(\d+)/);
      if (newMatch) {
        nextSequence = parseInt(newMatch[1]) + 1;
      } else if (oldMatch) {
        nextSequence = parseInt(oldMatch[1]) + 1;
      }
    }
    
    return `PR-${fyFormat}-${String(nextSequence).padStart(4, '0')}`;
  } catch (error) {
    throw error;
  }
};

// Get all purchases records (admin sees all, employees see only their own)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    
    let query = `
      SELECT pr.*, u.username, u.full_name, 
             COALESCE(pr.voucher_created, 0) as voucher_created,
             pr.record_number,
             pr.voucher_amount,
             pr.journal_entry_number as entry_number,
             je.voucher_number,
             s.account_code as supplier_code,
             s.account_name as supplier_name,
             s.id as supplier_id,
             pa.account_code as purchase_account_code,
             pa.account_name as purchase_account_name,
             pa.id as purchase_account_account_id,
             pay.account_code as payment_account_code,
             pay.account_name as payment_account_name
      FROM purchases_records pr
      JOIN users u ON pr.user_id = u.id
      LEFT JOIN chart_of_accounts s ON pr.supplier_id = s.id
      LEFT JOIN chart_of_accounts pa ON pr.purchase_account_id = pa.id
      LEFT JOIN chart_of_accounts pay ON pr.payment_account_id = pay.id
      LEFT JOIN journal_entries je ON (
        (je.reference = 'PURCHASE-VOUCHER' 
         AND (
           je.purchase_record_id = pr.id
           OR je.description LIKE '%Purchase Record #' || CAST(pr.id AS VARCHAR) || '%'
           OR je.description = 'Purchase Record #' || CAST(pr.id AS VARCHAR)
           OR je.description LIKE '%Purchase Record #' || pr.id::text || '%'
           OR je.description = 'Purchase Record #' || pr.id::text
         ))
        OR (je.reference = 'PAYMENT-VOUCHER' AND je.purchase_record_id = pr.id)
      )
    `;
    const params = [];
    const conditions = [];

    if (req.user.role !== 'admin') {
      conditions.push('pr.user_id = $1');
      params.push(req.user.id);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY pr.date DESC, pr.created_at DESC';

    const result = await db.query(query, params);
    res.json({ records: result.rows });
  } catch (error) {
    console.error('Error in GET /api/purchases:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get purchase form account options (without exposing accounting module routes)
router.get('/account-options', authenticateToken, async (req, res) => {
  try {
    const db = getDb();

    const [purchaseAccountsResult, paymentAccountsResult, suppliersResult] = await Promise.all([
      db.query(
        `SELECT id, account_name, category, subcategory
         FROM chart_of_accounts
         WHERE category IN ('expense', 'cogs')
         ORDER BY account_name ASC`
      ),
      db.query(
        `SELECT id, account_name, category, subcategory
         FROM chart_of_accounts
         WHERE category = 'asset' AND LOWER(COALESCE(subcategory, '')) = 'current assets'
         ORDER BY account_name ASC`
      ),
      db.query(
        `SELECT id, account_name, category, subcategory
         FROM chart_of_accounts
         WHERE category = 'liability'
         ORDER BY account_name ASC`
      )
    ]);

    res.json({
      purchase_accounts: purchaseAccountsResult.rows,
      payment_accounts: paymentAccountsResult.rows,
      suppliers: suppliersResult.rows
    });
  } catch (error) {
    console.error('Error in GET /api/purchases/account-options:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get purchase record by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    let query = `
      SELECT pr.*, u.username, u.full_name,
             pr.record_number,
             pr.voucher_amount,
             pr.journal_entry_number as entry_number,
             je.voucher_number,
             s.account_code as supplier_code,
             s.account_name as supplier_name,
             s.id as supplier_account_id,
             pa.account_code as purchase_account_code,
             pa.account_name as purchase_account_name,
             pa.id as purchase_account_account_id,
             pay.account_code as payment_account_code,
             pay.account_name as payment_account_name,
             pay.id as payment_account_account_id
      FROM purchases_records pr
      JOIN users u ON pr.user_id = u.id
      LEFT JOIN chart_of_accounts s ON pr.supplier_id = s.id
      LEFT JOIN chart_of_accounts pa ON pr.purchase_account_id = pa.id
      LEFT JOIN chart_of_accounts pay ON pr.payment_account_id = pay.id
      LEFT JOIN journal_entries je ON (
        (je.reference = 'PURCHASE-VOUCHER' 
         AND (
           je.purchase_record_id = pr.id
           OR je.description LIKE '%Purchase Record #' || CAST(pr.id AS VARCHAR) || '%'
           OR je.description = 'Purchase Record #' || CAST(pr.id AS VARCHAR)
           OR je.description LIKE '%Purchase Record #' || pr.id::text || '%'
           OR je.description = 'Purchase Record #' || pr.id::text
         ))
        OR (je.reference = 'PAYMENT-VOUCHER' AND je.purchase_record_id = pr.id)
      )
      WHERE pr.id = $1
    `;
    const params = [req.params.id];

    if (req.user.role !== 'admin') {
      query += ' AND pr.user_id = $2';
      params.push(req.user.id);
    }

    const result = await db.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase record not found' });
    }
    
    res.json({ record: result.rows[0] });
  } catch (error) {
    console.error('Error in GET /api/purchases/:id:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new purchase record
router.post('/',
  authenticateToken,
  [
    body('purchase_date').notEmpty().withMessage('Purchase date is required'),
    body('payment_date').optional().custom((value) => {
      if (value === null || value === undefined || value === '') {
        return true;
      }
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;
      if (iso8601Regex.test(value)) {
        const date = new Date(value);
        return !isNaN(date.getTime());
      }
      return false;
    }).withMessage('Payment date must be a valid date or empty'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('description').optional().trim(),
    body('invoice_number').optional().trim(),
    body('payment_account_id').optional().custom((value) => {
      if (value === null || value === undefined || value === '') {
        return true;
      }
      return Number.isInteger(parseInt(value));
    }).withMessage('Payment account ID must be an integer or empty'),
    body('payment_type').optional().isIn(['account', 'credit']).withMessage('Payment type must be account or credit'),
    body('purchase_account_id').notEmpty().withMessage('Purchase account is required').isInt().withMessage('Purchase account ID must be an integer'),
    body('supplier_id').optional().custom((value) => {
      if (value === null || value === undefined || value === '') {
        return true;
      }
      return Number.isInteger(parseInt(value));
    }).withMessage('Supplier ID must be an integer or empty'),
    body('vat_type').optional().isIn(['standard', 'exempt', 'zero_rated']).withMessage('VAT type must be standard, exempt, or zero_rated'),
    body('vat_rate').optional().isFloat({ min: 0, max: 100 }).withMessage('VAT rate must be between 0 and 100'),
    body('vat_amount').optional().isFloat({ min: 0 }).withMessage('VAT amount must be a positive number'),
    body('vat_calculation_method').optional().isIn(['auto', 'manual']).withMessage('VAT calculation method must be auto or manual')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { purchase_date, payment_date, amount, description, invoice_number, payment_account_id, payment_type, purchase_account_id, supplier_id, vat_type, vat_rate, vat_amount, vat_calculation_method } = req.body;
      const db = getDb();
      const purchaseAmount = parseFloat(amount);
      const paymentType = payment_type || (payment_account_id ? 'account' : 'credit');
      
      // Handle VAT calculation
      const defaultVatType = vat_type || 'exempt';
      const defaultVatRate = vat_rate !== undefined ? parseFloat(vat_rate) : 13.00;
      const defaultCalculationMethod = vat_calculation_method || 'auto';
      const manualVatAmount = vat_amount !== undefined ? parseFloat(vat_amount) : null;
      
      const vatCalculation = calculateVAT(purchaseAmount, defaultVatType, defaultVatRate, defaultCalculationMethod, manualVatAmount);
      
      // Validate and parse purchase_account_id
      if (!purchase_account_id) {
        return res.status(400).json({ error: 'Purchase account is required' });
      }
      const purchaseAccountId = parseInt(purchase_account_id);
      if (isNaN(purchaseAccountId)) {
        return res.status(400).json({ error: 'Purchase account ID must be a valid integer' });
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
      
      // Normalize supplier_id
      let normalizedSupplierId = null;
      if (supplier_id !== '' && supplier_id !== undefined && supplier_id !== null) {
        const parsed = parseInt(supplier_id);
        if (isNaN(parsed)) {
          return res.status(400).json({ error: 'Supplier ID must be a valid integer' });
        }
        normalizedSupplierId = parsed;
      }
      
      let normalizedPaymentDate = null;
      if (paymentType === 'account') {
        normalizedPaymentDate = payment_date || purchase_date;
      } else {
        normalizedPaymentDate = (payment_date && payment_date.trim() !== '') ? payment_date : null;
      }
      
      if (normalizedPaymentDate && normalizedPaymentDate < purchase_date) {
        return res.status(400).json({ error: 'Payment date cannot be before purchase date' });
      }
      
      if (paymentType === 'account' && !normalizedPaymentAccountId) {
        return res.status(400).json({ error: 'Payment account is required when using account payment' });
      }
      
      if (paymentType === 'credit' && !normalizedSupplierId) {
        return res.status(400).json({ error: 'Supplier account is required for credit purchases' });
      }

      // Validate payment account has correct subcategory for account payment
      if (paymentType === 'account' && normalizedPaymentAccountId) {
        const accountResult = await db.query(
          'SELECT id, subcategory, category FROM chart_of_accounts WHERE id = $1',
          [normalizedPaymentAccountId]
        );
        
        if (accountResult.rows.length === 0) {
          return res.status(400).json({ error: 'Payment account not found' });
        }
        
        const account = accountResult.rows[0];
        if (account.category !== 'asset') {
          return res.status(400).json({ error: 'Payment account must be an Asset account' });
        }
        
        const subcategoryLower = account.subcategory ? account.subcategory.toLowerCase() : '';
        if (subcategoryLower !== 'current assets') {
          return res.status(400).json({ error: 'Payment account must have "Current Assets" subcategory' });
        }
      }

      // Generate purchase record number
      const recordNumber = await generatePurchaseRecordNumber(db, purchase_date);
      
      // Create purchase record
      const insertResult = await db.query(
        'INSERT INTO purchases_records (user_id, date, purchase_date, payment_date, amount, description, invoice_number, payment_account_id, supplier_id, purchase_account_id, voucher_created, record_number, vat_type, vat_rate, vat_amount, vat_calculation_method, total_amount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id',
        [
          req.user.id, 
          purchase_date,
          purchase_date,
          normalizedPaymentDate,
          purchaseAmount, 
          description || null,
          invoice_number || null,
          normalizedPaymentAccountId,
          normalizedSupplierId,
          purchaseAccountId,
          0,
          recordNumber,
          defaultVatType,
          defaultVatRate,
          vatCalculation.vatAmount,
          defaultCalculationMethod,
          vatCalculation.totalAmount
        ]
      );

      const purchaseRecordId = insertResult.rows[0].id;

      // Note: Cash/Bank purchase records are now created without automatic payment voucher.
      // Payment vouchers must be created manually from the Payment Register page.

      // Fetch the created record
      const recordResult = await db.query(
        `SELECT pr.*, u.username, u.full_name,
                s.account_code as supplier_code,
                s.account_name as supplier_name,
                pa.account_code as purchase_account_code,
                pa.account_name as purchase_account_name,
                pay.account_code as payment_account_code,
                pay.account_name as payment_account_name
         FROM purchases_records pr
         JOIN users u ON pr.user_id = u.id
         LEFT JOIN chart_of_accounts s ON pr.supplier_id = s.id
         LEFT JOIN chart_of_accounts pa ON pr.purchase_account_id = pa.id
         LEFT JOIN chart_of_accounts pay ON pr.payment_account_id = pay.id
         WHERE pr.id = $1`,
        [purchaseRecordId]
      );

      res.status(201).json({ record: recordResult.rows[0] });
    } catch (error) {
      console.error('Error in POST /api/purchases:', error);
      res.status(500).json({ error: 'Error creating purchase record: ' + error.message });
    }
  }
);

// Mark purchase record as voucher created
router.put('/:id/mark-voucher', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { voucher_amount, entry_id } = req.body;
    
    const recordResult = await db.query('SELECT * FROM purchases_records WHERE id = $1', [id]);
    
    if (recordResult.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase record not found' });
    }
    
    const record = recordResult.rows[0];
    
    // Prevent creating duplicate vouchers for the same purchase record
    if (record.voucher_created && record.voucher_created === 1) {
      return res.status(400).json({ 
        error: 'A voucher has already been created for this purchase record. Cannot create duplicate vouchers.' 
      });
    }
    
    if (req.user.role !== 'admin' && record.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    let journalEntryNumber = null;
    if (entry_id) {
      await db.query(
        'UPDATE journal_entries SET purchase_record_id = $1 WHERE id = $2',
        [id, entry_id]
      );
      
      // Get journal entry number from the journal entry
      const entryResult = await db.query('SELECT entry_number FROM journal_entries WHERE id = $1', [entry_id]);
      if (entryResult.rows.length > 0) {
        journalEntryNumber = entryResult.rows[0].entry_number;
      }
    }
    
    await db.query(
      'UPDATE purchases_records SET voucher_created = 1, voucher_amount = $1, journal_entry_number = $2 WHERE id = $3',
      [voucher_amount || null, journalEntryNumber, id]
    );
    
    res.json({ message: 'Purchase record marked as voucher created' });
  } catch (error) {
    console.error('Error in PUT /api/purchases/:id/mark-voucher:', error);
    res.status(500).json({ error: 'Failed to mark purchase record' });
  }
});

// Update purchase record
router.put('/:id',
  authenticateToken,
  [
    body('purchase_date').optional().notEmpty().withMessage('Purchase date cannot be empty'),
    body('payment_date').optional().custom((value) => {
      if (value === null || value === undefined || value === '') {
        return true;
      }
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;
      if (iso8601Regex.test(value)) {
        const date = new Date(value);
        return !isNaN(date.getTime());
      }
      return false;
    }).withMessage('Payment date must be a valid date or empty'),
    body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('description').optional().trim(),
    body('invoice_number').optional().trim(),
    body('payment_account_id').optional().custom((value) => {
      if (value === null || value === undefined || value === '') {
        return true;
      }
      return Number.isInteger(parseInt(value));
    }).withMessage('Payment account ID must be an integer or empty'),
    body('payment_type').optional().isIn(['account', 'credit']).withMessage('Payment type must be account or credit'),
    body('purchase_account_id').optional().isInt().withMessage('Purchase account ID must be an integer'),
    body('supplier_id').optional().custom((value) => {
      if (value === null || value === undefined || value === '') {
        return true;
      }
      return Number.isInteger(parseInt(value));
    }).withMessage('Supplier ID must be an integer or empty'),
    body('vat_type').optional().isIn(['standard', 'exempt', 'zero_rated']).withMessage('VAT type must be standard, exempt, or zero_rated'),
    body('vat_rate').optional().isFloat({ min: 0, max: 100 }).withMessage('VAT rate must be between 0 and 100'),
    body('vat_amount').optional().isFloat({ min: 0 }).withMessage('VAT amount must be a positive number'),
    body('vat_calculation_method').optional().isIn(['auto', 'manual']).withMessage('VAT calculation method must be auto or manual')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const db = getDb();
      const { purchase_date, payment_date, amount, description, invoice_number, payment_type, payment_account_id, purchase_account_id, supplier_id, vat_type, vat_rate, vat_amount, vat_calculation_method } = req.body;
      
      // Normalize supplier_id
      let normalizedSupplierId = null;
      if (supplier_id !== '' && supplier_id !== undefined && supplier_id !== null) {
        const parsed = parseInt(supplier_id);
        if (isNaN(parsed)) {
          return res.status(400).json({ error: 'Supplier ID must be a valid integer' });
        }
        normalizedSupplierId = parsed;
      }
      
      // Normalize purchase_account_id
      let normalizedPurchaseAccountId = undefined;
      if (purchase_account_id !== undefined) {
        const parsed = parseInt(purchase_account_id);
        if (isNaN(parsed)) {
          return res.status(400).json({ error: 'Purchase account ID must be a valid integer' });
        }
        normalizedPurchaseAccountId = parsed;
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
      
      const normalizedPaymentDate = (payment_date === '' || payment_date === undefined || payment_date === null) ? null : payment_date;

      const recordResult = await db.query('SELECT * FROM purchases_records WHERE id = $1', [req.params.id]);
      
      if (recordResult.rows.length === 0) {
        return res.status(404).json({ error: 'Purchase record not found' });
      }
      
      const record = recordResult.rows[0];
      
      if (req.user.role !== 'admin' && record.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Permission denied' });
      }
      
      if (record.voucher_created === 1 || record.voucher_created === true) {
        return res.status(400).json({ 
          error: 'Cannot edit purchase record with created voucher. Purchase records with vouchers cannot be modified to maintain data integrity.' 
        });
      }
      
      const finalPaymentType = payment_type !== undefined 
        ? payment_type 
        : (record.payment_account_id ? 'account' : 'credit');
      
      const finalPaymentAccountId = payment_account_id !== undefined ? normalizedPaymentAccountId : record.payment_account_id;
      if (finalPaymentType === 'account' && !finalPaymentAccountId) {
        return res.status(400).json({ error: 'Payment account is required when using account payment' });
      }
      
      const finalSupplierId = supplier_id !== undefined ? normalizedSupplierId : record.supplier_id;
      if (finalPaymentType === 'credit' && !finalSupplierId) {
        return res.status(400).json({ error: 'Supplier account is required for credit purchases' });
      }

      const finalPurchaseDate = purchase_date !== undefined ? purchase_date : record.purchase_date;
      if (normalizedPaymentDate && finalPurchaseDate && normalizedPaymentDate < finalPurchaseDate) {
        return res.status(400).json({ error: 'Payment date cannot be before purchase date' });
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (purchase_date !== undefined) {
        updates.push(`purchase_date = $${paramCount++}`);
        updates.push(`date = $${paramCount++}`);
        values.push(purchase_date);
        values.push(purchase_date);
      }
      if (payment_date !== undefined) {
        updates.push(`payment_date = $${paramCount++}`);
        values.push(normalizedPaymentDate);
      }
      if (amount !== undefined) {
        updates.push(`amount = $${paramCount++}`);
        values.push(parseFloat(amount));
      }
      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        values.push(description);
      }
      if (invoice_number !== undefined) {
        updates.push(`invoice_number = $${paramCount++}`);
        values.push(invoice_number || null);
      }
      if (payment_account_id !== undefined) {
        updates.push(`payment_account_id = $${paramCount++}`);
        values.push(normalizedPaymentAccountId);
      }
      if (supplier_id !== undefined) {
        updates.push(`supplier_id = $${paramCount++}`);
        values.push(normalizedSupplierId);
      }
      
      // Handle VAT fields
      const finalAmount = amount !== undefined ? parseFloat(amount) : record.amount;
      const finalVatType = vat_type !== undefined ? vat_type : (record.vat_type || 'exempt');
      const finalVatRate = vat_rate !== undefined ? parseFloat(vat_rate) : (record.vat_rate || 13.00);
      const finalCalculationMethod = vat_calculation_method !== undefined ? vat_calculation_method : (record.vat_calculation_method || 'auto');
      const finalManualVatAmount = vat_amount !== undefined ? parseFloat(vat_amount) : null;
      
      // Recalculate VAT if amount or VAT fields changed
      const needsVatRecalculation = amount !== undefined || vat_type !== undefined || vat_rate !== undefined || vat_calculation_method !== undefined || vat_amount !== undefined;
      
      if (needsVatRecalculation) {
        const vatCalculation = calculateVAT(finalAmount, finalVatType, finalVatRate, finalCalculationMethod, finalManualVatAmount);
        
        if (vat_type !== undefined) {
          updates.push(`vat_type = $${paramCount++}`);
          values.push(finalVatType);
        }
        if (vat_rate !== undefined) {
          updates.push(`vat_rate = $${paramCount++}`);
          values.push(finalVatRate);
        }
        if (vat_calculation_method !== undefined) {
          updates.push(`vat_calculation_method = $${paramCount++}`);
          values.push(finalCalculationMethod);
        }
        if (vat_amount !== undefined || (vat_calculation_method === 'manual' && vat_amount !== undefined)) {
          updates.push(`vat_amount = $${paramCount++}`);
          values.push(vatCalculation.vatAmount);
        } else if (needsVatRecalculation) {
          updates.push(`vat_amount = $${paramCount++}`);
          values.push(vatCalculation.vatAmount);
        }
        updates.push(`total_amount = $${paramCount++}`);
        values.push(vatCalculation.totalAmount);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(req.params.id);
      const query = `UPDATE purchases_records SET ${updates.join(', ')} WHERE id = $${paramCount}`;

      await db.query(query, values);

      const updatedResult = await db.query(
        `SELECT pr.*, u.username, u.full_name,
                s.account_code as supplier_code,
                s.account_name as supplier_name,
                pa.account_code as purchase_account_code,
                pa.account_name as purchase_account_name,
                pay.account_code as payment_account_code,
                pay.account_name as payment_account_name
         FROM purchases_records pr
         JOIN users u ON pr.user_id = u.id
         LEFT JOIN chart_of_accounts s ON pr.supplier_id = s.id
         LEFT JOIN chart_of_accounts pa ON pr.purchase_account_id = pa.id
         LEFT JOIN chart_of_accounts pay ON pr.payment_account_id = pay.id
         WHERE pr.id = $1`,
        [req.params.id]
      );

      res.json({ record: updatedResult.rows[0] });
    } catch (error) {
      console.error('Error in PUT /api/purchases/:id:', error);
      res.status(500).json({ error: 'Error updating purchase record' });
    }
  }
);

// Delete purchase record
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();

    const recordResult = await db.query('SELECT * FROM purchases_records WHERE id = $1', [req.params.id]);
    
    if (recordResult.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase record not found' });
    }
    
    const record = recordResult.rows[0];
    
    if (req.user.role !== 'admin' && record.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    if (record.voucher_created === 1 || record.voucher_created === true) {
      return res.status(400).json({ 
        error: 'Cannot delete purchase record with created voucher. Purchase records with vouchers cannot be deleted to maintain data integrity.' 
      });
    }

    await db.query('DELETE FROM purchases_records WHERE id = $1', [req.params.id]);
    
    res.json({ message: 'Purchase record deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/purchases/:id:', error);
    res.status(500).json({ error: 'Error deleting purchase record' });
  }
});

module.exports = router;
