import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { formatDateToNepali } from '../utils/dateFormatter';
import Pagination from '../components/Pagination';
import { supabase } from '../lib/supabaseClient';
import './Users.css';

const Users = () => {
  const { user: currentUser, authProvider } = useContext(AuthContext);
  const isSupabaseMode = authProvider === 'supabase';
  const canManageUsers = currentUser?.role === 'admin' || currentUser?.role === 'branch_admin';
  const isBranchAdmin = currentUser?.role === 'branch_admin';
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    role: 'employee',
    receives_transportation: false,
    branch_id: ''
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const requestTimeoutMs = 15000;

  useEffect(() => {
    if (canManageUsers) {
      fetchUsers();
    }
    if (currentUser?.role === 'admin') {
      fetchBranches();
    }
    if (isBranchAdmin && currentUser?.branch_id) {
      setFormData((prev) => ({
        ...prev,
        branch_id: String(currentUser.branch_id)
      }));
    }
  }, [canManageUsers, currentUser?.role, currentUser?.branch_id, isBranchAdmin, isSupabaseMode]);

  useEffect(() => {
    if (!isSupabaseMode || !canManageUsers) return undefined;

    const channel = supabase
      .channel('users-management-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        () => {
          fetchUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isSupabaseMode, canManageUsers]);

  const fetchUsers = async () => {
    try {
      if (isSupabaseMode) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) throw new Error('Session expired. Please log in again.');

        try {
          const response = await axios.get('/api/auth/supabase/users', {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: requestTimeoutMs
          });
          setUsers(response.data.users || []);
        } catch (apiError) {
          // Fallback for deployments where backend /api is unavailable.
          const { data, error } = await supabase
            .from('users')
            .select('id, username, email, full_name, role, receives_transportation, created_at, branch_id, branches(name)')
            .order('created_at', { ascending: false });
          if (error) throw error;
          const mapped = (data || []).map((u) => ({
            ...u,
            role: u.role === 'rider_incharge' ? 'night_manager' : u.role,
            branch_name: u.branches?.name || null
          }));
          setUsers(mapped);
        }
      } else {
        const response = await axios.get('/api/auth/users');
        setUsers(response.data.users);
      }
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      if (isSupabaseMode) {
        const { data, error } = await supabase
          .from('branches')
          .select('id, name, code')
          .eq('is_active', true)
          .order('name', { ascending: true });
        if (error) throw error;
        setBranches(data || []);
      } else {
        const response = await axios.get('/api/branches');
        setBranches(response.data.branches || []);
      }
    } catch (err) {
      console.error('Failed to load branches', err);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      if (editingUserId) {
        const updateData = { ...formData };
        updateData.branch_id = updateData.branch_id ? parseInt(updateData.branch_id, 10) : null;
        if (updateData.role === 'night_manager' || updateData.role === 'nightmanager') {
          updateData.role = 'night_manager';
        }

        if (isSupabaseMode) {
          const payload = {
            role: updateData.role,
            branch_id: updateData.branch_id
          };
          const { error } = await supabase.from('users').update(payload).eq('id', editingUserId);
          if (error) throw error;
        } else {
          if (!updateData.password) {
            delete updateData.password;
          }
          delete updateData.receives_transportation;
          await axios.put(`/api/auth/users/${editingUserId}`, updateData, { timeout: requestTimeoutMs });
        }
        setEditingUserId(null);
      } else {
        if (isSupabaseMode) {
          throw new Error('Create user is disabled in Supabase mode. Create Auth user first, then assign role/branch here.');
        }
        const createData = {
          ...formData,
          role: (formData.role === 'night_manager' || formData.role === 'nightmanager')
            ? 'night_manager'
            : formData.role,
          branch_id: formData.branch_id ? parseInt(formData.branch_id, 10) : null
        };
        await axios.post('/api/auth/register', createData, { timeout: requestTimeoutMs });
      }
      setFormData({
        username: '',
        email: '',
        password: '',
        full_name: '',
        role: 'employee',
        receives_transportation: false,
        branch_id: ''
      });
      setShowForm(false);
      await fetchUsers();
      setCurrentPage(1);
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        setFormError('Request timed out. Please check backend connection and try again.');
        return;
      }
      setFormError(err.response?.data?.error || err.message || (editingUserId ? 'Failed to update user' : 'Failed to create user'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (user) => {
    setEditingUserId(user.id);
    setFormData({
      username: user.username,
      email: user.email,
      password: '', // Don't pre-fill password
      full_name: user.full_name || '',
      role: user.role,
      receives_transportation: user.receives_transportation === 1,
      branch_id: user.branch_id ? String(user.branch_id) : ''
    });
    setShowForm(true);
    setFormError('');
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      if (isSupabaseMode) {
        const { error } = await supabase.from('users').delete().eq('id', userId);
        if (error) throw error;
      } else {
        await axios.delete(`/api/auth/users/${userId}`);
      }
      await fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to delete user');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingUserId(null);
    setFormData({
      username: '',
      email: '',
      password: '',
      full_name: '',
      role: 'employee',
      receives_transportation: false,
      branch_id: ''
    });
    setFormError('');
  };

  const formatDate = (dateString) => {
    return formatDateToNepali(dateString);
  };

  if (loading) {
    return <div className="users-loading">Loading users...</div>;
  }

  if (!canManageUsers) {
    return <div className="users-loading">Access denied</div>;
  }

  return (
    <div className="users">
      <div className="page-header">
        <h1>User Management</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-new"
          disabled={isSupabaseMode}
          title={isSupabaseMode ? 'Create users in Supabase Authentication first' : 'Add New User'}
        >
          + Add New User
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {showForm && (
        <div className="form-container">
          <h2>{editingUserId ? (isSupabaseMode ? 'Edit User Role/Branch' : 'Edit User') : 'Create New User'}</h2>
          {formError && <div className="error-message">{formError}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="username">Username *</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  disabled={isSupabaseMode}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">Email *</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={isSupabaseMode}
                  required
                />
              </div>
            </div>
            {!isSupabaseMode && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="password">Password {editingUserId ? '' : '*'}</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required={!editingUserId}
                  placeholder={editingUserId ? 'Leave blank to keep current password' : ''}
                />
              </div>
              <div className="form-group">
                <label htmlFor="full_name">Full Name</label>
                <input
                  type="text"
                  id="full_name"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                />
              </div>
            </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="role">Role *</label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  required
                >
                  {isBranchAdmin ? (
                    <>
                      <option value="employee">Employee</option>
                      <option value="night_manager">Night Manager</option>
                    </>
                  ) : (
                    <>
                      <option value="employee">Employee</option>
                      <option value="branch_admin">Branch Admin</option>
                      <option value="night_manager">Night Manager</option>
                      <option value="admin">Admin</option>
                    </>
                  )}
                </select>
              </div>
              {currentUser?.role === 'admin' ? (
                <div className="form-group">
                  <label htmlFor="branch_id">Branch</label>
                  <select
                    id="branch_id"
                    name="branch_id"
                    value={formData.branch_id}
                    onChange={handleChange}
                  >
                    <option value="">No Branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label>Branch</label>
                  <input
                    type="text"
                    value={currentUser?.branch_name || 'Your Branch'}
                    disabled
                  />
                </div>
              )}
              {!isSupabaseMode && (
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      name="receives_transportation"
                      checked={formData.receives_transportation}
                      onChange={(e) => setFormData({ ...formData, receives_transportation: e.target.checked })}
                    />
                    {' '}Receives Transportation
                  </label>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button
                type="button"
                onClick={handleCancel}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting
                  ? (editingUserId ? 'Updating...' : 'Creating...')
                  : (editingUserId ? (isSupabaseMode ? 'Update Role/Branch' : 'Update User') : 'Create User')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        <table className="users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Full Name</th>
                <th>Role</th>
                <th>Branch</th>
                <th>Created At</th>
                {canManageUsers && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {users
                .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                .map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.email}</td>
                  <td>{user.full_name || '-'}</td>
                  <td>
                    <span className={`role-badge ${user.role}`}>
                      {user.role === 'night_manager'
                        ? 'Night Manager'
                        : user.role === 'admin'
                        ? 'Admin'
                        : user.role === 'branch_admin'
                        ? 'Branch Admin'
                        : 'Employee'}
                    </span>
                  </td>
                  <td>{user.branch_name || '-'}</td>
                  <td>{formatDate(user.created_at)}</td>
                  {canManageUsers && (
                    <td>
                      <div className="action-buttons">
                        {(currentUser?.role === 'admin' || user.role === 'employee' || user.role === 'night_manager') && (
                          <>
                        <button
                          onClick={() => handleEdit(user)}
                          className="btn-edit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="btn-delete"
                          disabled={user.id === currentUser?.id}
                          title={user.id === currentUser?.id ? 'You cannot delete your own account' : 'Delete user'}
                        >
                          Delete
                        </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
        </table>
        
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(users.length / itemsPerPage)}
          onPageChange={setCurrentPage}
          totalItems={users.length}
          itemsPerPage={itemsPerPage}
        />
      </div>
    </div>
  );
};

export default Users;
