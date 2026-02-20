const express = require('express');
const { getDb } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get dashboard statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    let scopedBranchId = null;
    const { date_from, date_to } = req.query;

    if (req.user.role === 'admin') {
      if (req.query.branch_id) {
        scopedBranchId = parseInt(req.query.branch_id, 10);
      }
    } else {
      const userResult = await db.query('SELECT branch_id FROM users WHERE id = $1', [req.user.id]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      scopedBranchId = userResult.rows[0].branch_id;
      if (!scopedBranchId) {
        return res.status(400).json({ error: 'User is not assigned to any branch' });
      }
    }

    const baseWhere = [];
    const params = [];
    if (scopedBranchId) {
      params.push(scopedBranchId);
      baseWhere.push(`branch_id = $${params.length}`);
    }
    if (date_from) {
      params.push(date_from);
      baseWhere.push(`date::date >= $${params.length}::date`);
    }
    if (date_to) {
      params.push(date_to);
      baseWhere.push(`date::date <= $${params.length}::date`);
    }
    const whereClause = baseWhere.length > 0 ? `WHERE ${baseWhere.join(' AND ')}` : '';

    // Total sales
    const totalSalesResult = await db.query(
      `SELECT SUM(amount) as total FROM sales_records ${whereClause}`,
      params
    );

    // Today's sales
    const todaySalesResult = await db.query(
      `SELECT SUM(amount) as total FROM sales_records ${whereClause ? `${whereClause} AND` : 'WHERE'} date::date = CURRENT_DATE`,
      params
    );

    // This month's sales
    const monthSalesResult = await db.query(
      `SELECT SUM(amount) as total FROM sales_records 
       ${whereClause ? `${whereClause} AND` : 'WHERE'} TO_CHAR(date::date, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')`,
      params
    );

    // Total records count
    const countResult = await db.query(
      `SELECT COUNT(*) as count FROM sales_records ${whereClause}`,
      params
    );

    // Sales by day (last 30 days)
    const dailyDateClause = date_from || date_to
      ? ''
      : `${whereClause ? `${whereClause} AND` : 'WHERE'} date::date >= CURRENT_DATE - INTERVAL '30 days'`;
    const dailySalesResult = await db.query(
      `SELECT date, SUM(amount) as total 
       FROM sales_records 
       ${dailyDateClause || whereClause}
       GROUP BY date ORDER BY date::date ASC`,
      params
    );

    // Total QR Sales
    const totalQRSalesResult = await db.query(
      `SELECT SUM(total_qr_sales) as total FROM sales_records ${whereClause}`,
      params
    );

    // Total Cash Sales
    const totalCashSalesResult = await db.query(
      `SELECT SUM(total_cash_sales) as total FROM sales_records ${whereClause}`,
      params
    );

    // Total Rider Payment
    const totalRiderPaymentResult = await db.query(
      `SELECT SUM(total_rider_payment) as total FROM sales_records ${whereClause}`,
      params
    );

    // Total Transportation Expenses
    const totalTransportationResult = await db.query(
      `SELECT SUM(transportation_amount) as total FROM sales_records 
       ${whereClause ? `${whereClause} AND` : 'WHERE'} transportation_amount > 0`,
      params
    );

    // Transportation expenses by recipient (last 30 days)
    const transportationRangeClause = date_from || date_to
      ? `${whereClause ? `${whereClause.replace(/branch_id/g, 'sr.branch_id')} AND` : 'WHERE'} sr.transportation_amount > 0`
      : `${whereClause ? `${whereClause.replace(/branch_id/g, 'sr.branch_id')} AND` : 'WHERE'} sr.transportation_amount > 0 AND sr.date::date >= CURRENT_DATE - INTERVAL '30 days'`;
    const transportationByRecipientResult = await db.query(
      `SELECT sr.transportation_recipients, sr.transportation_amount
       FROM sales_records sr
       ${transportationRangeClause}`,
      params
    );

    // Parse JSON recipients and aggregate by name
    const recipientMap = {};
    transportationByRecipientResult.rows.forEach(row => {
      if (row.transportation_recipients) {
        try {
          const recipients = typeof row.transportation_recipients === 'string' 
            ? JSON.parse(row.transportation_recipients) 
            : row.transportation_recipients;
          
          if (Array.isArray(recipients)) {
            recipients.forEach(r => {
              if (r.name && r.amount) {
                recipientMap[r.name] = (recipientMap[r.name] || 0) + parseFloat(r.amount);
              }
            });
          }
        } catch (e) {
          console.error('Error parsing transportation recipients:', e);
        }
      }
    });

    const transportationByRecipient = Object.entries(recipientMap)
      .map(([name, total]) => ({ recipient_name: name, total }))
      .sort((a, b) => b.total - a.total);

    res.json({
      totalSales: parseFloat(totalSalesResult.rows[0]?.total || 0),
      todaySales: parseFloat(todaySalesResult.rows[0]?.total || 0),
      monthSales: parseFloat(monthSalesResult.rows[0]?.total || 0),
      totalRecords: parseInt(countResult.rows[0]?.count || 0),
      dailySales: dailySalesResult.rows || [],
      totalQRSales: parseFloat(totalQRSalesResult.rows[0]?.total || 0),
      totalCashSales: parseFloat(totalCashSalesResult.rows[0]?.total || 0),
      totalRiderPayment: parseFloat(totalRiderPaymentResult.rows[0]?.total || 0),
      totalTransportation: parseFloat(totalTransportationResult.rows[0]?.total || 0),
      dateFrom: date_from || null,
      dateTo: date_to || null,
      transportationByRecipient
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Error fetching dashboard statistics' });
  }
});

module.exports = router;
