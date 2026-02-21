import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

// Configure axios base URL for production
if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_API_URL) {
  axios.defaults.baseURL = process.env.REACT_APP_API_URL;
}

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authProvider, setAuthProvider] = useState(isSupabaseConfigured ? 'supabase' : 'legacy');
  const withTimeout = async (promise, ms = 15000, message = 'Request timed out') => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const mapProfileToUser = (profile) => ({
    id: profile.id,
    username: profile.username || '',
    email: profile.email || '',
    full_name: profile.full_name || '',
    role: profile.role || 'employee',
    branch_id: profile.branch_id || null,
    branch_name: profile.branches?.name || null,
    branch_code: profile.branches?.code || null
  });

  const fetchSupabaseProfile = async (authUserId) => {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, full_name, role, branch_id, branches(name, code)')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return mapProfileToUser(data);
  };

  const bootstrapSupabaseAuth = async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const session = data?.session;
      if (session?.user?.id) {
        const profile = await fetchSupabaseProfile(session.user.id);
        setUser(profile);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Supabase auth bootstrap failed:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (session?.user?.id) {
          const profile = await fetchSupabaseProfile(session.user.id);
          setUser(profile);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Supabase auth state update failed:', err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => listener?.subscription?.unsubscribe();
  };

  useEffect(() => {
    if (isSupabaseConfigured) {
      setAuthProvider('supabase');
      let unsubscribe = null;
      bootstrapSupabaseAuth().then((fn) => {
        unsubscribe = fn;
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }

    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUser = async () => {
    try {
      const response = await axios.get('/api/auth/me');
      setUser(response.data.user);
    } catch (error) {
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    if (isSupabaseConfigured) {
      try {
        const identifier = String(username || '').trim();
        if (!identifier || !password) {
          return { success: false, error: 'Email/username and password are required' };
        }

        let email = identifier;
        if (!identifier.includes('@')) {
          try {
            const { data, error } = await withTimeout(
              supabase.rpc('lookup_login_email', { p_username: identifier }),
              7000,
              'Username lookup timed out'
            );
            if (error) throw error;
            if (!data) {
              return { success: false, error: 'Username not found. Please sign in with email.' };
            }
            email = data;
          } catch (lookupError) {
            console.error('Username lookup failed:', lookupError);
            try {
              const fallback = await withTimeout(
                axios.post('/api/auth/resolve-login-email', { username: identifier }),
                7000,
                'Fallback username lookup timed out'
              );
              const fallbackEmail = fallback?.data?.email;
              if (!fallbackEmail) {
                return {
                  success: false,
                  error: 'Username lookup failed. Please sign in with your email instead of username.'
                };
              }
              email = fallbackEmail;
            } catch (fallbackError) {
              console.error('Fallback username lookup failed:', fallbackError);
              return {
                success: false,
                error: 'Username lookup failed. Please sign in with your email instead of username.'
              };
            }
          }
        }

        const { data: loginData, error: signInError } = await withTimeout(
          supabase.auth.signInWithPassword({
            email,
            password
          }),
          15000,
          'Sign-in request timed out'
        );
        if (signInError) {
          return { success: false, error: signInError.message || 'Login failed' };
        }

        const authUserId = loginData?.user?.id;
        if (!authUserId) {
          return { success: false, error: 'Login failed' };
        }

        const profile = await fetchSupabaseProfile(authUserId);
        if (!profile) {
          return { success: false, error: 'User profile not found. Contact admin.' };
        }

        setUser(profile);
        return { success: true, user: profile };
      } catch (error) {
        console.error('Supabase login error:', error);
        return {
          success: false,
          error: error.message || 'Login failed'
        };
      }
    }

    try {
      const response = await withTimeout(
        axios.post('/api/auth/login', { username, password }),
        15000,
        'Login request timed out. Please check server connection.'
      );
      const { token, user } = response.data;
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(user);
      return { success: true, user };
    } catch (error) {
      console.error('Login error:', error);
      let errorMessage = 'Login failed';
      
      if (error.response) {
        // Server responded with error status
        errorMessage = error.response.data?.error || `Server error: ${error.response.status}`;
      } else if (error.request) {
        // Request made but no response received
        errorMessage = 'Cannot connect to server. Please make sure the backend server is running on port 5000.';
      } else {
        // Something else happened
        errorMessage = error.message || 'Login failed';
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  };

  const logout = () => {
    if (isSupabaseConfigured) {
      supabase.auth.signOut().catch((err) => console.error('Supabase logout failed:', err));
      setUser(null);
      return;
    }

    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, authProvider }}>
      {children}
    </AuthContext.Provider>
  );
};
