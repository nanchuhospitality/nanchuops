# How to Record Sales in the Accounting System

## Overview

Sales in Nova Accounting are recorded in two ways:
1. **Sales Records** - Daily sales tracking (QR sales, Cash sales, expenses, etc.)
2. **Journal Entries** - Double-entry bookkeeping entries (automatically created)

## Automatic Journal Entry Creation

When you create a sales record, the system **automatically creates journal entries** for proper accounting.

### What Happens Automatically

When you save a sales record:
1. **Sales Record** is saved to `sales_records` table
2. **Journal Entry** is automatically created with:
   - **Debit**: Cash/Bank Account (Asset) - for the sales amount
   - **Credit**: Sales Revenue Account (Income) - for the sales amount

### Required Accounts

For automatic journal entry creation, you need these accounts in your Chart of Accounts:

1. **Cash or Bank Account** (Asset category)
   - Examples: "Cash on Hand", "Bank Account", "Cash"
   - Account code: 1xxx (Asset prefix)

2. **Sales or Revenue Account** (Income category)
   - Examples: "Sales Revenue", "Sales", "Service Revenue"
   - Account code: 4xxx (Income prefix)

The system will automatically find accounts with names containing:
- **Cash/Bank**: "Cash", "Bank"
- **Sales/Revenue**: "Sales", "Revenue"

## Step-by-Step: Recording Sales

### Method 1: Using Sales Records (Recommended)

1. **Navigate to Sales Records**
   - Go to "Sales Records" → "New Sales Record"

2. **Enter Sales Information**
   - Date
   - Total QR Sales
   - Total Cash Sales
   - Description (optional)
   - Other details (rider payments, transportation, expenses)

3. **Save the Record**
   - Click "Create"
   - The system automatically:
     - Saves the sales record
     - Creates journal entry (JE-xxx)
     - Records: Debit Cash/Bank, Credit Sales Revenue

4. **Verify the Entry**
   - Go to "Accounting" → "Transactions" → "Journal Entries"
   - Look for entry with reference "SALES-{record_id}"
   - Or check General Ledger for Cash/Bank and Sales accounts

### Method 2: Manual Journal Entry

If you prefer to record sales manually:

1. **Navigate to Journal Entries**
   - Go to "Accounting" → "Transactions" → "Journal Entries"
   - Click "New Entry"

2. **Create Entry**
   - Date: Sales date
   - Reference: "Sales Invoice #123" (or similar)
   - Description: Sales description

3. **Add Lines**
   - **Line 1**: 
     - Account: Cash or Bank Account
     - Debit: Sales amount
     - Credit: 0
   - **Line 2**:
     - Account: Sales Revenue Account
     - Debit: 0
     - Credit: Sales amount

4. **Save**
   - Ensure debits = credits
   - Click "Create Entry"

## Accounting Principles

### Double-Entry Bookkeeping

Every sale must have:
- **Debit** (increases Assets): Cash/Bank Account
- **Credit** (increases Income): Sales Revenue Account

### Example Transaction

**Sale of $1,000 (QR: $600, Cash: $400)**

Journal Entry:
```
Date: 2024-01-15
Reference: SALES-123
Description: Daily Sales

Line 1:
  Account: Cash on Hand (1001)
  Debit: $400
  Credit: $0

Line 2:
  Account: Bank Account (1002)
  Debit: $600
  Credit: $0

Line 3:
  Account: Sales Revenue (4001)
  Debit: $0
  Credit: $1,000
```

**Result:**
- Cash on Hand increases by $400
- Bank Account increases by $600
- Sales Revenue increases by $1,000
- Total Debits ($1,000) = Total Credits ($1,000) ✓

## Setting Up Accounts

### 1. Create Cash/Bank Accounts

Go to "Accounting" → "Administration" → "Chart of Accounts"

**Cash Account:**
- Account Name: "Cash on Hand"
- Category: Asset
- Account Code: Auto-generated (e.g., 1001)
- Opening Balance: Current cash amount

**Bank Account:**
- Account Name: "Bank Account"
- Category: Asset
- Account Code: Auto-generated (e.g., 1002)
- Opening Balance: Current bank balance

### 2. Create Sales Revenue Account

**Sales Revenue Account:**
- Account Name: "Sales Revenue" or "Sales"
- Category: Income
- Account Code: Auto-generated (e.g., 4001)
- Opening Balance: 0 (usually)

## Viewing Sales in Accounting

### General Ledger

1. Go to "Accounting" → "Transactions" → "General Ledger"
2. Select "Cash on Hand" or "Bank Account"
3. See all sales transactions with running balances

### Journal Entries

1. Go to "Accounting" → "Transactions" → "Journal Entries"
2. Filter by reference "SALES-"
3. View all automatic sales entries

## Troubleshooting

### Journal Entries Not Created

**Problem**: Sales record saved but no journal entry created

**Solutions**:
1. Check if Cash/Bank account exists in Chart of Accounts
2. Check if Sales/Revenue account exists in Chart of Accounts
3. Account names should contain: "Cash", "Bank", "Sales", or "Revenue"
4. Check server logs for errors

### Wrong Accounts Used

**Problem**: System using wrong accounts

**Solutions**:
1. Create accounts with standard names:
   - "Cash on Hand" or "Bank Account" for assets
   - "Sales Revenue" or "Sales" for income
2. Or manually create journal entries for sales

### Manual Correction

If automatic entry is wrong:
1. Go to Journal Entries
2. Find the entry with reference "SALES-{id}"
3. Edit or delete it
4. Create correct entry manually

## Best Practices

1. **Always verify** journal entries after creating sales records
2. **Reconcile** cash/bank accounts regularly
3. **Use consistent** account names for automatic matching
4. **Review** General Ledger monthly for accuracy
5. **Keep** sales records and journal entries in sync

## Next Steps

After recording sales:
- Review General Ledger for Cash/Bank accounts
- Check Sales Revenue account in General Ledger
- Generate Trial Balance to verify balances
- Create Financial Statements (Income Statement will show Sales Revenue)
