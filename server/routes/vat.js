const express = require('express');
const { getDb } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Helper function to get VAT account IDs
const getVATAccountIds = async (db) => {
  const inputVatResult = await db.query(
    "SELECT id FROM chart_of_accounts WHERE account_name = 'Input VAT' AND category = 'liability' LIMIT 1"
  );
  const outputVatResult = await db.query(
    "SELECT id FROM chart_of_accounts WHERE account_name = 'Output VAT' AND category = 'liability' LIMIT 1"
  );
  
  return {
    inputVatId: inputVatResult.rows.length > 0 ? inputVatResult.rows[0].id : null,
    outputVatId: outputVatResult.rows.length > 0 ? outputVatResult.rows[0].id : null
  };
};

// Get VAT report
router.get('/report', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate } = req.query;
    
    let purchaseQuery = `
      SELECT 
        pr.id,
        pr.purchase_date as date,
        pr.amount,
        pr.vat_amount,
        pr.vat_type,
        pr.total_amount,
        pr.record_number,
        pr.supplier_id,
        s.account_name as supplier_name
      FROM purchases_records pr
      LEFT JOIN chart_of_accounts s ON pr.supplier_id = s.id
      WHERE pr.vat_amount IS NOT NULL AND pr.vat_amount > 0
    `;
    
    let salesQuery = `
      SELECT 
        sr.id,
        sr.date,
        sr.amount,
        sr.vat_amount,
        sr.vat_type,
        sr.total_amount,
        sr.record_number
      FROM sales_records sr
      WHERE sr.vat_amount IS NOT NULL AND sr.vat_amount > 0
    `;
    
    const params = [];
    const conditions = [];
    let paramCount = 1;
    
    if (startDate) {
      conditions.push(`date >= $${paramCount++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`date <= $${paramCount++}`);
      params.push(endDate);
    }
    if (conditions.length > 0) {
      const whereClause = ' AND ' + conditions.join(' AND ');
      purchaseQuery += whereClause.replace(/date/g, 'pr.purchase_date');
      salesQuery += whereClause.replace(/date/g, 'sr.date');
    }
    
    purchaseQuery += ' ORDER BY pr.purchase_date DESC';
    salesQuery += ' ORDER BY sr.date DESC';
    
    const purchaseResult = await db.query(purchaseQuery, params);
    const salesResult = await db.query(salesQuery, params);
    
    // Calculate totals
    const totalInputVAT = purchaseResult.rows.reduce((sum, row) => sum + (parseFloat(row.vat_amount) || 0), 0);
    const totalOutputVAT = salesResult.rows.reduce((sum, row) => sum + (parseFloat(row.vat_amount) || 0), 0);
    const netVAT = totalOutputVAT - totalInputVAT;
    
    res.json({
      summary: {
        totalInputVAT: Math.round(totalInputVAT * 100) / 100,
        totalOutputVAT: Math.round(totalOutputVAT * 100) / 100,
        netVAT: Math.round(netVAT * 100) / 100,
        netVATPayable: netVAT > 0 ? Math.round(netVAT * 100) / 100 : 0,
        netVATRefundable: netVAT < 0 ? Math.abs(Math.round(netVAT * 100) / 100) : 0
      },
      purchases: purchaseResult.rows,
      sales: salesResult.rows
    });
  } catch (error) {
    console.error('Error in GET /api/vat/report:', error);
    res.status(500).json({ error: 'Failed to generate VAT report' });
  }
});

// Get VAT summary by period
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    const purchaseResult = await db.query(
      `SELECT 
        COALESCE(SUM(vat_amount), 0) as total_input_vat,
        COUNT(*) as purchase_count
      FROM purchases_records
      WHERE purchase_date >= $1 AND purchase_date <= $2
        AND vat_amount IS NOT NULL AND vat_amount > 0`,
      [startDate, endDate]
    );
    
    const salesResult = await db.query(
      `SELECT 
        COALESCE(SUM(vat_amount), 0) as total_output_vat,
        COUNT(*) as sales_count
      FROM sales_records
      WHERE date >= $1 AND date <= $2
        AND vat_amount IS NOT NULL AND vat_amount > 0`,
      [startDate, endDate]
    );
    
    const totalInputVAT = parseFloat(purchaseResult.rows[0].total_input_vat) || 0;
    const totalOutputVAT = parseFloat(salesResult.rows[0].total_output_vat) || 0;
    const netVAT = totalOutputVAT - totalInputVAT;
    
    res.json({
      period: { startDate, endDate },
      inputVAT: {
        total: Math.round(totalInputVAT * 100) / 100,
        transactionCount: parseInt(purchaseResult.rows[0].purchase_count) || 0
      },
      outputVAT: {
        total: Math.round(totalOutputVAT * 100) / 100,
        transactionCount: parseInt(salesResult.rows[0].sales_count) || 0
      },
      netVAT: {
        amount: Math.round(netVAT * 100) / 100,
        payable: netVAT > 0 ? Math.round(netVAT * 100) / 100 : 0,
        refundable: netVAT < 0 ? Math.abs(Math.round(netVAT * 100) / 100) : 0
      }
    });
  } catch (error) {
    console.error('Error in GET /api/vat/summary:', error);
    res.status(500).json({ error: 'Failed to get VAT summary' });
  }
});

// Get VAT return data
router.get('/returns', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    // Get detailed transaction data for VAT return
    const purchaseResult = await db.query(
      `SELECT 
        pr.record_number,
        pr.purchase_date as date,
        pr.invoice_number,
        s.account_name as supplier_name,
        pr.amount,
        pr.vat_rate,
        pr.vat_amount,
        pr.vat_type,
        pr.total_amount
      FROM purchases_records pr
      LEFT JOIN chart_of_accounts s ON pr.supplier_id = s.id
      WHERE pr.purchase_date >= $1 AND pr.purchase_date <= $2
        AND pr.vat_amount IS NOT NULL AND pr.vat_amount > 0
      ORDER BY pr.purchase_date ASC`,
      [startDate, endDate]
    );
    
    const salesResult = await db.query(
      `SELECT 
        sr.record_number,
        sr.date,
        sr.amount,
        sr.vat_rate,
        sr.vat_amount,
        sr.vat_type,
        sr.total_amount
      FROM sales_records sr
      WHERE sr.date >= $1 AND sr.date <= $2
        AND sr.vat_amount IS NOT NULL AND sr.vat_amount > 0
      ORDER BY sr.date ASC`,
      [startDate, endDate]
    );
    
    // Calculate summary
    const totalInputVAT = purchaseResult.rows.reduce((sum, row) => sum + (parseFloat(row.vat_amount) || 0), 0);
    const totalOutputVAT = salesResult.rows.reduce((sum, row) => sum + (parseFloat(row.vat_amount) || 0), 0);
    const netVAT = totalOutputVAT - totalInputVAT;
    
    res.json({
      period: { startDate, endDate },
      summary: {
        totalInputVAT: Math.round(totalInputVAT * 100) / 100,
        totalOutputVAT: Math.round(totalOutputVAT * 100) / 100,
        netVAT: Math.round(netVAT * 100) / 100,
        netVATPayable: netVAT > 0 ? Math.round(netVAT * 100) / 100 : 0,
        netVATRefundable: netVAT < 0 ? Math.abs(Math.round(netVAT * 100) / 100) : 0
      },
      purchases: purchaseResult.rows,
      sales: salesResult.rows
    });
  } catch (error) {
    console.error('Error in GET /api/vat/returns:', error);
    res.status(500).json({ error: 'Failed to get VAT return data' });
  }
});

// Get VAT account IDs (helper endpoint)
router.get('/accounts', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const vatAccounts = await getVATAccountIds(db);
    res.json(vatAccounts);
  } catch (error) {
    console.error('Error in GET /api/vat/accounts:', error);
    res.status(500).json({ error: 'Failed to get VAT accounts' });
  }
});

module.exports = router;
