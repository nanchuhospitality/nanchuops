import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { formatDateToNepali } from '../utils/dateFormatter';
import Pagination from '../components/Pagination';
import './Employees.css';

const normalizePositionForForm = (value, availablePositions = []) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const exact = availablePositions.find((p) => p.name === raw);
  if (exact) return exact.name;
  const ci = availablePositions.find((p) => p.name?.toLowerCase() === raw.toLowerCase());
  return ci ? ci.name : raw;
};

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [positions, setPositions] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    permanent_address: '',
    temporary_address: '',
    receives_transportation: false,
    salary: '',
    emergency_contact_name: '',
    emergency_contact_number: '',
    emergency_contact_relation: '',
    bank_name: '',
    bank_account_number: '',
    joining_date: '',
    post: '',
    branch_id: '',
    date_of_birth: '',
    citizenship_number: '',
    citizenship_issued_by: '',
    citizenship_issued_date: '',
    driving_license_number: '',
    notes: ''
  });
  const [idDocument, setIdDocument] = useState(null);
  const [existingIdDocument, setExistingIdDocument] = useState(null);
  const [drivingLicenseDocument, setDrivingLicenseDocument] = useState(null);
  const [existingDrivingLicenseDocument, setExistingDrivingLicenseDocument] = useState(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentTab, setCurrentTab] = useState('current'); // 'current' | 'past'
  const itemsPerPage = 10;
  const { user } = useContext(AuthContext);

  useEffect(() => {
    fetchPositions();
    if (user?.role === 'admin') {
      fetchBranches();
    }
  }, [user?.role]);

  useEffect(() => {
    fetchEmployees();
    setCurrentPage(1);
  }, [currentTab]);

  useEffect(() => {
    if (user?.role === 'night_manager') {
      setFormData((prev) => ({ ...prev, post: 'Rider' }));
    }
  }, [user?.role]);

  const fetchPositions = async () => {
    try {
      const response = await axios.get('/api/positions');
      setPositions(response.data.positions);
    } catch (err) {
      console.error('Failed to load positions:', err);
    }
  };

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      setError('');
      const url = currentTab === 'past' ? '/api/employees?is_active=0' : '/api/employees';
      const response = await axios.get(url);
      setEmployees(response.data.employees);
    } catch (err) {
      setError('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const response = await axios.get('/api/branches');
      setBranches(response.data.branches || []);
    } catch (err) {
      console.error('Failed to load branches:', err);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const effectivePost = user?.role === 'night_manager' ? 'Rider' : formData.post;
    
    // Validate required fields
    if (
      !formData.name ||
      !formData.date_of_birth ||
      !effectivePost ||
      !formData.phone ||
      !formData.joining_date
    ) {
      setFormError('Name, Date of Birth, Position, Phone, and Joining Date are required');
      return;
    }
    if (user?.role === 'admin' && !formData.branch_id) {
      setFormError('Branch is required');
      return;
    }

    // Rider-specific requirement
    if (effectivePost && effectivePost.toLowerCase() === 'rider') {
      if (!formData.driving_license_number) {
        setFormError('Driving License Number is required for rider position');
        return;
      }
    } else if (!formData.citizenship_number) {
      setFormError('Citizenship Number is required for non-rider positions');
      return;
    }
    
    setSubmitting(true);

    try {
      const submitData = new FormData();
      Object.keys(formData).forEach(key => {
        if (key === 'post' && user?.role === 'night_manager') {
          return;
        }
        if (key === 'post' && editingId) {
          return;
        }
        const value = formData[key];
        // Skip empty strings for optional fields (email, salary)
        if (key === 'email' || key === 'salary') {
          if (value && value.toString().trim() !== '') {
            submitData.append(key, value);
          }
        } else if (value !== null && value !== undefined && value !== '') {
          submitData.append(key, value);
        }
      });
      if (!editingId) {
        submitData.append('post', effectivePost);
      }
      
      if (idDocument) {
        submitData.append('id_document', idDocument);
      }
      
      if (drivingLicenseDocument) {
        submitData.append('driving_license_document', drivingLicenseDocument);
      }

      const config = {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      };

      if (editingId) {
        await axios.put(`/api/employees/${editingId}`, submitData, config);
      } else {
        await axios.post('/api/employees', submitData, config);
      }
      resetForm();
      fetchEmployees();
    } catch (err) {
      console.error('Error saving employee:', err.response?.data);
      if (err.response?.data?.errors) {
        // Handle validation errors
        const errorMessages = err.response.data.errors.map(e => e.msg).join(', ');
        setFormError(`Validation error: ${errorMessages}`);
      } else {
        setFormError(err.response?.data?.error || err.message || 'Failed to save employee');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      permanent_address: '',
      temporary_address: '',
      receives_transportation: false,
      salary: '',
      emergency_contact_name: '',
      emergency_contact_number: '',
      emergency_contact_relation: '',
      bank_name: '',
      bank_account_number: '',
      joining_date: '',
      post: user?.role === 'night_manager' ? 'Rider' : '',
      branch_id: '',
      date_of_birth: '',
    citizenship_number: '',
    citizenship_issued_by: '',
    citizenship_issued_date: '',
    driving_license_number: '',
    notes: ''
    });
    setIdDocument(null);
    setExistingIdDocument(null);
    setDrivingLicenseDocument(null);
    setExistingDrivingLicenseDocument(null);
    setEditingId(null);
    setShowForm(false);
    setFormError('');
  };

  const handleEdit = (employee) => {
    setFormData({
      name: employee.name || '',
      phone: employee.phone || '',
      email: employee.email || '',
      permanent_address: employee.permanent_address || '',
      temporary_address: employee.temporary_address || '',
      receives_transportation: employee.receives_transportation === 1,
      salary: employee.salary || '',
      emergency_contact_name: employee.emergency_contact_name || '',
      emergency_contact_number: employee.emergency_contact_number || '',
      emergency_contact_relation: employee.emergency_contact_relation || '',
      bank_name: employee.bank_name || '',
      bank_account_number: employee.bank_account_number || '',
      joining_date: employee.joining_date || '',
      post: normalizePositionForForm(employee.post, positions),
      branch_id: employee.branch_id ? String(employee.branch_id) : '',
      date_of_birth: employee.date_of_birth || '',
      citizenship_number: employee.citizenship_number || '',
      citizenship_issued_by: employee.citizenship_issued_by || '',
      citizenship_issued_date: employee.citizenship_issued_date || '',
      driving_license_number: employee.driving_license_number || '',
      notes: employee.notes || ''
    });
    setExistingIdDocument(employee.id_document_path || null);
    setExistingDrivingLicenseDocument(employee.driving_license_document_path || null);
    setIdDocument(null);
    setDrivingLicenseDocument(null);
    setEditingId(employee.id);
    setShowForm(true);
  };

  const handleMarkInactive = async (id) => {
    if (!window.confirm('Move this employee to past employees? They can be reactivated later from the Past Employees tab.')) {
      return;
    }

    try {
      await axios.delete(`/api/employees/${id}`);
      fetchEmployees();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to move employee');
    }
  };

  const handleReactivate = async (employee) => {
    try {
      await axios.put(`/api/employees/${employee.id}/activate`);
      fetchEmployees();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reactivate employee');
    }
  };

  const getMissingDocuments = (employee) => {
    const missing = [];
    if (!employee.id_document_path) {
      missing.push('Citizenship ID image');
    }
    if (employee.post && employee.post.toLowerCase() === 'rider' && !employee.driving_license_document_path) {
      missing.push('Driving License image');
    }
    return missing;
  };

  const formatDate = (dateString) => {
    return formatDateToNepali(dateString);
  };

  if (loading) {
    return <div className="employees-loading">Loading employees...</div>;
  }

  return (
    <div className="employees">
      <div className="page-header">
        <h1>Employees</h1>
        {(user?.role === 'admin' || user?.role === 'branch_admin' || user?.role === 'night_manager') && (
          <button onClick={() => {
            resetForm();
            setShowForm(true);
          }} className="btn-new">
            + Add New Employee
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="employees-tabs">
        <button
          type="button"
          className={`tab-btn ${currentTab === 'current' ? 'active' : ''}`}
          onClick={() => setCurrentTab('current')}
        >
          Current Employees
        </button>
      <button
        type="button"
        className={`tab-btn ${currentTab === 'past' ? 'active' : ''}`}
        onClick={() => {
          resetForm();
          setCurrentTab('past');
        }}
      >
        Past Employees
      </button>
    </div>

      {showForm && (user?.role === 'admin' || user?.role === 'branch_admin' || user?.role === 'night_manager') && (
        <div className="form-container">
          <h2>{editingId ? 'Edit Employee' : 'Add New Employee'}</h2>
          {formError && <div className="error-message">{formError}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="joining_date">Joining Date *</label>
                <input
                  type="date"
                  id="joining_date"
                  name="joining_date"
                  value={formData.joining_date}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="name">Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="date_of_birth">Date of Birth *</label>
                <input
                  type="date"
                  id="date_of_birth"
                  name="date_of_birth"
                  value={formData.date_of_birth}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="post">Position *</label>
                {user?.role === 'night_manager' ? (
                  <>
                    <input type="text" id="post" value="Rider" readOnly />
                    <small style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginTop: '0.25rem' }}>
                      Position is fixed to Rider for night manager.
                    </small>
                  </>
                ) : (
                  <select
                    id="post"
                    name="post"
                    value={formData.post}
                    onChange={handleChange}
                    disabled={!!editingId}
                    required
                  >
                    <option value="">Select Position</option>
                    {positions
                      .filter(position => user?.role === 'admin' || user?.role === 'branch_admin' || position.name.toLowerCase() === 'rider')
                      .map((position) => (
                        <option key={position.id} value={position.name}>
                          {position.name}
                        </option>
                      ))}
                  </select>
                )}
                {editingId && user?.role !== 'night_manager' && (
                  <small style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginTop: '0.25rem' }}>
                    Position is locked after employee creation.
                  </small>
                )}
              </div>
              {user?.role === 'admin' && (
                <div className="form-group">
                  <label htmlFor="branch_id">Branch *</label>
                  <select
                    id="branch_id"
                    name="branch_id"
                    value={formData.branch_id}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="phone">Phone *</label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Optional"
                />
              </div>
              <div className="form-group">
                <label htmlFor="salary">Salary (NPR)</label>
                <input
                  type="number"
                  id="salary"
                  name="salary"
                  value={formData.salary}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="form-section">
              <h3>Address Details</h3>
              <div className="form-group">
                <label htmlFor="permanent_address">Permanent Address</label>
                <textarea
                  id="permanent_address"
                  name="permanent_address"
                  value={formData.permanent_address}
                  onChange={handleChange}
                  rows="2"
                  placeholder="Permanent address"
                />
              </div>
              <div className="form-group">
                <label htmlFor="temporary_address">Temporary Address</label>
                <textarea
                  id="temporary_address"
                  name="temporary_address"
                  value={formData.temporary_address}
                  onChange={handleChange}
                  rows="2"
                  placeholder="Temporary/Current address"
                />
              </div>
            </div>
            <div className="form-section">
              <h3>Citizenship Details</h3>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="citizenship_number">
                    Citizenship Number {formData.post && formData.post.toLowerCase() !== 'rider' ? '*' : ''}
                  </label>
                  <input
                    type="text"
                    id="citizenship_number"
                    name="citizenship_number"
                    value={formData.citizenship_number}
                    onChange={handleChange}
                    placeholder="Citizenship number"
                    required={!!formData.post && formData.post.toLowerCase() !== 'rider'}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="citizenship_issued_by">Issued By</label>
                  <input
                    type="text"
                    id="citizenship_issued_by"
                    name="citizenship_issued_by"
                    value={formData.citizenship_issued_by}
                    onChange={handleChange}
                    placeholder="e.g., District Administration Office"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="citizenship_issued_date">Issued Date</label>
                  <input
                    type="date"
                    id="citizenship_issued_date"
                    name="citizenship_issued_date"
                    value={formData.citizenship_issued_date}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="id_document">Employee ID Document</label>
              <input
                type="file"
                id="id_document"
                name="id_document"
                accept="image/*,.pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setIdDocument(e.target.files[0]);
                    setExistingIdDocument(null);
                  }
                }}
              />
              {existingIdDocument && !idDocument && (
                <div className="existing-file">
                  <span>Current file: </span>
                  <a href={existingIdDocument} target="_blank" rel="noopener noreferrer">
                    View Current ID Document
                  </a>
                </div>
              )}
              {idDocument && (
                <div className="new-file">
                  <span>New file selected: {idDocument.name}</span>
                </div>
              )}
              <small className="file-hint">Accepted formats: JPEG, PNG, PDF (Max 5MB)</small>
            </div>
            {(user?.role === 'night_manager' || (formData.post && formData.post.toLowerCase() === 'rider')) && (
              <div className="form-section">
                <h3>Driving License Details</h3>
                <div className="form-row">
                <div className="form-group">
                    <label htmlFor="driving_license_number">Driving License Number *</label>
                    <input
                      type="text"
                      id="driving_license_number"
                      name="driving_license_number"
                      value={formData.driving_license_number}
                      onChange={handleChange}
                      placeholder="Driving license number"
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="driving_license_document">Driving License Document</label>
                  <input
                    type="file"
                    id="driving_license_document"
                    name="driving_license_document"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setDrivingLicenseDocument(e.target.files[0]);
                        setExistingDrivingLicenseDocument(null);
                      }
                    }}
                  />
                  {existingDrivingLicenseDocument && !drivingLicenseDocument && (
                    <div className="existing-file">
                      <span>Current file: </span>
                      <a href={existingDrivingLicenseDocument} target="_blank" rel="noopener noreferrer">
                        View Current Driving License
                      </a>
                    </div>
                  )}
                  {drivingLicenseDocument && (
                    <div className="new-file">
                      <span>New file selected: {drivingLicenseDocument.name}</span>
                    </div>
                  )}
                  <small className="file-hint">Accepted formats: JPEG, PNG, PDF (Max 5MB)</small>
                </div>
              </div>
            )}
            <div className="form-section">
              <h3>Emergency Contact</h3>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="emergency_contact_name">Contact Name</label>
                  <input
                    type="text"
                    id="emergency_contact_name"
                    name="emergency_contact_name"
                    value={formData.emergency_contact_name}
                    onChange={handleChange}
                    placeholder="Full name"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emergency_contact_number">Contact Number</label>
                  <input
                    type="tel"
                    id="emergency_contact_number"
                    name="emergency_contact_number"
                    value={formData.emergency_contact_number}
                    onChange={handleChange}
                    placeholder="Phone number"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emergency_contact_relation">Relation</label>
                  <input
                    type="text"
                    id="emergency_contact_relation"
                    name="emergency_contact_relation"
                    value={formData.emergency_contact_relation}
                    onChange={handleChange}
                    placeholder="e.g., Spouse, Parent, Sibling"
                  />
                </div>
              </div>
            </div>
            <div className="form-section">
              <h3>Bank Details</h3>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="bank_name">Bank Name</label>
                  <input
                    type="text"
                    id="bank_name"
                    name="bank_name"
                    value={formData.bank_name}
                    onChange={handleChange}
                    placeholder="e.g., Nepal Rastra Bank, Nabil Bank"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="bank_account_number">Account Number</label>
                  <input
                    type="text"
                    id="bank_account_number"
                    name="bank_account_number"
                    value={formData.bank_account_number}
                    onChange={handleChange}
                    placeholder="Account number"
                  />
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    name="receives_transportation"
                    checked={formData.receives_transportation}
                    onChange={handleChange}
                  />
                  {' '}Receives Transportation
                </label>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows="3"
                placeholder="Additional notes about the employee..."
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                onClick={resetForm}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
          <table className="employees-table">
            <thead>
              <tr>
                <th className="col-name">Name</th>
                <th className="col-phone">Phone</th>
              <th className="col-joining-date">Joining Date</th>
              <th className="col-post">Post</th>
              <th className="col-branch">Branch</th>
                {(user?.role === 'admin' || user?.role === 'branch_admin' || user?.role === 'night_manager') && <th className="col-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={user?.role === 'admin' || user?.role === 'branch_admin' || user?.role === 'night_manager' ? 6 : 5} className="empty-row">
                    {currentTab === 'past'
                      ? 'No past employees.'
                      : `No employees found. ${user?.role === 'admin' || user?.role === 'branch_admin' || user?.role === 'night_manager' ? 'Add your first employee!' : ''}`}
                  </td>
                </tr>
              ) : (
                employees
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map((employee) => {
                  const missingDocuments = getMissingDocuments(employee);
                  return (
                  <tr key={employee.id}>
                    <td className="col-name">
                      <strong>{employee.name}</strong>
                      {missingDocuments.length > 0 && (
                        <div className="doc-warning">
                          Missing: {missingDocuments.join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="col-phone">{employee.phone || '-'}</td>
                    <td className="col-joining-date">
                      {employee.joining_date
                        ? formatDate(employee.joining_date)
                        : '-'
                      }
                    </td>
                    <td className="col-post">{employee.post || '-'}</td>
                    <td className="col-branch">{employee.branch_name || employee.branch_id || '-'}</td>
                    {(user?.role === 'admin' || user?.role === 'branch_admin' || user?.role === 'night_manager') && (
                      <td className="col-actions">
                        <div className="action-buttons">
                          <button
                            onClick={() => handleEdit(employee)}
                            className="btn-edit"
                          >
                            Edit
                          </button>
                          {currentTab === 'current' ? (
                            <button
                              onClick={() => handleMarkInactive(employee.id)}
                              className="btn-mark-inactive"
                              title="Move to past employees"
                            >
                              Mark Inactive
                            </button>
                          ) : (user?.role === 'admin' ? (
                            <button
                              onClick={() => handleReactivate(employee)}
                              className="btn-reactivate"
                              title="Move back to current employees"
                            >
                              Reactivate
                            </button>
                          ) : null)}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
              )}
            </tbody>
          </table>

          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(employees.length / itemsPerPage)}
            onPageChange={setCurrentPage}
            totalItems={employees.length}
            itemsPerPage={itemsPerPage}
          />
      </div>
    </div>
  );
};

export default Employees;
