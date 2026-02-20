import React, { useState, useEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import Pagination from '../components/Pagination';
import { supabase } from '../lib/supabaseClient';
import './SalesList.css';

const SalesList = () => {
  const { branchslug } = useParams();
  const [records, setRecords] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMenuOpen, setActionMenuOpen] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const { user, authProvider } = useContext(AuthContext);
  const isSupabaseMode = authProvider === 'supabase';
  const branchPath = (path) => `/${branchslug || user?.branch_code || 'main'}/${path}`;

  useEffect(() => {
    fetchRecords();
    if (user?.role === 'admin') {
      fetchBranches();
    }
  }, [user?.role, isSupabaseMode]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchRecords();
    }
  }, [branchFilter, user?.role, isSupabaseMode]);

  const fetchRecords = async () => {
    try {
      if (isSupabaseMode) {
        let query = supabase
          .from('sales_records')
          .select('*, branches(name), users(username, full_name)')
          .order('date', { ascending: false });
        if (user?.role === 'admin' && branchFilter) {
          query = query.eq('branch_id', parseInt(branchFilter, 10));
        }
        const { data, error: qErr } = await query;
        if (qErr) throw qErr;
        const mapped = (data || []).map((r) => ({
          ...r,
          branch_name: r.branches?.name || null,
          username: r.users?.username || null,
          full_name: r.users?.full_name || null
        }));
        setRecords(mapped);
      } else {
        const params = new URLSearchParams();
        if (user?.role === 'admin' && branchFilter) {
          params.set('branch_id', branchFilter);
        }
        const response = await axios.get(`/api/sales${params.toString() ? `?${params.toString()}` : ''}`);
        setRecords(response.data.records || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load sales records');
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      if (isSupabaseMode) {
        const { data, error: bErr } = await supabase
          .from('branches')
          .select('id, name, code')
          .eq('is_active', true)
          .order('name', { ascending: true });
        if (bErr) throw bErr;
        setBranches(data || []);
      } else {
        const response = await axios.get('/api/branches');
        setBranches(response.data.branches || []);
      }
    } catch (err) {
      console.error('Failed to load branches', err);
    }
  };

  const formatCurrency = (amount) => {
    const formatted = new Intl.NumberFormat('en-NP', {
      style: 'currency',
      currency: 'NPR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
    // Remove trailing .00
    return formatted.replace(/\.00$/, '');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const calculateTotalExpenses = (record) => {
    let total = 0;

    // Add rider payment total from rider_payments JSON
    if (record.rider_payments) {
      try {
        const payments = JSON.parse(record.rider_payments);
        if (Array.isArray(payments)) {
          payments.forEach(r => {
            const basePay = parseFloat(r.basePay) || 0;
            const tips = parseFloat(r.tips) || 0;
            const extraKm = parseFloat(r.extraKm) || 0;
            const extraOrder = parseFloat(r.extraOrder) || 0;
            const overtime = parseFloat(r.overtime) || 0;
            total += basePay + tips + extraKm + extraOrder + overtime;
          });
        }
      } catch (e) {
        console.error('Error parsing rider payments:', e);
        // Fallback to total_rider_payment if available
        if (record.total_rider_payment) {
          total += parseFloat(record.total_rider_payment) || 0;
        }
      }
    } else if (record.total_rider_payment) {
      total += parseFloat(record.total_rider_payment) || 0;
    }

    // Add transportation total
    if (record.transportation_recipients) {
      try {
        const recipients = JSON.parse(record.transportation_recipients);
        if (Array.isArray(recipients)) {
          recipients.forEach(r => {
            total += parseFloat(r.amount) || 0;
          });
        }
      } catch (e) {
        // If parsing fails, use transportation_amount if available
        if (record.transportation_amount) {
          total += parseFloat(record.transportation_amount) || 0;
        }
      }
    } else if (record.transportation_amount) {
      total += parseFloat(record.transportation_amount) || 0;
    }

    // Add other expenses total
    if (record.other_expenses) {
      try {
        const expenses = JSON.parse(record.other_expenses);
        if (Array.isArray(expenses)) {
          expenses.forEach(e => {
            total += parseFloat(e.amount) || 0;
          });
        }
      } catch (e) {
        console.error('Error parsing other expenses:', e);
      }
    }

    return total;
  };

  if (loading) {
    return <div className="sales-list-loading">Loading sales records...</div>;
  }

  // Hide table for night_manager
  if (user?.role === 'night_manager') {
    return (
      <div className="sales-list">
        <div className="page-header">
          <h1>Sales Records</h1>
          <Link to={branchPath('sales/new')} className="btn-new">
            + New Sales Record
          </Link>
        </div>
        {error && <div className="error-message">{error}</div>}
        <div className="empty-state">
          <p>You can create and edit sales records, but the summary table is only available to administrators.</p>
        </div>
      </div>
    );
  }

  const handleViewRecord = (record) => {
    const totalExpenses = calculateTotalExpenses(record);
    const cashSales = parseFloat(record.total_cash_sales) || 0;
    const cashRemaining = cashSales - totalExpenses;

    // Parse rider payments
    let riderPaymentsHtml = '';
    let totalRiderPayment = 0;
    if (record.rider_payments) {
      try {
        const payments = JSON.parse(record.rider_payments);
        if (Array.isArray(payments) && payments.length > 0) {
          totalRiderPayment = payments.reduce((sum, r) => {
            return sum + (parseFloat(r.basePay) || 0) + (parseFloat(r.tips) || 0) + 
                   (parseFloat(r.extraKm) || 0) + (parseFloat(r.extraOrder) || 0) + 
                   (parseFloat(r.overtime) || 0);
          }, 0);
          
          riderPaymentsHtml = `
            <table class="expense-table">
              <thead>
                <tr>
                  <th>Rider Name</th>
                  <th>Base Pay</th>
                  <th>Tips</th>
                  <th>Extra KM</th>
                  <th>Extra Order</th>
                  <th>Overtime</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${payments.map((r, idx) => {
                  const riderTotal = (parseFloat(r.basePay) || 0) + (parseFloat(r.tips) || 0) + 
                                    (parseFloat(r.extraKm) || 0) + (parseFloat(r.extraOrder) || 0) + 
                                    (parseFloat(r.overtime) || 0);
                  return `
                    <tr>
                      <td>${r.name || 'Rider ' + (idx + 1)}</td>
                      <td>${formatCurrency(r.basePay || 0)}</td>
                      <td>${formatCurrency(r.tips || 0)}</td>
                      <td>${formatCurrency(r.extraKm || 0)}</td>
                      <td>${formatCurrency(r.extraOrder || 0)}</td>
                      <td>${formatCurrency(r.overtime || 0)}</td>
                      <td><strong>${formatCurrency(riderTotal)}</strong></td>
                    </tr>
                  `;
                }).join('')}
                <tr class="table-total-row">
                  <td colspan="6"><strong>Total Rider Payment</strong></td>
                  <td><strong>${formatCurrency(totalRiderPayment)}</strong></td>
                </tr>
              </tbody>
            </table>
          `;
        }
      } catch (e) {
        console.error('Error parsing rider payments:', e);
      }
    }

    // Parse transportation recipients
    let transportationHtml = '';
    let totalTransportation = 0;
    if (record.transportation_recipients) {
      try {
        const recipients = JSON.parse(record.transportation_recipients);
        if (Array.isArray(recipients) && recipients.length > 0) {
          totalTransportation = recipients.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
          transportationHtml = `
            <table class="expense-table">
              <thead>
                <tr>
                  <th>Recipient Name</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${recipients.map(r => {
                  const amount = parseFloat(r.amount) || 0;
                  return `
                    <tr>
                      <td>${r.name || 'Recipient'}</td>
                      <td>${formatCurrency(amount)}</td>
                    </tr>
                  `;
                }).join('')}
                <tr class="table-total-row">
                  <td><strong>Total Transportation</strong></td>
                  <td><strong>${formatCurrency(totalTransportation)}</strong></td>
                </tr>
              </tbody>
            </table>
          `;
        }
      } catch (e) {
        console.error('Error parsing transportation recipients:', e);
      }
    }

    // Parse other expenses
    let otherExpensesHtml = '';
    let totalOtherExpenses = 0;
    if (record.other_expenses) {
      try {
        const expenses = JSON.parse(record.other_expenses);
        if (Array.isArray(expenses) && expenses.length > 0) {
          totalOtherExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
          otherExpensesHtml = `
            <table class="expense-table">
              <thead>
                <tr>
                  <th>Particulars</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${expenses.map(e => {
                  const amount = parseFloat(e.amount) || 0;
                  return `
                    <tr>
                      <td>${e.particulars || 'Expense'}</td>
                      <td>${formatCurrency(amount)}</td>
                    </tr>
                  `;
                }).join('')}
                <tr class="table-total-row">
                  <td><strong>Total Other Expenses</strong></td>
                  <td><strong>${formatCurrency(totalOtherExpenses)}</strong></td>
                </tr>
              </tbody>
            </table>
          `;
        }
      } catch (e) {
        console.error('Error parsing other expenses:', e);
      }
    }

    // Create a view window
    const viewWindow = window.open('', '_blank');
    const recordNumber = record.record_number || 'N/A';
    const recordDate = formatDate(record.date);
    viewWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Sale Record for ${recordDate} and ${recordNumber}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 2rem;
              max-width: 800px;
              margin: 0 auto;
            }
            h1 {
              color: #333;
              border-bottom: 2px solid #667eea;
              padding-bottom: 0.5rem;
            }
            .info-section {
              margin: 1.5rem 0;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              padding: 0.75rem 0;
              border-bottom: 1px solid #eee;
            }
            .info-label {
              font-weight: 600;
              color: #666;
            }
            .info-value {
              color: #333;
              font-weight: 500;
            }
            .negative {
              color: #e53e3e;
            }
            .section-title {
              font-size: 1.1rem;
              font-weight: 600;
              color: #667eea;
              margin-top: 1.5rem;
              margin-bottom: 0.5rem;
            }
            .expense-table {
              width: 100%;
              border-collapse: collapse;
              margin: 1rem 0;
              font-size: 0.9rem;
            }
            .expense-table thead {
              background-color: #f8f9fa;
            }
            .expense-table th {
              padding: 0.75rem;
              text-align: left;
              font-weight: 600;
              color: #333;
              border-bottom: 2px solid #dee2e6;
            }
            .expense-table td {
              padding: 0.75rem;
              border-bottom: 1px solid #e9ecef;
              color: #495057;
            }
            .expense-table tbody tr:hover {
              background-color: #f8f9fa;
            }
            .expense-table .table-total-row {
              background-color: #f0f0f0;
              font-weight: 600;
            }
            .expense-table .table-total-row td {
              border-top: 2px solid #333;
              padding-top: 1rem;
            }
            @media print {
              body { padding: 1rem; }
            }
          </style>
        </head>
        <body>
          <h1>Sale Record for ${recordDate} and ${recordNumber}</h1>
          <div class="info-section">
            <div class="info-row">
              <span class="info-label">Date:</span>
              <span class="info-value">${formatDate(record.date)}</span>
            </div>
            ${record.record_number ? `
            <div class="info-row">
              <span class="info-label">Record Number:</span>
              <span class="info-value">${record.record_number}</span>
            </div>
            ` : ''}
            ${record.branch ? `
            <div class="info-row">
              <span class="info-label">Branch:</span>
              <span class="info-value">${record.branch}</span>
            </div>
            ` : ''}
            <div class="info-row">
              <span class="info-label">Employee:</span>
              <span class="info-value">${record.full_name || record.username || '-'}</span>
            </div>
            ${record.description ? `
            <div class="info-row">
              <span class="info-label">Note:</span>
              <span class="info-value">${record.description}</span>
            </div>
            ` : ''}
          </div>

          <div class="section-title">Sales Breakdown</div>
          <div class="info-section">
            <div class="info-row">
              <span class="info-label">Total QR Sales:</span>
              <span class="info-value">${formatCurrency(record.total_qr_sales || 0)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Total Cash Sales:</span>
              <span class="info-value">${formatCurrency(record.total_cash_sales || 0)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Total Food Sales:</span>
              <span class="info-value">${formatCurrency(record.total_food_sales || 0)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Total Beverages Sales:</span>
              <span class="info-value">${formatCurrency(record.total_beverages_sales || 0)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Delivery Charge Collected:</span>
              <span class="info-value">${formatCurrency(record.delivery_charge_collected || 0)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Total Sales:</span>
              <span class="info-value">${formatCurrency(record.amount || 0)}</span>
            </div>
          </div>

          <div class="section-title">Expenses Breakdown</div>
          <div class="info-section">
            ${riderPaymentsHtml ? `
            <div class="subsection" style="margin-bottom: 2rem;">
              <div class="info-row" style="font-weight: 600; color: #667eea; margin-bottom: 0.5rem;">
                <span>Rider Payment</span>
                <span>${formatCurrency(totalRiderPayment)}</span>
              </div>
              ${riderPaymentsHtml}
            </div>
            ` : ''}
            
            ${transportationHtml ? `
            <div class="subsection" style="margin-bottom: 2rem;">
              <div class="info-row" style="font-weight: 600; color: #667eea; margin-bottom: 0.5rem;">
                <span>Transportation</span>
                <span>${formatCurrency(totalTransportation)}</span>
              </div>
              ${transportationHtml}
            </div>
            ` : ''}
            
            ${otherExpensesHtml ? `
            <div class="subsection" style="margin-bottom: 2rem;">
              <div class="info-row" style="font-weight: 600; color: #667eea; margin-bottom: 0.5rem;">
                <span>Other Expenses</span>
                <span>${formatCurrency(totalOtherExpenses)}</span>
              </div>
              ${otherExpensesHtml}
            </div>
            ` : ''}
            
            <div class="info-row" style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid #667eea; font-weight: 600;">
              <span>Total Expenses:</span>
              <span>${formatCurrency(totalExpenses)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Cash Remaining:</span>
              <span class="info-value ${cashRemaining < 0 ? 'negative' : ''}">${formatCurrency(cashRemaining)}</span>
            </div>
          </div>
        </body>
      </html>
    `);
    viewWindow.document.close();
  };

  return (
    <div className="sales-list">
      <div className="page-header">
        <h1>Sales Record</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {user?.role === 'admin' && (
            <div className="branch-filter-dropdown">
              <select
                className="branch-filter-select"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
              >
                <option value="">All Branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <span className="branch-filter-caret" aria-hidden="true">▼</span>
            </div>
          )}
          <Link to={branchPath('sales/new')} className="btn-new">
            + New Sales Record
          </Link>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {records.length === 0 ? (
        <div className="empty-state">
          <p>No sales records found. Create your first record!</p>
          <Link to={branchPath('sales/new')} className="btn-primary">
            Create Sales Record
          </Link>
        </div>
      ) : (
        <div className="table-container">
          <table className="sales-table">
            <thead>
              <tr>
                <th>Record #</th>
                <th>Branch</th>
                <th>Date</th>
                <th>Total Sales</th>
                <th>Total QR Sales</th>
                <th>Cash Sales</th>
                <th>Total Expenses</th>
                <th>Cash Remaining</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const totalExpenses = calculateTotalExpenses(record);
                const cashSales = parseFloat(record.total_cash_sales) || 0;
                const cashRemaining = cashSales - totalExpenses;
                return (
                  <tr key={record.id}>
                    <td className="record-number-cell">{record.record_number || '-'}</td>
                    <td>{record.branch_name || '-'}</td>
                    <td>{formatDate(record.date)}</td>
                    <td className="amount">{formatCurrency(record.amount || 0)}</td>
                    <td className="amount">{formatCurrency(record.total_qr_sales || 0)}</td>
                    <td className="amount">{formatCurrency(record.total_cash_sales || 0)}</td>
                    <td className="amount expenses-amount">{formatCurrency(totalExpenses)}</td>
                    <td className={`amount ${cashRemaining < 0 ? 'negative-amount' : ''}`}>
                    {formatCurrency(cashRemaining)}
                  </td>
                  <td className="actions-cell">
                    <div className="action-dropdown-container">
                      <button
                        className="btn-action-menu"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (actionMenuOpen === record.id) {
                            setActionMenuOpen(null);
                          } else {
                            const button = e.currentTarget;
                            const rect = button.getBoundingClientRect();
                            setDropdownPosition({
                              top: rect.bottom + window.scrollY + 4,
                              right: window.innerWidth - rect.right
                            });
                            setActionMenuOpen(record.id);
                          }
                        }}
                        title="Actions"
                      >
                        ⋮
                      </button>
                      {actionMenuOpen === record.id && createPortal(
                        <>
                          <div 
                            className="action-dropdown-overlay"
                            onClick={() => setActionMenuOpen(null)}
                          ></div>
                          <div 
                            className="action-dropdown-menu"
                            style={{
                              top: `${dropdownPosition.top}px`,
                              right: `${dropdownPosition.right}px`
                            }}
                          >
                            <button
                              onClick={() => {
                                handleViewRecord(record);
                                setActionMenuOpen(null);
                              }}
                              className="action-dropdown-item"
                            >
                              <span>👁️</span> View
                            </button>
                            <Link
                              to={branchPath(`sales/edit/${record.id}`)}
                              className="action-dropdown-item"
                              onClick={() => setActionMenuOpen(null)}
                            >
                              <span>✏️</span> Edit
                            </Link>
                          </div>
                        </>,
                        document.body
                      )}
                    </div>
                  </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(records.length / itemsPerPage)}
            onPageChange={setCurrentPage}
            totalItems={records.length}
            itemsPerPage={itemsPerPage}
          />
        </div>
      )}
    </div>
  );
};

export default SalesList;
