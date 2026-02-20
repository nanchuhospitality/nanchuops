const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const resolveBranchScope = async (db, req) => {
  if (req.user.role === 'admin') {
    return req.query.branch_id ? parseInt(req.query.branch_id, 10) : null;
  }
  const userResult = await db.query('SELECT branch_id FROM users WHERE id = $1', [req.user.id]);
  if (userResult.rows.length === 0) {
    throw new Error('User not found');
  }
  return userResult.rows[0].branch_id || null;
};

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

// Helper function to generate next sales record number (SR-YYYY/YY-####)
const generateSalesRecordNumber = async (db, salesDate) => {
  try {
    const fyFormat = await getFinancialYearFormat(db, salesDate);
    
    const result = await db.query(
      `SELECT record_number FROM sales_records 
       WHERE record_number LIKE $1 
       ORDER BY record_number DESC LIMIT 1`,
      [`SR-${fyFormat}-%`]
    );
    
    let nextSequence = 1;
    if (result.rows.length > 0 && result.rows[0].record_number) {
      // Match both new format SR-YYYY/YY-#### and old format SR-YYYY-####
      const newMatch = result.rows[0].record_number.match(/SR-\d{4}\/\d{2}-(\d+)/);
      const oldMatch = result.rows[0].record_number.match(/SR-\d{4}-(\d+)/);
      if (newMatch) {
        nextSequence = parseInt(newMatch[1]) + 1;
      } else if (oldMatch) {
        nextSequence = parseInt(oldMatch[1]) + 1;
      }
    }
    
    return `SR-${fyFormat}-${String(nextSequence).padStart(4, '0')}`;
  } catch (error) {
    throw error;
  }
};

// Get all sales records (admin sees all, employees see only their own)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const scopedBranchId = await resolveBranchScope(db, req);
    if (req.user.role !== 'admin' && !scopedBranchId) {
      return res.status(400).json({ error: 'User is not assigned to any branch' });
    }
    
    let query = `
      SELECT sr.*, u.username, u.full_name, sr.record_number, b.name AS branch_name
      FROM sales_records sr
      JOIN users u ON sr.user_id = u.id
      LEFT JOIN branches b ON sr.branch_id = b.id
    `;
    const params = [];
    const conditions = [];
    let paramCount = 1;

    if (scopedBranchId) {
      conditions.push(`sr.branch_id = $${paramCount++}`);
      params.push(scopedBranchId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY sr.date DESC, sr.created_at DESC';

    const result = await db.query(query, params);
    res.json({ records: result.rows });
  } catch (error) {
    console.error('Error in GET /api/sales:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get sales record by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const scopedBranchId = await resolveBranchScope(db, req);
    if (req.user.role !== 'admin' && !scopedBranchId) {
      return res.status(400).json({ error: 'User is not assigned to any branch' });
    }
    let query = `
      SELECT sr.*, u.username, u.full_name, b.name AS branch_name
      FROM sales_records sr
      JOIN users u ON sr.user_id = u.id
      LEFT JOIN branches b ON sr.branch_id = b.id
      WHERE sr.id = $1
    `;
    const params = [req.params.id];

    if (scopedBranchId) {
      query += ' AND sr.branch_id = $2';
      params.push(scopedBranchId);
    }

    const result = await db.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sales record not found' });
    }
    
    res.json({ record: result.rows[0] });
  } catch (error) {
    console.error('Error in GET /api/sales/:id:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new sales record
router.post('/',
  authenticateToken,
  [
    body('date').notEmpty().withMessage('Date is required'),
    body('branch_id').optional({ nullable: true }).isInt().withMessage('Branch ID must be an integer'),
    body('description').optional().trim(),
    body('total_qr_sales').isFloat({ min: 0 }).withMessage('Total QR Sales must be a positive number'),
    body('total_cash_sales').isFloat({ min: 0 }).withMessage('Total Cash Sales must be a positive number'),
    body('total_food_sales').isFloat({ min: 0 }).withMessage('Total Food Sales must be a positive number'),
    body('total_beverages_sales').isFloat({ min: 0 }).withMessage('Total Beverages Sales must be a positive number'),
    body('delivery_charge_collected').isFloat({ min: 0 }).withMessage('Delivery Charge Collected must be a positive number'),
    body('total_rider_payment').optional().isFloat({ min: 0 }).withMessage('Total Rider Payment must be a positive number'),
    body('transportation_amount').optional().isFloat({ min: 0 }).withMessage('Transportation amount must be a positive number'),
    body('transportation_recipients').optional(),
    body('rider_payments').optional(),
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

      const { date, branch_id, description, total_qr_sales, total_cash_sales, total_food_sales, total_beverages_sales, delivery_charge_collected, total_discount_given, total_rider_payment, transportation_amount, transportation_recipients, rider_payments, other_expenses, vat_type, vat_rate, vat_amount, vat_calculation_method } = req.body;
      const db = getDb();
      let effectiveBranchId = null;

      if (req.user.role === 'admin') {
        if (!branch_id) {
          return res.status(400).json({ error: 'Branch is required' });
        }
        effectiveBranchId = parseInt(branch_id, 10);
      } else {
        const userResult = await db.query('SELECT branch_id FROM users WHERE id = $1', [req.user.id]);
        if (userResult.rows.length === 0) {
          return res.status(404).json({ error: 'User not found' });
        }
        if (!userResult.rows[0].branch_id) {
          return res.status(400).json({ error: 'User is not assigned to any branch' });
        }
        effectiveBranchId = userResult.rows[0].branch_id;
      }

      const branchCheck = await db.query('SELECT id FROM branches WHERE id = $1 AND is_active = true', [effectiveBranchId]);
      if (branchCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Selected branch not found or inactive' });
      }

      const qrSales = parseFloat(total_qr_sales) || 0;
      const cashSales = parseFloat(total_cash_sales) || 0;
      const amount = qrSales + cashSales;
      
      // Handle VAT calculation
      const defaultVatType = vat_type || 'exempt';
      const defaultVatRate = vat_rate !== undefined ? parseFloat(vat_rate) : 13.00;
      const defaultCalculationMethod = vat_calculation_method || 'auto';
      const manualVatAmount = vat_amount !== undefined ? parseFloat(vat_amount) : null;
      
      const vatCalculation = calculateVAT(amount, defaultVatType, defaultVatRate, defaultCalculationMethod, manualVatAmount);

      // Generate record number
      const recordNumber = await generateSalesRecordNumber(db, date);

      const insertResult = await db.query(
        'INSERT INTO sales_records (user_id, date, amount, branch_id, description, total_qr_sales, total_cash_sales, total_food_sales, total_beverages_sales, delivery_charge_collected, total_discount_given, total_rider_payment, transportation_amount, transportation_recipients, rider_payments, other_expenses, record_number, vat_type, vat_rate, vat_amount, vat_calculation_method, total_amount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) RETURNING id',
        [
          req.user.id, 
          date, 
          amount, 
          effectiveBranchId,
          description || null,
          qrSales,
          cashSales,
          parseFloat(total_food_sales) || 0,
          parseFloat(total_beverages_sales) || 0,
          parseFloat(delivery_charge_collected) || 0,
          parseFloat(total_discount_given) || 0,
          parseFloat(total_rider_payment) || 0,
          parseFloat(transportation_amount) || null,
          transportation_recipients || null,
          rider_payments || null,
          other_expenses || null,
          recordNumber,
          defaultVatType,
          defaultVatRate,
          vatCalculation.vatAmount,
          defaultCalculationMethod,
          vatCalculation.totalAmount
        ]
      );

      const recordResult = await db.query(
        'SELECT sr.*, u.username, u.full_name FROM sales_records sr JOIN users u ON sr.user_id = u.id WHERE sr.id = $1',
        [insertResult.rows[0].id]
      );

      res.status(201).json({ record: recordResult.rows[0] });
    } catch (error) {
      console.error('Error in POST /api/sales:', error);
      res.status(500).json({ error: 'Error creating sales record: ' + error.message });
    }
  }
);

// Update sales record
router.put('/:id',
  authenticateToken,
  [
    body('date').optional().notEmpty().withMessage('Date cannot be empty'),
    body('branch_id').optional({ nullable: true }).isInt().withMessage('Branch ID must be an integer'),
    body('description').optional().trim(),
    body('total_qr_sales').optional().isFloat({ min: 0 }).withMessage('Total QR Sales must be a positive number'),
    body('total_cash_sales').optional().isFloat({ min: 0 }).withMessage('Total Cash Sales must be a positive number'),
    body('total_food_sales').optional().isFloat({ min: 0 }).withMessage('Total Food Sales must be a positive number'),
    body('total_beverages_sales').optional().isFloat({ min: 0 }).withMessage('Total Beverages Sales must be a positive number'),
    body('delivery_charge_collected').optional().isFloat({ min: 0 }).withMessage('Delivery Charge Collected must be a positive number'),
    body('total_discount_given').optional().isFloat({ min: 0 }).withMessage('Total Discount Given must be a positive number'),
    body('total_rider_payment').optional().isFloat({ min: 0 }).withMessage('Total Rider Payment must be a positive number'),
    body('transportation_amount').optional().isFloat({ min: 0 }).withMessage('Transportation amount must be a positive number'),
    body('transportation_recipients').optional(),
    body('rider_payments').optional(),
    body('other_expenses').optional(),
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
      const { date, branch_id, description, total_qr_sales, total_cash_sales, total_food_sales, total_beverages_sales, delivery_charge_collected, total_rider_payment, transportation_amount, transportation_recipients, rider_payments, other_expenses, vat_type, vat_rate, vat_amount, vat_calculation_method } = req.body;

      const recordResult = await db.query('SELECT * FROM sales_records WHERE id = $1', [req.params.id]);
      
      if (recordResult.rows.length === 0) {
        return res.status(404).json({ error: 'Sales record not found' });
      }
      
      const record = recordResult.rows[0];
      
      if (req.user.role !== 'admin') {
        const userResult = await db.query('SELECT branch_id FROM users WHERE id = $1', [req.user.id]);
        if (userResult.rows.length === 0 || !userResult.rows[0].branch_id) {
          return res.status(403).json({ error: 'Permission denied' });
        }
        if (record.branch_id !== userResult.rows[0].branch_id) {
          return res.status(403).json({ error: 'Permission denied' });
        }
        if (branch_id !== undefined) {
          return res.status(403).json({ error: 'Only admin can change branch assignment' });
        }
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (date !== undefined) {
        updates.push(`date = $${paramCount++}`);
        values.push(date);
      }
      if (branch_id !== undefined) {
        const normalizedBranchId = parseInt(branch_id, 10);
        const branchCheck = await db.query('SELECT id FROM branches WHERE id = $1 AND is_active = true', [normalizedBranchId]);
        if (branchCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Selected branch not found or inactive' });
        }
        updates.push(`branch_id = $${paramCount++}`);
        values.push(normalizedBranchId);
      }
      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        values.push(description);
      }
      if (total_qr_sales !== undefined) {
        updates.push(`total_qr_sales = $${paramCount++}`);
        values.push(total_qr_sales);
      }
      if (total_cash_sales !== undefined) {
        updates.push(`total_cash_sales = $${paramCount++}`);
        values.push(total_cash_sales);
      }
      if (total_food_sales !== undefined) {
        updates.push(`total_food_sales = $${paramCount++}`);
        values.push(total_food_sales);
      }
      if (total_beverages_sales !== undefined) {
        updates.push(`total_beverages_sales = $${paramCount++}`);
        values.push(total_beverages_sales);
      }
      if (delivery_charge_collected !== undefined) {
        updates.push(`delivery_charge_collected = $${paramCount++}`);
        values.push(delivery_charge_collected);
      }
      if (total_discount_given !== undefined) {
        updates.push(`total_discount_given = $${paramCount++}`);
        values.push(total_discount_given);
      }
      if (total_rider_payment !== undefined) {
        updates.push(`total_rider_payment = $${paramCount++}`);
        values.push(total_rider_payment);
      }
      if (transportation_amount !== undefined) {
        updates.push(`transportation_amount = $${paramCount++}`);
        values.push(transportation_amount);
      }
      if (transportation_recipients !== undefined) {
        updates.push(`transportation_recipients = $${paramCount++}`);
        values.push(transportation_recipients || null);
      }
      if (rider_payments !== undefined) {
        updates.push(`rider_payments = $${paramCount++}`);
        values.push(rider_payments || null);
      }
      if (other_expenses !== undefined) {
        updates.push(`other_expenses = $${paramCount++}`);
        values.push(other_expenses || null);
      }

      // Recalculate amount if QR or Cash sales are updated
      const finalQrSales = parseFloat(total_qr_sales !== undefined ? total_qr_sales : record.total_qr_sales) || 0;
      const finalCashSales = parseFloat(total_cash_sales !== undefined ? total_cash_sales : record.total_cash_sales) || 0;
      const finalAmount = finalQrSales + finalCashSales;
      
      if (total_qr_sales !== undefined || total_cash_sales !== undefined) {
        updates.push(`amount = $${paramCount++}`);
        values.push(finalAmount);
      }
      
      // Handle VAT fields
      const finalVatType = vat_type !== undefined ? vat_type : (record.vat_type || 'exempt');
      const finalVatRate = vat_rate !== undefined ? parseFloat(vat_rate) : (record.vat_rate || 13.00);
      const finalCalculationMethod = vat_calculation_method !== undefined ? vat_calculation_method : (record.vat_calculation_method || 'auto');
      const finalManualVatAmount = vat_amount !== undefined ? parseFloat(vat_amount) : null;
      
      // Recalculate VAT if amount or VAT fields changed
      const needsVatRecalculation = total_qr_sales !== undefined || total_cash_sales !== undefined || vat_type !== undefined || vat_rate !== undefined || vat_calculation_method !== undefined || vat_amount !== undefined;
      
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
      const query = `UPDATE sales_records SET ${updates.join(', ')} WHERE id = $${paramCount}`;

      await db.query(query, values);

      const updatedResult = await db.query(
        'SELECT sr.*, u.username, u.full_name FROM sales_records sr JOIN users u ON sr.user_id = u.id WHERE sr.id = $1',
        [req.params.id]
      );

      res.json({ record: updatedResult.rows[0] });
    } catch (error) {
      console.error('Error in PUT /api/sales/:id:', error);
      res.status(500).json({ error: 'Error updating sales record' });
    }
  }
);

// Delete sales record
router.delete('/:id', authenticateToken, async (req, res) => {
  return res.status(403).json({ error: 'Sales record deletion is disabled' });
});

module.exports = router;
