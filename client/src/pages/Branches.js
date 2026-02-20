import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Users.css';

const Branches = () => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    is_active: true,
    admin_username: '',
    admin_email: '',
    admin_password: '',
    admin_full_name: ''
  });

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    try {
      const response = await axios.get('/api/branches?include_inactive=true');
      setBranches(response.data.branches || []);
    } catch (err) {
      setError('Failed to load branches');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormError('');
    setFormData({
      name: '',
      code: '',
      is_active: true,
      admin_username: '',
      admin_email: '',
      admin_password: '',
      admin_full_name: ''
    });
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      if (editingId) {
        const updateData = {
          name: formData.name,
          code: formData.code,
          is_active: formData.is_active
        };
        await axios.put(`/api/branches/${editingId}`, updateData);
      } else {
        await axios.post('/api/branches', formData);
      }
      await fetchBranches();
      resetForm();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save branch');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (branch) => {
    setEditingId(branch.id);
    setFormData({
      name: branch.name || '',
      code: branch.code || '',
      is_active: Boolean(branch.is_active),
      admin_username: '',
      admin_email: '',
      admin_password: '',
      admin_full_name: ''
    });
    setShowForm(true);
    setFormError('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this branch?')) return;
    try {
      await axios.delete(`/api/branches/${id}`);
      fetchBranches();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete branch');
    }
  };

  if (loading) return <div className="users-loading">Loading branches...</div>;

  return (
    <div className="users">
      <div className="page-header">
        <h1>Branch Management</h1>
        <button className="btn-new" onClick={() => setShowForm((v) => !v)}>
          + Add Branch
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && (
        <div className="form-container">
          <h2>{editingId ? 'Edit Branch' : 'Create Branch'}</h2>
          {formError && <div className="error-message">{formError}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Branch Name *</label>
                <input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="code">Branch Code</label>
                <input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
                />
              </div>
            </div>
            {!editingId && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="admin_full_name">Branch Admin Full Name</label>
                    <input
                      id="admin_full_name"
                      value={formData.admin_full_name}
                      onChange={(e) => setFormData((p) => ({ ...p, admin_full_name: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="admin_username">Branch Admin Username *</label>
                    <input
                      id="admin_username"
                      value={formData.admin_username}
                      onChange={(e) => setFormData((p) => ({ ...p, admin_username: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="admin_email">Branch Admin Email *</label>
                    <input
                      id="admin_email"
                      type="email"
                      value={formData.admin_email}
                      onChange={(e) => setFormData((p) => ({ ...p, admin_email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="admin_password">Branch Admin Password *</label>
                    <input
                      id="admin_password"
                      type="password"
                      value={formData.admin_password}
                      onChange={(e) => setFormData((p) => ({ ...p, admin_password: e.target.value }))}
                      minLength={6}
                      required
                    />
                  </div>
                </div>
              </>
            )}
            <div className="form-row">
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData((p) => ({ ...p, is_active: e.target.checked }))}
                  />
                  {' '}Active
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : editingId ? 'Update Branch' : 'Create Branch'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Employees</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch.id}>
                <td>{branch.name}</td>
                <td>{branch.code || '-'}</td>
                <td>{`${branch.active_employees || 0} active / ${branch.total_employees || 0} total`}</td>
                <td>{branch.is_active ? 'Active' : 'Inactive'}</td>
                <td>
                  <div className="action-buttons">
                    <button className="btn-edit" onClick={() => handleEdit(branch)}>Edit</button>
                    <button className="btn-delete" onClick={() => handleDelete(branch.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {branches.length === 0 && (
              <tr>
                <td colSpan="5">No branches found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Branches;
