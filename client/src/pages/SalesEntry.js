import React, { useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import './SalesEntry.css';

const SalesEntry = () => {
  const { id, branchslug } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const { user: currentUser } = useContext(AuthContext);
  const branchPath = (path) => `/${branchslug || currentUser?.branch_code || 'main'}/${path}`;

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    branch_id: '',
    description: '',
    total_qr_sales: '',
    total_cash_sales: '',
    total_food_sales: '',
    total_beverages_sales: '',
    delivery_charge_collected: '',
    total_rider_payment: '',
    transportation_amount: ''
  });
  const [transportationRecipients, setTransportationRecipients] = useState([]);
  const [transportationRecipientsList, setTransportationRecipientsList] = useState([{ name: '', amount: '', isCustom: false, employeeId: '' }]);
  const [riderPayments, setRiderPayments] = useState([{ name: '', basePay: '', tips: '', extraKm: '', extraOrder: '', overtime: '', totalOrder: '' }]);
  const [riders, setRiders] = useState([]);
  const [riderAutocompleteOpen, setRiderAutocompleteOpen] = useState({});
  const [otherExpenses, setOtherExpenses] = useState([{ particulars: '', amount: '' }]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchRecord = useCallback(async () => {
    if (!id) return;
    try {
      const response = await axios.get(`/api/sales/${id}`);
      const record = response.data.record;
      setFormData({
        date: record.date,
        branch_id: record.branch_id ? String(record.branch_id) : '',
        description: record.description || '',
        total_qr_sales: record.total_qr_sales || '',
        total_cash_sales: record.total_cash_sales || '',
        total_food_sales: record.total_food_sales || '',
        total_beverages_sales: record.total_beverages_sales || '',
        delivery_charge_collected: record.delivery_charge_collected || '',
        total_rider_payment: record.total_rider_payment || '',
        transportation_amount: record.transportation_amount || ''
      });
      
      // Parse transportation recipients from JSON
      if (record.transportation_recipients) {
        try {
          const recipients = JSON.parse(record.transportation_recipients);
          if (Array.isArray(recipients) && recipients.length > 0) {
            setTransportationRecipientsList(recipients.map(r => ({
              name: r.name || '',
              amount: r.amount || '',
              isCustom: r.isCustom || false,
              employeeId: r.employeeId || ''
            })));
          }
        } catch (e) {
          console.error('Error parsing transportation recipients:', e);
        }
      }

      // Parse rider payments from JSON
      if (record.rider_payments) {
        try {
          const payments = JSON.parse(record.rider_payments);
          if (Array.isArray(payments) && payments.length > 0) {
            setRiderPayments(payments.map(r => ({
              name: r.name || '',
              basePay: r.basePay || '',
              tips: r.tips || '',
              extraKm: r.extraKm || '',
              extraOrder: r.extraOrder || '',
              overtime: r.overtime || '',
              totalOrder: r.totalOrder || ''
            })));
          }
        } catch (e) {
          console.error('Error parsing rider payments:', e);
        }
      }

      // Parse other expenses from JSON
      if (record.other_expenses) {
        try {
          const expenses = JSON.parse(record.other_expenses);
          if (Array.isArray(expenses) && expenses.length > 0) {
            setOtherExpenses(expenses.map(e => ({
              particulars: e.particulars || '',
              amount: e.amount || ''
            })));
          }
        } catch (e) {
          console.error('Error parsing other expenses:', e);
        }
      }
    } catch (err) {
      setError('Failed to load sales record');
    }
  }, [id]);

  const fetchBranches = useCallback(async () => {
    try {
      const response = await axios.get('/api/branches');
      setBranches(response.data.branches || []);
      setFormData((prev) => {
        if (currentUser?.role !== 'admin' && currentUser?.branch_id) {
          return { ...prev, branch_id: String(currentUser.branch_id) };
        }
        if (prev.branch_id) return prev;
        if (response.data.branches?.length > 0) {
          return { ...prev, branch_id: String(response.data.branches[0].id) };
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to load branches:', err);
    }
  }, [currentUser?.branch_id, currentUser?.role]);

  const fetchTransportationRecipients = useCallback(async () => {
    try {
      const response = await axios.get('/api/employees/transportation/recipients');
      setTransportationRecipients(response.data.employees);
    } catch (err) {
      console.error('Failed to load transportation recipients:', err);
    }
  }, []);

  const fetchRiders = useCallback(async () => {
    try {
      const response = await axios.get('/api/employees');
      // Filter employees with rider position
      const riderEmployees = response.data.employees.filter(emp => 
        emp.post && emp.post.toLowerCase() === 'rider'
      );
      setRiders(riderEmployees);
    } catch (err) {
      console.error('Failed to load riders:', err);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
    fetchTransportationRecipients();
    fetchRiders();
    if (isEdit) {
      fetchRecord();
    }
  }, [id, isEdit, fetchRecord, fetchBranches, fetchTransportationRecipients, fetchRiders]);

  const handleChange = (e) => {
    const newFormData = {
      ...formData,
      [e.target.name]: e.target.value
    };
    setFormData(newFormData);
  };

  // Format number to remove trailing zeros
  const formatAmount = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '0';
    const num = parseFloat(value);
    // Remove trailing zeros
    return num % 1 === 0 ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '');
  };

  // Calculate total amount from QR + Cash sales
  const calculateTotalAmount = () => {
    const qr = parseFloat(formData.total_qr_sales) || 0;
    const cash = parseFloat(formData.total_cash_sales) || 0;
    return qr + cash;
  };

  // Calculate total from food + beverages + delivery charge
  const calculateSalesBreakdownTotal = () => {
    const food = parseFloat(formData.total_food_sales) || 0;
    const beverages = parseFloat(formData.total_beverages_sales) || 0;
    const delivery = parseFloat(formData.delivery_charge_collected) || 0;
    return food + beverages + delivery;
  };

  // Check if totals match
  const getSalesValidationError = () => {
    const totalSales = calculateTotalAmount();
    const breakdownTotal = calculateSalesBreakdownTotal();
    const difference = Math.abs(totalSales - breakdownTotal);
    
    if (totalSales > 0 && breakdownTotal > 0 && difference > 0.01) {
      return {
        hasError: true,
        totalSales: totalSales,
        breakdownTotal: breakdownTotal,
        difference: difference
      };
    }
    return { hasError: false };
  };

  const addTransportationRecipient = () => {
    setTransportationRecipientsList([...transportationRecipientsList, { name: '', amount: '', isCustom: false, employeeId: '' }]);
  };

  const removeTransportationRecipient = (index) => {
    const updated = transportationRecipientsList.filter((_, i) => i !== index);
    setTransportationRecipientsList(updated);
  };

  const updateTransportationRecipient = (index, field, value) => {
    const updated = [...transportationRecipientsList];
    if (field === 'isCustom') {
      updated[index] = { ...updated[index], isCustom: value, name: '', employeeId: '' };
    } else if (field === 'employeeId') {
      const selectedEmployee = transportationRecipients.find(e => {
        // Handle both string and number comparisons
        return e.id.toString() === value.toString() || e.id === parseInt(value);
      });
      updated[index] = { 
        ...updated[index], 
        employeeId: value,
        name: selectedEmployee ? selectedEmployee.name : '',
        isCustom: false
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setTransportationRecipientsList(updated);
  };

  const addRiderPayment = () => {
    setRiderPayments([...riderPayments, { name: '', basePay: '', tips: '', extraKm: '', extraOrder: '', overtime: '', totalOrder: '' }]);
  };

  const removeRiderPayment = (index) => {
    const updated = riderPayments.filter((_, i) => i !== index);
    setRiderPayments(updated.length > 0 ? updated : [{ name: '', basePay: '', tips: '', extraKm: '', extraOrder: '', overtime: '', totalOrder: '' }]);
  };

  const updateRiderPayment = (index, field, value) => {
    const updated = [...riderPayments];
    updated[index] = { ...updated[index], [field]: value };
    
    // If updating name, show autocomplete
    if (field === 'name') {
      setRiderAutocompleteOpen({ ...riderAutocompleteOpen, [index]: true });
    }
    
    setRiderPayments(updated);
  };

  const selectRider = (index, riderName) => {
    const updated = [...riderPayments];
    updated[index] = { ...updated[index], name: riderName };
    setRiderPayments(updated);
    setRiderAutocompleteOpen({ ...riderAutocompleteOpen, [index]: false });
  };

  const getFilteredRiders = (index) => {
    const searchTerm = riderPayments[index]?.name?.toLowerCase() || '';
    if (!searchTerm) return riders;
    return riders.filter(rider => 
      rider.name.toLowerCase().includes(searchTerm)
    );
  };

  const addOtherExpense = () => {
    setOtherExpenses([...otherExpenses, { particulars: '', amount: '' }]);
  };

  const removeOtherExpense = (index) => {
    const updated = otherExpenses.filter((_, i) => i !== index);
    setOtherExpenses(updated.length > 0 ? updated : [{ particulars: '', amount: '' }]);
  };

  const updateOtherExpense = (index, field, value) => {
    const updated = [...otherExpenses];
    updated[index] = { ...updated[index], [field]: value };
    setOtherExpenses(updated);
  };

  const calculateOtherExpensesTotal = () => {
    return otherExpenses
      .filter(e => e.particulars && e.amount)
      .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  };

  const calculateTransportationTotal = () => {
    return transportationRecipientsList
      .filter(r => r.name && r.amount)
      .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  };

  const calculateTotalExpenses = () => {
    const riderTotal = calculateRiderTotals().totalPayment || 0;
    const transportationTotal = calculateTransportationTotal();
    const otherExpensesTotal = calculateOtherExpensesTotal();
    return riderTotal + transportationTotal + otherExpensesTotal;
  };

  const calculateCashRemaining = () => {
    const cashSales = parseFloat(formData.total_cash_sales) || 0;
    const totalExpenses = calculateTotalExpenses();
    return cashSales - totalExpenses;
  };

  // Calculate totals for all riders
  const calculateRiderTotals = () => {
    const totals = {
      basePay: 0,
      tips: 0,
      extraKm: 0,
      extraOrder: 0,
      overtime: 0,
      totalOrder: 0,
      totalPayment: 0
    };

    riderPayments.forEach(rider => {
      const basePay = parseFloat(rider.basePay) || 0;
      const tips = parseFloat(rider.tips) || 0;
      const extraKm = parseFloat(rider.extraKm) || 0;
      const extraOrder = parseFloat(rider.extraOrder) || 0;
      const overtime = parseFloat(rider.overtime) || 0;
      
      totals.basePay += basePay;
      totals.tips += tips;
      totals.extraKm += extraKm;
      totals.extraOrder += extraOrder;
      totals.overtime += overtime;
      totals.totalOrder += parseInt(rider.totalOrder) || 0;
      totals.totalPayment += basePay + tips + extraKm + extraOrder + overtime;
    });

    return totals;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Calculate amount from QR + Cash sales
    const qr = parseFloat(formData.total_qr_sales) || 0;
    const cash = parseFloat(formData.total_cash_sales) || 0;
    const amount = qr + cash;

    // Calculate total transportation amount from recipients
    const totalTransportation = transportationRecipientsList
      .filter(r => r.name && r.amount)
      .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

    // Filter out empty recipients and prepare for JSON
    const validRecipients = transportationRecipientsList
      .filter(r => r.name && r.amount)
      .map(r => ({
        name: r.name,
        amount: parseFloat(r.amount) || 0,
        isCustom: r.isCustom || false,
        employeeId: r.employeeId || null
      }));

    // Filter out empty riders and prepare for JSON
    const validRiders = riderPayments
      .filter(r => r.name)
      .map(r => ({
        name: r.name,
        basePay: parseFloat(r.basePay) || 0,
        tips: parseFloat(r.tips) || 0,
        extraKm: parseFloat(r.extraKm) || 0,
        extraOrder: parseFloat(r.extraOrder) || 0,
        overtime: parseFloat(r.overtime) || 0,
        totalOrder: parseFloat(r.totalOrder) || 0
      }));

    // Calculate total rider payment from all riders (sum of all payment components)
    const totalRiderPayment = validRiders.reduce((sum, r) => {
      return sum + r.basePay + r.tips + r.extraKm + r.extraOrder + r.overtime;
    }, 0);

    // Filter out empty expenses and prepare for JSON
    const validExpenses = otherExpenses
      .filter(e => e.particulars && e.amount)
      .map(e => ({
        particulars: e.particulars,
        amount: parseFloat(e.amount) || 0
      }));

    const submitData = {
      ...formData,
      branch_id: formData.branch_id ? parseInt(formData.branch_id, 10) : null,
      amount: amount,
      transportation_amount: totalTransportation,
      transportation_recipients: validRecipients.length > 0 ? JSON.stringify(validRecipients) : null,
      total_rider_payment: totalRiderPayment,
      rider_payments: validRiders.length > 0 ? JSON.stringify(validRiders) : null,
      other_expenses: validExpenses.length > 0 ? JSON.stringify(validExpenses) : null
    };

    try {
      if (isEdit) {
        await axios.put(`/api/sales/${id}`, submitData);
      } else {
        await axios.post('/api/sales', submitData);
      }
      navigate(branchPath('sales'));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save sales record');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sales-entry">
      <div className="page-header">
        <h1>{isEdit ? 'Edit Sales Record' : 'New Sales Record'}</h1>
      </div>

      <div className="form-container">
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="date">Date *</label>
              <input
                type="date"
                id="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="branch_id">Branch *</label>
              <select
                id="branch_id"
                name="branch_id"
                value={formData.branch_id}
                onChange={handleChange}
                required
                disabled={loading || currentUser?.role !== 'admin'}
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              {currentUser?.role !== 'admin' && (
                <small className="field-hint">Branch is assigned from your user profile.</small>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="description">Note</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="3"
              placeholder="Enter note..."
            />
          </div>

          <div className="form-section">
            <h3>Rider Payment</h3>
            <div className="rider-payment-table-container">
              <table className="rider-payment-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Base Pay</th>
                    <th>Tips</th>
                    <th>Extra KM</th>
                    <th>Extra Order</th>
                    <th>Overtime</th>
                    <th>Total Orders</th>
                    <th>Total Rider Payment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {riderPayments.map((rider, index) => (
                    <tr key={index}>
                      <td>
                        <div className="rider-autocomplete-container">
                          <input
                            type="text"
                            value={rider.name}
                            onChange={(e) => updateRiderPayment(index, 'name', e.target.value)}
                            onFocus={() => setRiderAutocompleteOpen({ ...riderAutocompleteOpen, [index]: true })}
                            onBlur={() => {
                              // Delay to allow click on dropdown item
                              setTimeout(() => {
                                setRiderAutocompleteOpen({ ...riderAutocompleteOpen, [index]: false });
                              }, 200);
                            }}
                            placeholder="Type rider name"
                            className="rider-input"
                          />
                          {riderAutocompleteOpen[index] && getFilteredRiders(index).length > 0 && (
                            <div className="rider-autocomplete-dropdown">
                              {getFilteredRiders(index).map((riderEmp) => (
                                <div
                                  key={riderEmp.id}
                                  className="rider-autocomplete-item"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    selectRider(index, riderEmp.name);
                                  }}
                                >
                                  {riderEmp.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={rider.basePay}
                          onChange={(e) => updateRiderPayment(index, 'basePay', e.target.value)}
                          step="0.01"
                          min="0"
                          placeholder="0"
                          className="rider-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={rider.tips}
                          onChange={(e) => updateRiderPayment(index, 'tips', e.target.value)}
                          step="0.01"
                          min="0"
                          placeholder="0"
                          className="rider-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={rider.extraKm}
                          onChange={(e) => updateRiderPayment(index, 'extraKm', e.target.value)}
                          step="0.01"
                          min="0"
                          placeholder="0"
                          className="rider-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={rider.extraOrder}
                          onChange={(e) => updateRiderPayment(index, 'extraOrder', e.target.value)}
                          step="0.01"
                          min="0"
                          placeholder="0"
                          className="rider-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={rider.overtime}
                          onChange={(e) => updateRiderPayment(index, 'overtime', e.target.value)}
                          step="0.01"
                          min="0"
                          placeholder="0"
                          className="rider-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={rider.totalOrder}
                          onChange={(e) => updateRiderPayment(index, 'totalOrder', e.target.value)}
                          step="1"
                          min="0"
                          placeholder="0"
                          className="rider-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={(() => {
                            const basePay = parseFloat(rider.basePay) || 0;
                            const tips = parseFloat(rider.tips) || 0;
                            const extraKm = parseFloat(rider.extraKm) || 0;
                            const extraOrder = parseFloat(rider.extraOrder) || 0;
                            const overtime = parseFloat(rider.overtime) || 0;
                            return formatAmount(basePay + tips + extraKm + extraOrder + overtime);
                          })()}
                          readOnly
                          className="rider-input rider-total"
                          title="Auto-calculated: Base Pay + Tips + Extra KM + Extra Order + Overtime"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => removeRiderPayment(index)}
                          className="btn-remove-rider"
                          disabled={riderPayments.length === 1}
                          title="Remove rider"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="rider-total-row">
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td><strong>{formatAmount(calculateRiderTotals().basePay)}</strong></td>
                    <td><strong>{formatAmount(calculateRiderTotals().tips)}</strong></td>
                    <td><strong>{formatAmount(calculateRiderTotals().extraKm)}</strong></td>
                    <td><strong>{formatAmount(calculateRiderTotals().extraOrder)}</strong></td>
                    <td><strong>{formatAmount(calculateRiderTotals().overtime)}</strong></td>
                    <td><strong>{calculateRiderTotals().totalOrder}</strong></td>
                    <td><strong>{formatAmount(calculateRiderTotals().totalPayment || 0)}</strong></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
              <div className="table-footer">
                <button
                  type="button"
                  onClick={addRiderPayment}
                  className="btn-add-rider"
                >
                  + Add Rider
                </button>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Transportation Expense</h3>
            <div className="transportation-table-container">
              <table className="transportation-table">
                <thead>
                  <tr>
                    <th>Custom</th>
                    <th>Recipient</th>
                    <th>Amount (NPR)</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transportationRecipientsList.map((recipient, index) => (
                    <tr key={index}>
                      <td>
                        <label className="custom-checkbox-label">
                          <input
                            type="checkbox"
                            checked={recipient.isCustom}
                            onChange={(e) => updateTransportationRecipient(index, 'isCustom', e.target.checked)}
                          />
                          {' '}Custom
                        </label>
                      </td>
                      <td>
                        {!recipient.isCustom ? (
                          <select
                            value={recipient.employeeId || ''}
                            onChange={(e) => updateTransportationRecipient(index, 'employeeId', e.target.value)}
                            className="transportation-input"
                          >
                            <option value="">Select employee</option>
                            {transportationRecipients.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={recipient.name}
                            onChange={(e) => updateTransportationRecipient(index, 'name', e.target.value)}
                            placeholder="Enter recipient name"
                            className="transportation-input"
                          />
                        )}
                      </td>
                      <td>
                        <input
                          type="number"
                          value={recipient.amount}
                          onChange={(e) => updateTransportationRecipient(index, 'amount', e.target.value)}
                          step="0.01"
                          min="0"
                          placeholder="0"
                          className="transportation-input"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => removeTransportationRecipient(index)}
                          className="btn-remove-transportation"
                          disabled={transportationRecipientsList.length === 1}
                          title="Remove recipient"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="transportation-total-row">
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td></td>
                    <td>
                      <strong>{formatAmount(calculateTransportationTotal())}</strong>
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
              <div className="table-footer">
                <button
                  type="button"
                  onClick={addTransportationRecipient}
                  className="btn-add-recipient"
                >
                  + Add Recipient
                </button>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Other Expenses</h3>
            <div className="other-expenses-table-container">
              <table className="other-expenses-table">
                <thead>
                  <tr>
                    <th>Particulars</th>
                    <th>Amount (NPR)</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {otherExpenses.map((expense, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          type="text"
                          value={expense.particulars}
                          onChange={(e) => updateOtherExpense(index, 'particulars', e.target.value)}
                          placeholder="Enter particulars"
                          className="expense-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={expense.amount}
                          onChange={(e) => updateOtherExpense(index, 'amount', e.target.value)}
                          step="0.01"
                          min="0"
                          placeholder="0"
                          className="expense-input"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => removeOtherExpense(index)}
                          className="btn-remove-expense"
                          disabled={otherExpenses.length === 1}
                          title="Remove expense"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="expense-total-row">
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td>
                      <strong>{formatAmount(calculateOtherExpensesTotal())}</strong>
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
              <div className="table-footer">
                <button
                  type="button"
                  onClick={addOtherExpense}
                  className="btn-add-expense"
                >
                  + Add Expense
                </button>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Sales Breakdown</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="total_qr_sales">Total QR Sales (NPR) *</label>
                <input
                  type="number"
                  id="total_qr_sales"
                  name="total_qr_sales"
                  value={formData.total_qr_sales}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  placeholder="0"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="total_cash_sales">Total Cash Sales (NPR) *</label>
                <input
                  type="number"
                  id="total_cash_sales"
                  name="total_cash_sales"
                  value={formData.total_cash_sales}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  placeholder="0"
                  required
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="total_food_sales">Total Food Sales (NPR) *</label>
                <input
                  type="number"
                  id="total_food_sales"
                  name="total_food_sales"
                  value={formData.total_food_sales}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  placeholder="0"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="total_beverages_sales">Total Beverages Sales (NPR) *</label>
                <input
                  type="number"
                  id="total_beverages_sales"
                  name="total_beverages_sales"
                  value={formData.total_beverages_sales}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  placeholder="0"
                  required
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="delivery_charge_collected">Delivery Charge Collected (NPR) *</label>
                <input
                  type="number"
                  id="delivery_charge_collected"
                  name="delivery_charge_collected"
                  value={formData.delivery_charge_collected}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  placeholder="0"
                  required
                />
              </div>

              <div className="form-group"></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Total Expense (NPR)</label>
                <input
                  type="text"
                  value={formatAmount(calculateTotalExpenses())}
                  readOnly
                  className="readonly-field"
                />
                <small className="field-hint">Rider Payment + Transportation + Other Expenses</small>
              </div>
              <div className="form-group">
                <label>Cash Remaining (NPR)</label>
                <input
                  type="text"
                  value={formatAmount(calculateCashRemaining())}
                  readOnly
                  className={`readonly-field ${calculateCashRemaining() < 0 ? 'negative-amount' : ''}`}
                />
                <small className="field-hint">Cash Sales - Total Expenses</small>
              </div>
            </div>

            <div className="total-amount-display">
              <strong>Total Sales: NPR {formatAmount(calculateTotalAmount())}</strong>
              <span className="total-note">(QR Sales + Cash Sales)</span>
            </div>
            <div className="sales-breakdown-total">
              <strong>Breakdown Total: NPR {formatAmount(calculateSalesBreakdownTotal())}</strong>
              <span className="total-note">(Food Sales + Beverages Sales + Delivery Charge)</span>
            </div>
            {(() => {
              const validation = getSalesValidationError();
              if (validation.hasError) {
                return (
                  <div className="sales-validation-error">
                    <strong>⚠️ Totals do not match!</strong>
                    <div className="validation-details">
                      <div>Total Sales: NPR {formatAmount(validation.totalSales)}</div>
                      <div>Breakdown Total: NPR {formatAmount(validation.breakdownTotal)}</div>
                      <div className="difference-amount">Difference: NPR {formatAmount(validation.difference)}</div>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate(branchPath('sales'))}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SalesEntry;
