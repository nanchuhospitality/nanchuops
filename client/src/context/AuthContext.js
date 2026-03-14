import React, { createContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

// Configure axios base URL for production
if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_API_URL) {
  axios.defaults.baseURL = process.env.REACT_APP_API_URL;
}

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const PROFILE_CACHE_KEY = 'nova_auth_profile_cache_v1';
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authProvider, setAuthProvider] = useState(isSupabaseConfigured ? 'supabase' : 'legacy');
  const withTimeout = useCallback(async (promise, ms = 15000, message = 'Request timed out') => {
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
  }, []);

  const mapProfileToUser = useCallback((profile) => ({
    id: profile.id,
    auth_user_id: profile.auth_user_id || null,
    username: profile.username || '',
    email: profile.email || '',
    full_name: profile.full_name || '',
    role: profile.role || 'employee',
    branch_id: profile.branch_id || null,
    branch_name: profile.branches?.name || null,
    branch_code: profile.branches?.code || null
  }), []);

  const readCachedProfile = useCallback(() => {
    try {
      const raw = localStorage.getItem(PROFILE_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_err) {
      return null;
    }
  }, [PROFILE_CACHE_KEY]);

  const writeCachedProfile = useCallback((profile) => {
    try {
      if (profile) {
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
      } else {
        localStorage.removeItem(PROFILE_CACHE_KEY);
      }
    } catch (_err) {
      // ignore cache write issues
    }
  }, [PROFILE_CACHE_KEY]);

  const fetchSupabaseProfile = useCallback(async (authUserId) => {
    const { data, error } = await withTimeout(
      supabase
        .from('users')
        .select('id, auth_user_id, username, email, full_name, role, branch_id, branches(name, code)')
        .eq('auth_user_id', authUserId)
        .maybeSingle(),
      8000,
      'Profile query timed out'
    );

    if (error) throw error;
    if (!data) return null;
    return mapProfileToUser(data);
  }, [mapProfileToUser, withTimeout]);

  const bootstrapSupabaseAuth = useCallback(async () => {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        8000,
        'Session check timed out'
      );
      if (error) throw error;

      const session = data?.session;
      if (session?.user?.id) {
        const profile = await fetchSupabaseProfile(session.user.id);
        const cached = readCachedProfile();
        const fallback = cached && String(cached.auth_user_id || '') === String(session.user.id) ? cached : null;
        const resolved = profile || fallback;
        setUser(resolved);
        writeCachedProfile(resolved);
      } else {
        setUser(null);
        writeCachedProfile(null);
      }
    } catch (err) {
      console.error('Supabase auth bootstrap failed:', err);
      const cached = readCachedProfile();
      if (cached) {
        setUser(cached);
      } else {
        setUser(null);
        writeCachedProfile(null);
      }
    } finally {
      setLoading(false);
    }

      const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (session?.user?.id) {
          const profile = await withTimeout(
            fetchSupabaseProfile(session.user.id),
            8000,
            'Profile refresh timed out'
          );
          const cached = readCachedProfile();
          const fallback = cached && String(cached.auth_user_id || '') === String(session.user.id) ? cached : null;
          const resolved = profile || fallback;
          setUser(resolved);
          writeCachedProfile(resolved);
        } else {
          setUser(null);
          writeCachedProfile(null);
        }
      } catch (err) {
        console.error('Supabase auth state update failed:', err);
        const cached = readCachedProfile();
        if (cached) {
          setUser(cached);
        } else {
          setUser(null);
          writeCachedProfile(null);
        }
      } finally {
        setLoading(false);
      }
    });

    return () => listener?.subscription?.unsubscribe();
  }, [fetchSupabaseProfile, readCachedProfile, withTimeout, writeCachedProfile]);

  const fetchUser = useCallback(async () => {
    try {
      const response = await axios.get('/api/auth/me');
      setUser(response.data.user);
    } catch (error) {
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured) {
      setAuthProvider('supabase');
      let unsubscribe = null;
      const failSafeTimer = setTimeout(() => {
        setLoading(false);
      }, 12000);
      bootstrapSupabaseAuth().then((fn) => {
        unsubscribe = fn;
      });
      return () => {
        clearTimeout(failSafeTimer);
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
  }, [bootstrapSupabaseAuth, fetchUser]);

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
            return {
              success: false,
              error: 'Username sign-in is unavailable right now. Please sign in with your email instead.'
            };
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
      writeCachedProfile(null);
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
