import React, { useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import './Users.css';

const Branches = () => {
  const { user, authProvider } = useContext(AuthContext);
  const isSupabaseMode = authProvider === 'supabase';
  const canManageBranches = user?.role === 'admin';

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
  }, [isSupabaseMode, user?.role]);

  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => {
      setLoading(false);
      setError((prev) => prev || 'Loading timed out. Please refresh and try again.');
    }, 10000);
    return () => clearTimeout(timer);
  }, [loading]);

  const employeeCountByBranch = useMemo(() => {
    const map = new Map();
    branches.forEach((b) => {
      map.set(b.id, {
        total: b.total_employees || 0,
        active: b.active_employees || 0
      });
    });
    return map;
  }, [branches]);

  const fetchBranches = async () => {
    try {
      setLoading(true);
      setError('');

      if (isSupabaseMode) {
        let query = supabase
          .from('branches')
          .select('id, name, code, is_active, created_at, updated_at')
          .order('name', { ascending: true });

        if (!canManageBranches) {
          query = query.eq('is_active', true);
        }

        const { data: branchRows, error: branchErr } = await query;
        if (branchErr) throw branchErr;

        const { data: employeeRows, error: empErr } = await supabase
          .from('employees')
          .select('branch_id, is_active');
        if (empErr) throw empErr;

        const counts = new Map();
        (employeeRows || []).forEach((row) => {
          if (!row.branch_id) return;
          const current = counts.get(row.branch_id) || { total_employees: 0, active_employees: 0 };
          current.total_employees += 1;
          if (row.is_active === 1) current.active_employees += 1;
          counts.set(row.branch_id, current);
        });

        const enriched = (branchRows || []).map((b) => ({
          ...b,
          ...(counts.get(b.id) || { total_employees: 0, active_employees: 0 })
        }));

        setBranches(enriched);
        return;
      }

      const response = await axios.get('/api/branches?include_inactive=true');
      setBranches(response.data.branches || []);
    } catch (err) {
      setError(err.message || 'Failed to load branches');
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
      if (isSupabaseMode) {
        if (!canManageBranches) {
          throw new Error('Admin access required');
        }

        const payload = {
          name: formData.name.trim(),
          code: formData.code.trim() || null,
          is_active: Boolean(formData.is_active)
        };

        if (editingId) {
          const { error: updateErr } = await supabase
            .from('branches')
            .update(payload)
            .eq('id', editingId);
          if (updateErr) throw updateErr;
        } else {
          const { error: createErr } = await supabase.from('branches').insert(payload);
          if (createErr) throw createErr;
        }
      } else if (editingId) {
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
      setFormError(err.response?.data?.error || err.message || 'Failed to save branch');
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
      if (isSupabaseMode) {
        const count = employeeCountByBranch.get(id);
        if ((count?.total || 0) > 0) {
          alert('Cannot delete branch with linked employees. Mark it inactive instead.');
          return;
        }
        const { error: delErr } = await supabase.from('branches').delete().eq('id', id);
        if (delErr) throw delErr;
      } else {
        await axios.delete(`/api/branches/${id}`);
      }
      fetchBranches();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to delete branch');
    }
  };

  if (loading) return <div className="users-loading">Loading branches...</div>;

  return (
    <div className="users">
      <div className="page-header">
        <h1>Branch Management</h1>
        {canManageBranches && (
          <button className="btn-new" onClick={() => setShowForm((v) => !v)}>
            + Add Branch
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && canManageBranches && (
        <div className="form-container">
          <h2>{editingId ? 'Edit Branch' : 'Create Branch'}</h2>
          {formError && <div className="error-message">{formError}</div>}
          {isSupabaseMode && !editingId && (
            <div className="error-message" style={{ background: '#eef7ff', color: '#1f4d7a', borderColor: '#d6e8f8' }}>
              Branch admin account creation is now managed separately from User Management.
            </div>
          )}
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

            {!isSupabaseMode && !editingId && (
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
              {canManageBranches && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch.id}>
                <td>{branch.name}</td>
                <td>{branch.code || '-'}</td>
                <td>{`${branch.active_employees || 0} active / ${branch.total_employees || 0} total`}</td>
                <td>{branch.is_active ? 'Active' : 'Inactive'}</td>
                {canManageBranches && (
                  <td>
                    <div className="action-buttons">
                      <button className="btn-edit" onClick={() => handleEdit(branch)}>Edit</button>
                      <button className="btn-delete" onClick={() => handleDelete(branch.id)}>Delete</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {branches.length === 0 && (
              <tr>
                <td colSpan={canManageBranches ? 5 : 4}>No branches found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Branches;
