const { getDb } = require('./database/init');

// Helper function to generate purchase record number
const generatePurchaseRecordNumber = async (db, purchaseDate) => {
  try {
    const year = new Date(purchaseDate).getFullYear();
    const fyFormat = `${year}/${String(year + 1).slice(-2)}`;
    
    const result = await db.query(
      `SELECT record_number FROM purchases_records 
       WHERE record_number LIKE $1 
       ORDER BY record_number DESC LIMIT 1`,
      [`PR-${fyFormat}-%`]
    );
    
    let nextSequence = 1;
    if (result.rows.length > 0 && result.rows[0].record_number) {
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
      const rate = parseFloat(vatRate) || 13.00;
      vatAmount = baseAmount * (rate / 100);
    }
  }
  
  const totalAmount = baseAmount + vatAmount;
  
  return {
    vatAmount: Math.round(vatAmount * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100
  };
};

const populatePurchases = async () => {
  const db = getDb();
  
  try {
    console.log('Starting to populate purchases records...\n');
    
    // Get admin user
    const userResult = await db.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
    if (userResult.rows.length === 0) {
      throw new Error('No admin user found. Please create an admin user first.');
    }
    const userId = userResult.rows[0].id;
    console.log(`✓ Using user ID: ${userId}`);
    
    // Get purchase accounts (expense accounts)
    const purchaseAccountsResult = await db.query(
      `SELECT id, account_name FROM chart_of_accounts 
       WHERE category = 'expense' 
       ORDER BY id LIMIT 5`
    );
    if (purchaseAccountsResult.rows.length === 0) {
      throw new Error('No purchase accounts found. Please create expense accounts first.');
    }
    const purchaseAccounts = purchaseAccountsResult.rows;
    console.log(`✓ Found ${purchaseAccounts.length} purchase accounts`);
    
    // Get suppliers (liability accounts that could be suppliers)
    const suppliersResult = await db.query(
      `SELECT id, account_name FROM chart_of_accounts 
       WHERE category = 'liability' 
       AND account_name ILIKE '%supplier%' OR account_name ILIKE '%vendor%'
       ORDER BY id LIMIT 5`
    );
    let suppliers = suppliersResult.rows;
    
    // If no suppliers found, get any liability accounts
    if (suppliers.length === 0) {
      const liabilityResult = await db.query(
        `SELECT id, account_name FROM chart_of_accounts 
         WHERE category = 'liability' 
         ORDER BY id LIMIT 5`
      );
      suppliers = liabilityResult.rows;
    }
    console.log(`✓ Found ${suppliers.length} supplier accounts`);
    
    // Get payment accounts (asset accounts like cash, bank)
    const paymentAccountsResult = await db.query(
      `SELECT id, account_name FROM chart_of_accounts 
       WHERE category = 'asset' 
       AND (account_name ILIKE '%cash%' OR account_name ILIKE '%bank%' OR account_name ILIKE '%account%')
       ORDER BY id LIMIT 3`
    );
    let paymentAccounts = paymentAccountsResult.rows;
    
    // If no payment accounts found, get any asset accounts
    if (paymentAccounts.length === 0) {
      const assetResult = await db.query(
        `SELECT id, account_name FROM chart_of_accounts 
         WHERE category = 'asset' 
         ORDER BY id LIMIT 3`
      );
      paymentAccounts = assetResult.rows;
    }
    console.log(`✓ Found ${paymentAccounts.length} payment accounts\n`);
    
    // Sample purchase data
    const samplePurchases = [
      { amount: 50000, description: 'Office Supplies Purchase', invoice: 'INV-001', vatType: 'standard', hasPayment: true },
      { amount: 75000, description: 'Raw Materials', invoice: 'INV-002', vatType: 'standard', hasPayment: true },
      { amount: 30000, description: 'Equipment Maintenance', invoice: 'INV-003', vatType: 'exempt', hasPayment: false },
      { amount: 120000, description: 'Inventory Purchase', invoice: 'INV-004', vatType: 'standard', hasPayment: true },
      { amount: 45000, description: 'Marketing Materials', invoice: 'INV-005', vatType: 'standard', hasPayment: true },
      { amount: 25000, description: 'Utility Services', invoice: 'INV-006', vatType: 'zero_rated', hasPayment: false },
      { amount: 90000, description: 'IT Equipment', invoice: 'INV-007', vatType: 'standard', hasPayment: true },
      { amount: 35000, description: 'Cleaning Supplies', invoice: 'INV-008', vatType: 'standard', hasPayment: true },
      { amount: 60000, description: 'Packaging Materials', invoice: 'INV-009', vatType: 'standard', hasPayment: false },
      { amount: 80000, description: 'Transportation Services', invoice: 'INV-010', vatType: 'standard', hasPayment: true },
      { amount: 40000, description: 'Professional Services', invoice: 'INV-011', vatType: 'exempt', hasPayment: true },
      { amount: 55000, description: 'Office Furniture', invoice: 'INV-012', vatType: 'standard', hasPayment: true },
      { amount: 70000, description: 'Security Services', invoice: 'INV-013', vatType: 'standard', hasPayment: false },
      { amount: 32000, description: 'Printing Services', invoice: 'INV-014', vatType: 'standard', hasPayment: true },
      { amount: 95000, description: 'Construction Materials', invoice: 'INV-015', vatType: 'standard', hasPayment: true },
    ];
    
    // Generate dates (spread over last 3 months)
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 15; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - (i * 7)); // Spread over weeks
      dates.push(date.toISOString().split('T')[0]);
    }
    
    let insertedCount = 0;
    
    for (let i = 0; i < samplePurchases.length; i++) {
      const purchase = samplePurchases[i];
      const purchaseDate = dates[i];
      const paymentDate = purchase.hasPayment ? purchaseDate : null;
      
      // Select random accounts
      const purchaseAccount = purchaseAccounts[i % purchaseAccounts.length];
      const supplier = suppliers.length > 0 ? suppliers[i % suppliers.length] : null;
      const paymentAccount = purchase.hasPayment && paymentAccounts.length > 0 
        ? paymentAccounts[i % paymentAccounts.length] 
        : null;
      
      // Calculate VAT
      const vatCalc = calculateVAT(
        purchase.amount,
        purchase.vatType,
        purchase.vatType === 'standard' ? 13.00 : 0,
        'auto',
        null
      );
      
      // Generate record number
      const recordNumber = await generatePurchaseRecordNumber(db, purchaseDate);
      
      // Insert purchase record
      await db.query(
        `INSERT INTO purchases_records (
          user_id, date, purchase_date, payment_date, amount, description, 
          invoice_number, payment_account_id, supplier_id, purchase_account_id, 
          voucher_created, record_number,
          vat_type, vat_rate, vat_amount, vat_calculation_method, total_amount
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          userId,
          purchaseDate,
          purchaseDate,
          paymentDate,
          purchase.amount,
          purchase.description,
          purchase.invoice,
          paymentAccount ? paymentAccount.id : null,
          supplier ? supplier.id : null,
          purchaseAccount.id,
          0, // voucher_created
          recordNumber,
          purchase.vatType,
          purchase.vatType === 'standard' ? 13.00 : 0,
          vatCalc.vatAmount,
          'auto',
          vatCalc.totalAmount
        ]
      );
      
      insertedCount++;
      console.log(`✓ Inserted: ${recordNumber} - ${purchase.description} (${purchase.amount} NPR, VAT: ${vatCalc.vatAmount} NPR)`);
    }
    
    console.log(`\n✅ Successfully inserted ${insertedCount} purchase records!`);
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error populating purchases:', error);
    process.exit(1);
  }
};

// Run the script
populatePurchases();
