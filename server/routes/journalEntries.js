const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Helper function to get period format (YYYY/YY) from a date
const getFinancialYearFormat = async (db, date) => {
  const year = new Date(date).getFullYear();
  return `${year}/${String(year + 1).slice(-2)}`;
};

// Helper function to generate next purchase voucher number (PV-YYYY/YY-####)
const generatePurchaseVoucherNumber = async (db, entryDate) => {
  try {
    const fyFormat = await getFinancialYearFormat(db, entryDate);
    
    const result = await db.query(
      `SELECT voucher_number FROM journal_entries 
       WHERE voucher_number LIKE $1 
       ORDER BY voucher_number DESC LIMIT 1`,
      [`PV-${fyFormat}-%`]
    );
    
    let nextSequence = 1;
    if (result.rows.length > 0 && result.rows[0].voucher_number) {
      // Match both new format PV-YYYY/YY-#### and old format PV-YYYY-####
      const newMatch = result.rows[0].voucher_number.match(/PV-\d{4}\/\d{2}-(\d+)/);
      const oldMatch = result.rows[0].voucher_number.match(/PV-\d{4}-(\d+)/);
      if (newMatch) {
        nextSequence = parseInt(newMatch[1]) + 1;
      } else if (oldMatch) {
        nextSequence = parseInt(oldMatch[1]) + 1;
      }
    }
    
    return `PV-${fyFormat}-${String(nextSequence).padStart(4, '0')}`;
  } catch (error) {
    throw error;
  }
};

// Helper function to generate next payment voucher number (PAY-YYYY/YY-####)
const generatePaymentVoucherNumber = async (db, entryDate) => {
  try {
    const fyFormat = await getFinancialYearFormat(db, entryDate);
    
    const result = await db.query(
      `SELECT voucher_number FROM journal_entries 
       WHERE voucher_number LIKE $1 
       ORDER BY voucher_number DESC LIMIT 1`,
      [`PAY-${fyFormat}-%`]
    );
    
    let nextSequence = 1;
    if (result.rows.length > 0 && result.rows[0].voucher_number) {
      // Match both new format PAY-YYYY/YY-#### and old format PAY-YYYY-####
      const newMatch = result.rows[0].voucher_number.match(/PAY-\d{4}\/\d{2}-(\d+)/);
      const oldMatch = result.rows[0].voucher_number.match(/PAY-\d{4}-(\d+)/);
      if (newMatch) {
        nextSequence = parseInt(newMatch[1]) + 1;
      } else if (oldMatch) {
        nextSequence = parseInt(oldMatch[1]) + 1;
      }
    }
    
    return `PAY-${fyFormat}-${String(nextSequence).padStart(4, '0')}`;
  } catch (error) {
    throw error;
  }
};

// Helper function to generate next sales voucher number (SV-YYYY/YY-####)
const generateSalesVoucherNumber = async (db, entryDate) => {
  try {
    const fyFormat = await getFinancialYearFormat(db, entryDate);
    
    const result = await db.query(
      `SELECT voucher_number FROM journal_entries 
       WHERE voucher_number LIKE $1 
       ORDER BY voucher_number DESC LIMIT 1`,
      [`SV-${fyFormat}-%`]
    );
    
    let nextSequence = 1;
    if (result.rows.length > 0 && result.rows[0].voucher_number) {
      // Match both new format SV-YYYY/YY-#### and old format SV-YYYY-####
      const newMatch = result.rows[0].voucher_number.match(/SV-\d{4}\/\d{2}-(\d+)/);
      const oldMatch = result.rows[0].voucher_number.match(/SV-\d{4}-(\d+)/);
      if (newMatch) {
        nextSequence = parseInt(newMatch[1]) + 1;
      } else if (oldMatch) {
        nextSequence = parseInt(oldMatch[1]) + 1;
      }
    }
    
    return `SV-${fyFormat}-${String(nextSequence).padStart(4, '0')}`;
  } catch (error) {
    throw error;
  }
};

// Helper function to generate next entry number (JE-YYYY/YY-####)
const generateEntryNumber = async (db, entryDate) => {
  try {
    const fyFormat = await getFinancialYearFormat(db, entryDate);
    
    const result = await db.query(
      `SELECT entry_number FROM journal_entries 
       WHERE entry_number LIKE $1 
       ORDER BY entry_number DESC LIMIT 1`,
      [`JE-${fyFormat}-%`]
    );
    
    let nextSequence = 1;
    if (result.rows.length > 0 && result.rows[0].entry_number) {
      // Match both new format JE-YYYY/YY-#### and old format JE-YYYY-####
      const newMatch = result.rows[0].entry_number.match(/JE-\d{4}\/\d{2}-(\d+)/);
      const oldMatch = result.rows[0].entry_number.match(/JE-\d{4}-(\d+)/);
      if (newMatch) {
        nextSequence = parseInt(newMatch[1]) + 1;
      } else if (oldMatch) {
        nextSequence = parseInt(oldMatch[1]) + 1;
      } else {
        // Handle old format JE-001, JE-002, etc.
        const veryOldMatch = result.rows[0].entry_number.match(/JE-(\d+)/);
        if (veryOldMatch) {
          nextSequence = parseInt(veryOldMatch[1]) + 1;
        }
      }
    }
    
    return `JE-${fyFormat}-${String(nextSequence).padStart(4, '0')}`;
  } catch (error) {
    throw error;
  }
};

// Get all journal entries
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate, accountId } = req.query;
    
    let query = `
      SELECT 
        je.*,
        MAX(u.full_name) as created_by_name,
        COUNT(jel.id) as line_count,
        SUM(jel.debit_amount) as total_debits,
        SUM(jel.credit_amount) as total_credits,
        COALESCE(MAX(pr.record_number), MAX(sr.record_number)) as record_number
      FROM journal_entries je
      LEFT JOIN users u ON je.created_by = u.id
      LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
      LEFT JOIN purchases_records pr ON je.purchase_record_id = pr.id
      LEFT JOIN sales_records sr ON (
        je.reference = 'SALES-' || CAST(sr.id AS VARCHAR)
        OR je.reference = 'SALES-' || sr.id::text
        OR je.description LIKE '%Sales Record #' || CAST(sr.id AS VARCHAR) || '%'
        OR je.description = 'Sales Record #' || CAST(sr.id AS VARCHAR)
        OR je.description LIKE '%Sales Record #' || sr.id::text || '%'
        OR je.description = 'Sales Record #' || sr.id::text
      )
    `;
    
    const conditions = [];
    const params = [];
    let paramCount = 1;
    
    if (startDate) {
      conditions.push(`je.entry_date >= $${paramCount++}`);
      params.push(startDate);
    }
    
    if (endDate) {
      conditions.push(`je.entry_date <= $${paramCount++}`);
      params.push(endDate);
    }
    
    if (accountId) {
      query = `
        SELECT 
          je.*,
          MAX(u.full_name) as created_by_name,
          COUNT(DISTINCT jel.id) as line_count,
          SUM(jel.debit_amount) as total_debits,
          SUM(jel.credit_amount) as total_credits,
          COALESCE(MAX(pr.record_number), MAX(sr.record_number)) as record_number
        FROM journal_entries je
        LEFT JOIN users u ON je.created_by = u.id
        INNER JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
        LEFT JOIN purchases_records pr ON je.purchase_record_id = pr.id
        LEFT JOIN sales_records sr ON (
          je.reference = 'SALES-' || CAST(sr.id AS VARCHAR)
          OR je.reference = 'SALES-' || sr.id::text
          OR je.description LIKE '%Sales Record #' || CAST(sr.id AS VARCHAR) || '%'
          OR je.description = 'Sales Record #' || CAST(sr.id AS VARCHAR)
          OR je.description LIKE '%Sales Record #' || sr.id::text || '%'
          OR je.description = 'Sales Record #' || sr.id::text
        )
      `;
      conditions.push(`jel.account_id = $${paramCount++}`);
      params.push(accountId);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' GROUP BY je.id ORDER BY je.entry_date DESC, je.entry_number DESC';
    
    const result = await db.query(query, params);
    res.json({ entries: result.rows || [] });
  } catch (error) {
    console.error('Error in GET /api/journal-entries:', error);
    res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

// Get journal entry by ID with lines
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const entryResult = await db.query(
      `SELECT je.*, u.full_name as created_by_name, 
              COALESCE(pr.record_number, sr.record_number) as record_number
       FROM journal_entries je
       LEFT JOIN users u ON je.created_by = u.id
       LEFT JOIN purchases_records pr ON je.purchase_record_id = pr.id
       LEFT JOIN sales_records sr ON (
         je.reference = 'SALES-' || CAST(sr.id AS VARCHAR)
         OR je.reference = 'SALES-' || sr.id::text
         OR je.description LIKE '%Sales Record #' || CAST(sr.id AS VARCHAR) || '%'
         OR je.description = 'Sales Record #' || CAST(sr.id AS VARCHAR)
         OR je.description LIKE '%Sales Record #' || sr.id::text || '%'
         OR je.description = 'Sales Record #' || sr.id::text
       )
       WHERE je.id = $1`,
      [id]
    );
    
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }
    
    const linesResult = await db.query(
      `SELECT 
        jel.*,
        coa.account_name,
        coa.account_code,
        coa.category
       FROM journal_entry_lines jel
       LEFT JOIN chart_of_accounts coa ON jel.account_id = coa.id
       WHERE jel.journal_entry_id = $1
       ORDER BY jel.id`,
      [id]
    );
    
    res.json({
      entry: {
        ...entryResult.rows[0],
        lines: linesResult.rows || []
      }
    });
  } catch (error) {
    console.error('Error in GET /api/journal-entries/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new journal entry
router.post(
  '/',
  authenticateToken,
  requireAdmin,
  [
    body('entry_date').notEmpty().withMessage('Entry date is required'),
    body('lines').isArray({ min: 2 }).withMessage('At least 2 lines are required'),
    body('lines.*.account_id').notEmpty().withMessage('Account is required for all lines'),
    body('reference').optional().trim(),
    body('description').notEmpty().trim().withMessage('Description is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }
      
      const db = getDb();
      const { entry_date, reference, description, lines, purchase_record_id } = req.body;
      const userId = req.user.id;
      
      // Check if purchase_record_id is provided (for payment vouchers from Payment Register)
      // If purchase record already has a voucher, prevent creating another one
      if (purchase_record_id) {
        const purchaseRecordId = parseInt(purchase_record_id);
        if (purchaseRecordId) {
          // Check if this purchase record already has a voucher linked to it
          const existingVoucherCheck = await db.query(
            'SELECT id FROM journal_entries WHERE purchase_record_id = $1',
            [purchaseRecordId]
          );
          
          if (existingVoucherCheck.rows.length > 0) {
            return res.status(400).json({ 
              error: `Purchase Record #${purchaseRecordId} already has a voucher linked to it. One purchase record can only have one voucher.` 
            });
          }
          
          // Also check if purchase record has voucher_created flag set
          const purchaseRecordCheck = await db.query(
            'SELECT voucher_created FROM purchases_records WHERE id = $1',
            [purchaseRecordId]
          );
          
          if (purchaseRecordCheck.rows.length > 0 && purchaseRecordCheck.rows[0].voucher_created) {
            return res.status(400).json({ 
              error: `Purchase Record #${purchaseRecordId} already has a voucher. One purchase record can only have one voucher.` 
            });
          }
        }
      }
      
      // Validate debits = credits
      const totalDebits = lines.reduce((sum, line) => sum + (parseFloat(line.debit_amount) || 0), 0);
      const totalCredits = lines.reduce((sum, line) => sum + (parseFloat(line.credit_amount) || 0), 0);
      
      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        return res.status(400).json({ 
          error: `Debits (${totalDebits.toFixed(2)}) must equal Credits (${totalCredits.toFixed(2)})` 
        });
      }
      
      // Validate each line has either debit or credit (not both, not neither)
      for (const line of lines) {
        const debit = parseFloat(line.debit_amount) || 0;
        const credit = parseFloat(line.credit_amount) || 0;
        
        if (debit > 0 && credit > 0) {
          return res.status(400).json({ error: 'Each line must have either debit OR credit, not both' });
        }
        
        if (debit === 0 && credit === 0) {
          return res.status(400).json({ error: 'Each line must have either debit or credit amount' });
        }
      }
      
      // Generate entry number
      const entryNumber = await generateEntryNumber(db, entry_date);
      
      // Check if this is a purchase voucher
      const isPurchaseVoucher = (reference && (reference.toUpperCase().includes('PURCHASE-VOUCHER') || reference.toUpperCase().includes('PURCH'))) || 
                                (description && description.toUpperCase().includes('PURCHASE VOUCHER'));
      
      // Check if this is a payment voucher
      const isPaymentVoucher = (reference && reference.toUpperCase().includes('PAYMENT-VOUCHER')) || 
                               (description && description.toUpperCase().includes('PAYMENT VOUCHER'));
      
      // Check if this is a sales voucher
      const isSalesVoucher = (reference && (reference.toUpperCase().startsWith('SALES-') || reference.toUpperCase().includes('SALES'))) || 
                            (description && description.toUpperCase().includes('SALES'));
      
      // Check if purchase voucher involves cash/bank payment (payment out)
      // Cash/Bank purchases → Payment Register (PAY- voucher)
      // Credit purchases → Purchase Register (PV- voucher)
      let isPurchaseWithCashBankPayment = false;
      if (isPurchaseVoucher) {
        // Check if any line credits a cash/bank account (payment out)
        for (const line of lines) {
          if (line.credit_amount > 0) {
            // Check if this account is cash or bank
            const accountResult = await db.query(
              'SELECT id, category, subcategory FROM chart_of_accounts WHERE id = $1',
              [line.account_id]
            );
            if (accountResult.rows.length > 0) {
              const account = accountResult.rows[0];
              if (account.category === 'asset' && account.subcategory) {
                const subcategoryLower = account.subcategory.toLowerCase();
                if (subcategoryLower === 'cash on hand' || subcategoryLower === 'bank account') {
                  isPurchaseWithCashBankPayment = true;
                  break;
                }
              }
            }
          }
        }
      }
      
      // Debug: Log payment voucher detection
      if (reference && reference.toUpperCase().includes('PAYMENT-VOUCHER')) {
        console.log('Payment voucher detected by reference:', reference);
      }
      
      // Generate voucher number if applicable
      let voucherNumber = null;
      // Use purchase_record_id from request body if provided (for payment vouchers from Payment Register)
      // Otherwise extract from description (for purchase vouchers from PurchasesVoucher)
      let purchaseRecordId = purchase_record_id ? parseInt(purchase_record_id) : null;
      if (isPurchaseVoucher) {
        // If purchase is paid by cash/bank → Create payment voucher (PAY-)
        // If purchase is credit → Create purchase voucher (PV-)
        if (isPurchaseWithCashBankPayment) {
          voucherNumber = await generatePaymentVoucherNumber(db, entry_date);
          console.log('Cash/Bank purchase - generated payment voucher number:', voucherNumber);
        } else {
          voucherNumber = await generatePurchaseVoucherNumber(db, entry_date);
          console.log('Credit purchase - generated purchase voucher number:', voucherNumber);
        }
        // If purchase_record_id not provided in req.body, try extracting from description
        if (!purchaseRecordId) {
          const purchaseRecordMatch = description && description.match(/Purchase Record #(\d+)/);
          if (purchaseRecordMatch) {
            purchaseRecordId = parseInt(purchaseRecordMatch[1]);
            
            // Check if this purchase record already has a voucher linked to it (duplicate check)
            if (purchaseRecordId) {
              const existingVoucherCheck = await db.query(
                'SELECT id FROM journal_entries WHERE purchase_record_id = $1',
                [purchaseRecordId]
              );
              
              if (existingVoucherCheck.rows.length > 0) {
                return res.status(400).json({ 
                  error: `Purchase Record #${purchaseRecordId} already has a voucher linked to it. One purchase record can only have one voucher.` 
                });
              }
              
              // Also check if purchase record has voucher_created flag set
              const purchaseRecordCheck = await db.query(
                'SELECT voucher_created FROM purchases_records WHERE id = $1',
                [purchaseRecordId]
              );
              
              if (purchaseRecordCheck.rows.length > 0 && purchaseRecordCheck.rows[0].voucher_created) {
                return res.status(400).json({ 
                  error: `Purchase Record #${purchaseRecordId} already has a voucher. One purchase record can only have one voucher.` 
                });
              }
            }
          }
        }
      } else if (isPaymentVoucher) {
        voucherNumber = await generatePaymentVoucherNumber(db, entry_date);
        console.log('Generated payment voucher number:', voucherNumber);
      } else if (isSalesVoucher) {
        voucherNumber = await generateSalesVoucherNumber(db, entry_date);
        console.log('Generated sales voucher number:', voucherNumber);
      }
      
      // Extract sales record ID from reference if it's a sales voucher
      let salesRecordId = null;
      if (isSalesVoucher && reference) {
        const salesIdMatch = reference.match(/SALES-(\d+)/i);
        if (salesIdMatch) {
          salesRecordId = parseInt(salesIdMatch[1]);
        }
      }
      
      // Use transaction for atomicity
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        
        // Insert journal entry
        const entryResult = await client.query(
          'INSERT INTO journal_entries (entry_number, voucher_number, entry_date, reference, description, created_by, purchase_record_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
          [entryNumber, voucherNumber, entry_date, reference || null, description, userId, purchaseRecordId]
        );
        
        const entryId = entryResult.rows[0].id;
        
        // Insert lines
        for (const line of lines) {
          await client.query(
            'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES ($1, $2, $3, $4, $5)',
            [
              entryId,
              line.account_id,
              parseFloat(line.debit_amount) || 0,
              parseFloat(line.credit_amount) || 0,
              line.description || null
            ]
          );
        }
        
        // If this voucher is linked to a purchase record (payment voucher from Payment Register),
        // mark the purchase record as having a voucher created and store journal entry number
        if (purchaseRecordId) {
          // Calculate voucher amount as total of debits (or credits - they should be equal)
          // For payment vouchers: debit purchase account, credit payment account
          const totalDebits = lines.reduce((sum, line) => sum + (parseFloat(line.debit_amount) || 0), 0);
          const totalAmount = totalDebits; // Use total debits as voucher amount
          
          await client.query(
            'UPDATE purchases_records SET voucher_created = 1, voucher_amount = $1, journal_entry_number = $2 WHERE id = $3',
            [totalAmount || null, entryNumber, purchaseRecordId]
          );
        }
        
        // If this voucher is linked to a sales record, mark the sales record as having a voucher created
        if (salesRecordId) {
          await client.query(
            'UPDATE sales_records SET voucher_created = 1 WHERE id = $1',
            [salesRecordId]
          );
        }
        
        // No need to update description - voucher number is already set correctly above
        
        await client.query('COMMIT');
        
        // Fetch the created entry with lines
        const fetchEntryResult = await client.query(
          `SELECT je.*, u.full_name as created_by_name
           FROM journal_entries je
           LEFT JOIN users u ON je.created_by = u.id
           WHERE je.id = $1`,
          [entryId]
        );
        
        const fetchLinesResult = await client.query(
          `SELECT 
            jel.*,
            coa.account_name,
            coa.account_code,
            coa.category
           FROM journal_entry_lines jel
           LEFT JOIN chart_of_accounts coa ON jel.account_id = coa.id
           WHERE jel.journal_entry_id = $1`,
          [entryId]
        );
        
        res.status(201).json({
          message: 'Journal entry created successfully',
          entry: {
            ...fetchEntryResult.rows[0],
            lines: fetchLinesResult.rows || []
          }
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in POST /api/journal-entries:', error);
      res.status(500).json({ error: 'Failed to create journal entry: ' + error.message });
    }
  }
);

// Update journal entry
router.put(
  '/:id',
  authenticateToken,
  requireAdmin,
  [
    body('entry_date').notEmpty().withMessage('Entry date is required'),
    body('lines').isArray({ min: 2 }).withMessage('At least 2 lines are required'),
    body('lines.*.account_id').notEmpty().withMessage('Account is required for all lines')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }
      
      const db = getDb();
      const { id } = req.params;
      const { entry_date, reference, description, lines } = req.body;
      
      // Validate debits = credits
      const totalDebits = lines.reduce((sum, line) => sum + (parseFloat(line.debit_amount) || 0), 0);
      const totalCredits = lines.reduce((sum, line) => sum + (parseFloat(line.credit_amount) || 0), 0);
      
      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        return res.status(400).json({ 
          error: `Debits (${totalDebits.toFixed(2)}) must equal Credits (${totalCredits.toFixed(2)})` 
        });
      }
      
      // Check if entry exists
      const entryResult = await db.query('SELECT id FROM journal_entries WHERE id = $1', [id]);
      
      if (entryResult.rows.length === 0) {
        return res.status(404).json({ error: 'Journal entry not found' });
      }
      
      // Use transaction for atomicity
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        
        // Update entry
        await client.query(
          'UPDATE journal_entries SET entry_date = $1, reference = $2, description = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
          [entry_date, reference || null, description || null, id]
        );
        
        // Delete existing lines
        await client.query('DELETE FROM journal_entry_lines WHERE journal_entry_id = $1', [id]);
        
        // Insert new lines
        for (const line of lines) {
          await client.query(
            'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES ($1, $2, $3, $4, $5)',
            [
              id,
              line.account_id,
              parseFloat(line.debit_amount) || 0,
              parseFloat(line.credit_amount) || 0,
              line.description || null
            ]
          );
        }
        
        await client.query('COMMIT');
        
        res.json({ message: 'Journal entry updated successfully' });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in PUT /api/journal-entries/:id:', error);
      res.status(500).json({ error: 'Failed to update journal entry: ' + error.message });
    }
  }
);

// Delete journal entry
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const entryResult = await db.query('SELECT id FROM journal_entries WHERE id = $1', [id]);
    
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }
    
    // Delete entry (lines will be deleted via CASCADE)
    await db.query('DELETE FROM journal_entries WHERE id = $1', [id]);
    
    res.json({ message: 'Journal entry deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/journal-entries/:id:', error);
    res.status(500).json({ error: 'Failed to delete journal entry' });
  }
});

// Export helper functions for use in other routes
module.exports = router;
module.exports.generatePaymentVoucherNumber = generatePaymentVoucherNumber;
module.exports.generatePurchaseVoucherNumber = generatePurchaseVoucherNumber;
module.exports.generateEntryNumber = generateEntryNumber;
