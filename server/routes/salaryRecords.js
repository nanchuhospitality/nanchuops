const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get salary records. Optional: period_month, period_year, employee_id
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    let query = `
      SELECT sr.*, e.name as employee_name, e.post as employee_post
      FROM salary_records sr
      JOIN employees e ON sr.employee_id = e.id
      WHERE 1=1
    `;
    const params = [];
    let p = 1;

    if (req.query.period_month) {
      query += ` AND sr.period_month = $${p++}`;
      params.push(parseInt(req.query.period_month));
    }
    if (req.query.period_year) {
      query += ` AND sr.period_year = $${p++}`;
      params.push(parseInt(req.query.period_year));
    }
    if (req.query.employee_id) {
      query += ` AND sr.employee_id = $${p++}`;
      params.push(parseInt(req.query.employee_id));
    }

    query += ' ORDER BY sr.period_year DESC, sr.period_month DESC, e.name ASC';

    const result = await db.query(query, params);
    const safeParse = (s, def = []) => {
      if (s == null) return def;
      try { return Array.isArray(JSON.parse(s)) ? JSON.parse(s) : def; } catch { return def; }
    };
    const sumBreakdown = (arr) => (Array.isArray(arr) ? arr : []).reduce((s, x) => s + (Number(x && x.amount) || 0), 0);
    const records = result.rows.map((r) => {
      const eb = Array.isArray(r.earnings_breakdown) ? r.earnings_breakdown : safeParse(r.earnings_breakdown);
      const db = Array.isArray(r.deductables_breakdown) ? r.deductables_breakdown : safeParse(r.deductables_breakdown);
      const te = (r.total_earnings != null && r.total_earnings !== '') ? Number(r.total_earnings) : sumBreakdown(eb);
      const td = (r.total_deductable != null && r.total_deductable !== '') ? Number(r.total_deductable) : sumBreakdown(db);
      return {
        ...r,
        total_earnings: te,
        total_deductable: td,
        earnings_breakdown: eb,
        deductables_breakdown: db
      };
    });
    res.json({ records });
  } catch (error) {
    console.error('Error in GET /api/salary-records:', error);
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// Create one salary record per employee for the given period (admin only)
// Body: period_month, period_year, and EITHER:
//   - entries: [ { employee_id, amount } ] (preferred), OR
//   - employee_ids: [id, ...] (legacy; amount from employees.salary)
router.post('/',
  authenticateToken,
  requireAdmin,
  [
    body('period_month').isInt({ min: 1, max: 12 }).withMessage('period_month must be 1-12'),
    body('period_year').isInt({ min: 2000, max: 2100 }).withMessage('period_year is required')
  ],
  async (req, res) => {
    try {
      const err = validationResult(req);
      if (!err.isEmpty()) {
        const errs = err.array();
        return res.status(400).json({
          errors: errs,
          error: errs.map((e) => e.msg || e.param).join('. ')
        });
      }

      const { period_month, period_year, entries, employee_ids } = req.body;
      const db = getDb();

      let byId = new Map();

      const parseBreakdown = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((x) => ({
          label: String(x && x.label != null ? x.label : '').trim() || '—',
          amount: Number.isFinite(parseFloat(x && x.amount)) ? parseFloat(x.amount) : 0
        })).filter((x) => x.amount > 0 || x.label !== '—');
      };

      if (entries && Array.isArray(entries) && entries.length > 0) {
        for (const e of entries) {
          const eid = parseInt(e.employee_id);
          const amt = parseFloat(e.amount);
          if (eid >= 1 && !isNaN(amt) && amt >= 0) {
            const te = Number.isFinite(parseFloat(e.total_earnings)) ? parseFloat(e.total_earnings) : 0;
            const td = Number.isFinite(parseFloat(e.total_deductable)) ? parseFloat(e.total_deductable) : 0;
            byId.set(eid, {
              amount: amt,
              total_earnings: te,
              total_deductable: td,
              earnings: parseBreakdown(e.earnings),
              deductables: parseBreakdown(e.deductables)
            });
          }
        }
      } else if (employee_ids && Array.isArray(employee_ids) && employee_ids.length > 0) {
        const ids = [...new Set(employee_ids.map((id) => parseInt(id)).filter((n) => n >= 1))];
        if (ids.length === 0) {
          return res.status(400).json({ error: 'employee_ids must be a non-empty array of valid ids.' });
        }
        const empRows = await db.query(
          'SELECT id, salary FROM employees WHERE id = ANY($1::int[]) AND is_active = 1',
          [ids]
        );
        for (const r of empRows.rows) {
          const amt = parseFloat(r.salary) || 0;
          byId.set(r.id, { amount: amt, total_earnings: amt, total_deductable: 0, earnings: [], deductables: [] });
        }
      }

      const employeeIds = [...byId.keys()];
      if (employeeIds.length === 0) {
        return res.status(400).json({
          error: 'Provide entries ([{ employee_id, amount }]) or employee_ids (array of ids).'
        });
      }

      // Check for existing records (same employee + period)
      const existing = await db.query(
        `SELECT sr.employee_id, e.name FROM salary_records sr
         JOIN employees e ON e.id = sr.employee_id
         WHERE sr.period_month = $1 AND sr.period_year = $2 AND sr.employee_id = ANY($3::int[])`,
        [period_month, period_year, employeeIds]
      );
      if (existing.rows.length > 0) {
        const names = existing.rows.map(r => r.name).join(', ');
        return res.status(400).json({
          error: `Salary record already exists for this period: ${names}`
        });
      }

      const empRows = await db.query(
        `SELECT id, name FROM employees WHERE id = ANY($1::int[]) AND is_active = 1`,
        [employeeIds]
      );
      const empMap = new Map(empRows.rows.map(r => [r.id, r]));

      const created = [];
      for (const eid of employeeIds) {
        const emp = empMap.get(eid);
        if (!emp) continue;
        const v = byId.get(eid);
        const amount = v && typeof v === 'object' ? v.amount : (v || 0);
        const totalEarnings = v && typeof v === 'object' && Number.isFinite(v.total_earnings) ? v.total_earnings : 0;
        const totalDeductable = v && typeof v === 'object' && Number.isFinite(v.total_deductable) ? v.total_deductable : 0;
        const earningsB = (v && Array.isArray(v.earnings) ? v.earnings : []);
        const deductablesB = (v && Array.isArray(v.deductables) ? v.deductables : []);
        const ins = await db.query(
          `INSERT INTO salary_records (employee_id, period_month, period_year, amount, total_earnings, total_deductable, earnings_breakdown, deductables_breakdown)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, employee_id, period_month, period_year, amount, total_earnings, total_deductable, earnings_breakdown, deductables_breakdown`,
          [eid, period_month, period_year, amount, totalEarnings, totalDeductable, JSON.stringify(earningsB), JSON.stringify(deductablesB)]
        );
        created.push({ ...ins.rows[0], employee_name: emp.name });
      }

      if (created.length === 0 && employeeIds.length > 0) {
        return res.status(400).json({ error: 'Selected employee not found or inactive.' });
      }

      res.status(201).json({
        message: `Created ${created.length} salary record(s)`,
        records: created
      });
    } catch (error) {
      console.error('Error in POST /api/salary-records:', error);
      res.status(500).json({ error: 'Database error: ' + error.message });
    }
  }
);

module.exports = router;
