import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { formatDateToNepali } from '../utils/dateFormatter';
import Pagination from '../components/Pagination';
import { supabase } from '../lib/supabaseClient';
import './Positions.css';

const Positions = () => {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const { user, authProvider } = useContext(AuthContext);
  const isSupabaseMode = authProvider === 'supabase';

  useEffect(() => {
    fetchPositions();
  }, [isSupabaseMode]);

  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => {
      setLoading(false);
      setError((prev) => prev || 'Loading timed out. Please refresh and try again.');
    }, 10000);
    return () => clearTimeout(timer);
  }, [loading]);

  const fetchPositions = async () => {
    try {
      if (isSupabaseMode) {
        const { data, error } = await supabase
          .from('positions')
          .select('*')
          .order('name', { ascending: true });
        if (error) throw error;
        setPositions(data || []);
      } else {
        const response = await axios.get('/api/positions');
        setPositions(response.data.positions);
      }
    } catch (err) {
      setError(err.message || 'Failed to load positions');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      if (isSupabaseMode) {
        const payload = {
          name: (formData.name || '').trim(),
          description: formData.description || null
        };
        if (editingId) {
          const { error } = await supabase.from('positions').update(payload).eq('id', editingId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('positions').insert(payload);
          if (error) throw error;
        }
      } else if (editingId) {
        await axios.put(`/api/positions/${editingId}`, formData);
      } else {
        await axios.post('/api/positions', formData);
      }
      resetForm();
      fetchPositions();
    } catch (err) {
      setFormError(err.response?.data?.error || err.message || 'Failed to save position');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: ''
    });
    setEditingId(null);
    setShowForm(false);
    setFormError('');
  };

  const handleEdit = (position) => {
    setFormData({
      name: position.name || '',
      description: position.description || ''
    });
    setEditingId(position.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this position?')) {
      return;
    }

    try {
      if (isSupabaseMode) {
        const { error } = await supabase.from('positions').delete().eq('id', id);
        if (error) throw error;
      } else {
        await axios.delete(`/api/positions/${id}`);
      }
      fetchPositions();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to delete position');
    }
  };

  const formatDate = (dateString) => {
    return formatDateToNepali(dateString);
  };

  const isRiderPosition = (name) => String(name || '').trim().toLowerCase() === 'rider';

  if (loading) {
    return <div className="positions-loading">Loading positions...</div>;
  }

  return (
    <div className="positions">
      <div className="page-header">
        <h1>Positions</h1>
        {user?.role === 'admin' && (
          <button onClick={() => {
            resetForm();
            setShowForm(true);
          }} className="btn-new">
            + Add New Position
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && user?.role === 'admin' && (
        <div className="form-container">
          <h2>{editingId ? 'Edit Position' : 'Add New Position'}</h2>
          {formError && <div className="error-message">{formError}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">Position Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="e.g., Manager, Accountant, Sales"
              />
            </div>
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows="3"
                placeholder="Brief description of the position..."
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
        <table className="positions-table">
          <thead>
            <tr>
              <th>Position Name</th>
              <th>Description</th>
              <th>Created</th>
              {user?.role === 'admin' && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr>
                <td colSpan={user?.role === 'admin' ? 4 : 3} className="empty-row">
                  No positions found. {user?.role === 'admin' && 'Add your first position!'}
                </td>
              </tr>
            ) : (
              positions
                .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                .map((position) => (
                <tr key={position.id}>
                  <td><strong>{position.name}</strong></td>
                  <td>{position.description || '-'}</td>
                  <td>{formatDate(position.created_at)}</td>
                  {user?.role === 'admin' && (
                    <td>
                      <div className="action-buttons">
                        <button
                          onClick={() => handleEdit(position)}
                          className="btn-edit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(position.id)}
                          className="btn-delete"
                          disabled={isRiderPosition(position.name)}
                          title={isRiderPosition(position.name) ? 'Universal Rider position cannot be deleted' : 'Delete'}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(positions.length / itemsPerPage)}
          onPageChange={setCurrentPage}
          totalItems={positions.length}
          itemsPerPage={itemsPerPage}
        />
      </div>
    </div>
  );
};

export default Positions;
