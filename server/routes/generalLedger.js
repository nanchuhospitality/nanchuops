const express = require('express');
const { getDb } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get general ledger for a specific account
router.get('/account/:accountId', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { accountId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Get account details
    const accountResult = await db.query(
      'SELECT * FROM chart_of_accounts WHERE id = $1',
      [accountId]
    );
    
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    const account = accountResult.rows[0];
    
    // Build query for journal entry lines
    let query = `
      SELECT 
        jel.*,
        je.entry_number,
        je.entry_date,
        je.reference,
        je.description as entry_description,
        coa.account_name,
        coa.account_code,
        coa.category
      FROM journal_entry_lines jel
      INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
      LEFT JOIN chart_of_accounts coa ON jel.account_id = coa.id
      WHERE jel.account_id = $1
    `;
    
    const params = [accountId];
    let paramCount = 2;
    
    if (startDate) {
      query += ` AND je.entry_date >= $${paramCount++}`;
      params.push(startDate);
    }
    
    if (endDate) {
      query += ` AND je.entry_date <= $${paramCount++}`;
      params.push(endDate);
    }
    
    query += ' ORDER BY je.entry_date ASC, je.id ASC, jel.id ASC';
    
    const linesResult = await db.query(query, params);
    const lines = linesResult.rows;
    
    // Calculate opening balance
    let openingBalance = parseFloat(account.opening_balance || 0);
    
    if (startDate) {
      // Get sum of all transactions before startDate
      const totalsResult = await db.query(
        `SELECT 
          COALESCE(SUM(jel.debit_amount), 0) as total_debits,
          COALESCE(SUM(jel.credit_amount), 0) as total_credits
         FROM journal_entry_lines jel
         INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
         WHERE jel.account_id = $1 AND je.entry_date < $2`,
        [accountId, startDate]
      );
      
      const totals = totalsResult.rows[0];
      const isDebitNormal = account.category === 'asset' || account.category === 'expense';
      
      if (isDebitNormal) {
        openingBalance += (parseFloat(totals.total_debits || 0) - parseFloat(totals.total_credits || 0));
      } else {
        openingBalance += (parseFloat(totals.total_credits || 0) - parseFloat(totals.total_debits || 0));
      }
    }
    
    // Calculate running balances
    const isDebitNormal = account.category === 'asset' || account.category === 'expense' || account.category === 'cogs';
    let runningBalance = openingBalance;
    
    const ledgerEntries = lines.map(line => {
      const debit = parseFloat(line.debit_amount || 0);
      const credit = parseFloat(line.credit_amount || 0);
      
      if (isDebitNormal) {
        runningBalance += (debit - credit);
      } else {
        runningBalance += (credit - debit);
      }
      
      return {
        ...line,
        running_balance: runningBalance
      };
    });
    
    res.json({
      account: {
        id: account.id,
        account_code: account.account_code,
        account_name: account.account_name,
        category: account.category,
        opening_balance: account.opening_balance || 0
      },
      opening_balance: openingBalance,
      entries: ledgerEntries,
      closing_balance: runningBalance
    });
  } catch (error) {
    console.error('Error in GET /api/general-ledger/account/:accountId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get general ledger summary for all accounts
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate } = req.query;
    
    // Get all accounts
    const accountsResult = await db.query(
      'SELECT * FROM chart_of_accounts ORDER BY category, account_code'
    );
    
    const accounts = accountsResult.rows;
    
    if (accounts.length === 0) {
      return res.json({ summaries: [] });
    }
    
    // Process all accounts in parallel
    const accountSummaries = await Promise.all(
      accounts.map(async (account) => {
        let query = `
          SELECT 
            COALESCE(SUM(jel.debit_amount), 0) as total_debits,
            COALESCE(SUM(jel.credit_amount), 0) as total_credits
          FROM journal_entry_lines jel
          INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
          WHERE jel.account_id = $1
        `;
        
        const params = [account.id];
        let paramCount = 2;
        
        if (startDate) {
          query += ` AND je.entry_date >= $${paramCount++}`;
          params.push(startDate);
        }
        
        if (endDate) {
          query += ` AND je.entry_date <= $${paramCount++}`;
          params.push(endDate);
        }
        
        try {
          const totalsResult = await db.query(query, params);
          const totals = totalsResult.rows[0];
          
          const isDebitNormal = account.category === 'asset' || account.category === 'expense';
          const openingBalance = parseFloat(account.opening_balance || 0);
          const totalDebits = parseFloat(totals.total_debits || 0);
          const totalCredits = parseFloat(totals.total_credits || 0);
          
          let balance = openingBalance;
          if (isDebitNormal) {
            balance += (totalDebits - totalCredits);
          } else {
            balance += (totalCredits - totalDebits);
          }
          
          return {
            account_id: account.id,
            account_code: account.account_code,
            account_name: account.account_name,
            category: account.category,
            opening_balance: openingBalance,
            total_debits: totalDebits,
            total_credits: totalCredits,
            balance: balance
          };
        } catch (error) {
          console.error(`Error calculating balance for account ${account.id}:`, error);
          // Return account with zero balance on error
          return {
            account_id: account.id,
            account_code: account.account_code,
            account_name: account.account_name,
            category: account.category,
            opening_balance: parseFloat(account.opening_balance || 0),
            total_debits: 0,
            total_credits: 0,
            balance: parseFloat(account.opening_balance || 0)
          };
        }
      })
    );
    
    res.json({ summaries: accountSummaries });
  } catch (error) {
    console.error('Error in GET /api/general-ledger/summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get top 10 most used accounts (by number of journal entry lines)
router.get('/top-accounts', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    
    const result = await db.query(
      `SELECT 
        coa.id,
        coa.account_code,
        coa.account_name,
        coa.category,
        COUNT(jel.id) as transaction_count
      FROM chart_of_accounts coa
      INNER JOIN journal_entry_lines jel ON coa.id = jel.account_id
      GROUP BY coa.id, coa.account_code, coa.account_name, coa.category
      ORDER BY transaction_count DESC, coa.account_name ASC
      LIMIT 10`
    );
    
    res.json({ accounts: result.rows });
  } catch (error) {
    console.error('Error in GET /api/general-ledger/top-accounts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
