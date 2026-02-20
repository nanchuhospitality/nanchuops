import React, { useState, useEffect, useContext } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { AuthContext } from '../context/AuthContext';
import './Dashboard.css';

const formatISODate = (date) => {
  const d = new Date(date);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const getPresetRange = (preset) => {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);

  if (preset === 'today') {
    return { from: formatISODate(start), to: formatISODate(end) };
  }

  if (preset === 'yesterday') {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
    return { from: formatISODate(start), to: formatISODate(end) };
  }

  if (preset === 'last7') {
    start.setDate(start.getDate() - 6);
    return { from: formatISODate(start), to: formatISODate(end) };
  }

  if (preset === 'last30') {
    start.setDate(start.getDate() - 29);
    return { from: formatISODate(start), to: formatISODate(end) };
  }

  if (preset === 'thisMonth') {
    start.setDate(1);
    return { from: formatISODate(start), to: formatISODate(end) };
  }

  if (preset === 'lastMonth') {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: formatISODate(monthStart), to: formatISODate(monthEnd) };
  }

  return { from: '', to: '' };
};

const DEFAULT_RANGE = getPresetRange('last30');

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const { branchslug } = useParams();
  const branchPath = (path) => `/${branchslug || user?.branch_code || 'main'}/${path}`;
  const [stats, setStats] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [datePreset, setDatePreset] = useState('last30');
  const [dateFrom, setDateFrom] = useState(DEFAULT_RANGE.from);
  const [dateTo, setDateTo] = useState(DEFAULT_RANGE.to);
  const [missingDocumentEmployees, setMissingDocumentEmployees] = useState([]);
  const [showMissingDocsMenu, setShowMissingDocsMenu] = useState(false);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchBranches();
      fetchMissingDocuments();
    }
    fetchStats();
  }, [user?.role]);

  useEffect(() => {
    if (user?.role) {
      fetchStats();
    }
  }, [branchFilter, dateFrom, dateTo, user?.role]);

  // Redirect night_manager away from dashboard
  if (user?.role === 'night_manager') {
    return <Navigate to={branchPath('sales')} replace />;
  }

  const fetchStats = async () => {
    try {
      if (dateFrom && dateTo && dateFrom > dateTo) {
        setError('Invalid date range: "From" date must be before or equal to "To" date');
        return;
      }
      setError('');
      const params = new URLSearchParams();
      if (user?.role === 'admin' && branchFilter) {
        params.set('branch_id', branchFilter);
      }
      if (dateFrom) {
        params.set('date_from', dateFrom);
      }
      if (dateTo) {
        params.set('date_to', dateTo);
      }
      const response = await axios.get(`/api/dashboard/stats${params.toString() ? `?${params.toString()}` : ''}`);
      setStats(response.data);
    } catch (err) {
      setError('Failed to load dashboard statistics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const response = await axios.get('/api/branches');
      setBranches(response.data.branches || []);
    } catch (err) {
      console.error('Failed to load branches', err);
    }
  };

  const fetchMissingDocuments = async () => {
    try {
      const response = await axios.get('/api/employees');
      const employees = response.data?.employees || [];
      const missing = employees
        .filter((employee) => {
          const isRider = employee.post && employee.post.toLowerCase() === 'rider';
          const missingId = !employee.id_document_path;
          const missingDrivingLicense = isRider && !employee.driving_license_document_path;
          return missingId || missingDrivingLicense;
        })
        .map((employee) => {
          const missingParts = [];
          if (!employee.id_document_path) {
            missingParts.push('Citizenship ID image');
          }
          if (employee.post && employee.post.toLowerCase() === 'rider' && !employee.driving_license_document_path) {
            missingParts.push('Driving License image');
          }
          return {
            id: employee.id,
            name: employee.name,
            missingText: missingParts.join(', ')
          };
        });

      setMissingDocumentEmployees(missing);
    } catch (err) {
      console.error('Failed to load employee documents status', err);
    }
  };

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="dashboard-error">{error}</div>;
  }

  const formatCurrency = (amount) => {
    const formatted = new Intl.NumberFormat('en-NP', {
      style: 'currency',
      currency: 'NPR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount || 0);
    // Remove trailing .00
    return formatted.replace(/\.00$/, '');
  };

  const handlePresetChange = (preset) => {
    setDatePreset(preset);
    if (preset === 'custom') {
      return;
    }
    const range = getPresetRange(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const clearDateFilter = () => {
    setDatePreset('all');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <div className="dashboard-header-actions">
          {user?.role === 'admin' && (
            <div className="doc-notification">
              <button
                type="button"
                className="doc-notification-button"
                onClick={() => setShowMissingDocsMenu((prev) => !prev)}
                title="Missing employee documents"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z" />
                </svg>
                {missingDocumentEmployees.length > 0 && (
                  <span className="doc-notification-badge">{missingDocumentEmployees.length}</span>
                )}
              </button>

              {showMissingDocsMenu && (
                <div className="doc-notification-menu">
                  <div className="doc-notification-title">Missing Documents</div>
                  {missingDocumentEmployees.length === 0 ? (
                    <div className="doc-notification-empty">All employee documents are uploaded.</div>
                  ) : (
                    <>
                      <ul className="doc-notification-list">
                        {missingDocumentEmployees.slice(0, 6).map((employee) => (
                          <li key={employee.id}>
                            <strong>{employee.name}</strong>
                            <span>{employee.missingText}</span>
                          </li>
                        ))}
                      </ul>
                      <Link to={branchPath('employees')} className="doc-notification-link" onClick={() => setShowMissingDocsMenu(false)}>
                        Upload documents
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
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
        </div>
      </div>

      <div className="dashboard-filters">
        <select value={datePreset} onChange={(e) => handlePresetChange(e.target.value)}>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last7">Last 7 Days</option>
          <option value="last30">Last 30 Days</option>
          <option value="thisMonth">This Month</option>
          <option value="lastMonth">Last Month</option>
          <option value="custom">Custom Range</option>
          <option value="all">All Time</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDatePreset('custom');
            setDateFrom(e.target.value);
          }}
          disabled={datePreset === 'all'}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDatePreset('custom');
            setDateTo(e.target.value);
          }}
          disabled={datePreset === 'all'}
        />
        <button type="button" className="dashboard-filter-clear" onClick={clearDateFilter}>
          Clear
        </button>
      </div>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Sales</div>
          <div className="stat-value">{formatCurrency(stats.totalSales)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Today's Sales</div>
          <div className="stat-value">{formatCurrency(stats.todaySales)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">This Month</div>
          <div className="stat-value">{formatCurrency(stats.monthSales)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Records</div>
          <div className="stat-value">{stats.totalRecords}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total QR Sales</div>
          <div className="stat-value">{formatCurrency(stats.totalQRSales)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Cash Sales</div>
          <div className="stat-value">{formatCurrency(stats.totalCashSales)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Rider Payment</div>
          <div className="stat-value">{formatCurrency(stats.totalRiderPayment)}</div>
        </div>
      </div>

      <div className="expense-section">
        <h2>Expenses</h2>
        <div className="stats-grid">
          <div className="stat-card expense-card">
            <div className="stat-label">Total Transportation Expenses</div>
            <div className="stat-value">{formatCurrency(stats.totalTransportation)}</div>
          </div>
        </div>

        {stats.transportationByRecipient && stats.transportationByRecipient.length > 0 && (
          <div className="chart-card">
            <h3>Transportation Expenses by Employee (Last 30 Days)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.transportationByRecipient}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="recipient_name" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="total" fill="#f093fb" name="Transportation" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h2>Sales Trend (Last 30 Days)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats.dailySales}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Line type="monotone" dataKey="total" stroke="#667eea" strokeWidth={2} name="Sales" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>QR vs Cash Sales</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={[
                  { name: 'QR Sales', value: stats.totalQRSales || 0 },
                  { name: 'Cash Sales', value: stats.totalCashSales || 0 }
                ]}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
              >
                <Cell fill="#667eea" />
                <Cell fill="#764ba2" />
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Sales Breakdown</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={[
              { name: 'QR Sales', total: stats.totalQRSales || 0 },
              { name: 'Cash Sales', total: stats.totalCashSales || 0 },
              { name: 'Rider Payment', total: stats.totalRiderPayment || 0 }
            ]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="total" fill="#667eea" name="Amount" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
