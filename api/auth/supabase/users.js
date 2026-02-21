const getSupabaseUrl = () => process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || '';
const getSupabaseAnonKey = () => process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || '';
const getSupabaseServiceRoleKey = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';

const normalizeRoleOutput = (role) => (role === 'rider_incharge' ? 'night_manager' : role);

const jsonError = (res, status, error) => res.status(status).json({ error });

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return jsonError(res, 405, 'Method not allowed');
  }

  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();
  const supabaseServiceRoleKey = getSupabaseServiceRoleKey();

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonError(res, 500, 'Supabase env is not fully configured on Vercel');
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return jsonError(res, 401, 'Missing authorization token');
  }

  try {
    const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        Accept: 'application/json'
      }
    });
    if (!authResp.ok) {
      return jsonError(res, 401, 'Invalid or expired Supabase session token');
    }
    const authUser = await authResp.json();
    if (!authUser?.id) {
      return jsonError(res, 401, 'Invalid Supabase user payload');
    }

    const profileUrl = new URL(`${supabaseUrl}/rest/v1/users`);
    profileUrl.searchParams.set('select', 'id,role,branch_id');
    profileUrl.searchParams.set('auth_user_id', `eq.${authUser.id}`);
    profileUrl.searchParams.set('limit', '1');

    const profileResp = await fetch(profileUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        apikey: supabaseServiceRoleKey,
        Accept: 'application/json'
      }
    });
    if (!profileResp.ok) {
      return jsonError(res, 500, 'Failed to resolve caller profile');
    }
    const profiles = await profileResp.json();
    const caller = Array.isArray(profiles) ? profiles[0] : null;
    if (!caller) {
      return jsonError(res, 403, 'User profile not found');
    }

    if (caller.role !== 'admin' && caller.role !== 'branch_admin') {
      return jsonError(res, 403, 'Admin or branch admin access required');
    }
    if (caller.role === 'branch_admin' && !caller.branch_id) {
      return jsonError(res, 400, 'Branch admin must belong to a branch');
    }

    const usersUrl = new URL(`${supabaseUrl}/rest/v1/users`);
    usersUrl.searchParams.set(
      'select',
      'id,username,email,full_name,role,receives_transportation,created_at,branch_id'
    );
    usersUrl.searchParams.set('order', 'created_at.desc');
    if (caller.role === 'branch_admin') {
      usersUrl.searchParams.set('branch_id', `eq.${caller.branch_id}`);
      usersUrl.searchParams.set('role', 'neq.admin');
    }

    const usersResp = await fetch(usersUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        apikey: supabaseServiceRoleKey,
        Accept: 'application/json'
      }
    });
    if (!usersResp.ok) {
      const details = await usersResp.text();
      return jsonError(res, 500, `Failed to fetch users: ${details}`);
    }
    const users = await usersResp.json();

    const branchesUrl = new URL(`${supabaseUrl}/rest/v1/branches`);
    branchesUrl.searchParams.set('select', 'id,name');
    const branchesResp = await fetch(branchesUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        apikey: supabaseServiceRoleKey,
        Accept: 'application/json'
      }
    });

    let branchNameById = new Map();
    if (branchesResp.ok) {
      const branches = await branchesResp.json();
      branchNameById = new Map((branches || []).map((b) => [String(b.id), b.name]));
    }

    const normalized = (users || []).map((u) => ({
      ...u,
      role: normalizeRoleOutput(u.role),
      branch_name: u.branch_id ? branchNameById.get(String(u.branch_id)) || null : null
    }));

    return res.status(200).json({ users: normalized });
  } catch (error) {
    console.error('Vercel supabase users function error:', error);
    return jsonError(res, 500, 'Internal server error');
  }
};
