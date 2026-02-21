const { getDb } = require('../database/init');

const getSupabaseUrl = () => process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || '';
const getSupabaseAnonKey = () => process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || '';

const authenticateSupabaseToken = async (req, res, next) => {
  try {
    const supabaseUrl = getSupabaseUrl();
    const supabaseAnonKey = getSupabaseAnonKey();

    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');

    if (missing.length > 0) {
      return res.status(500).json({
        error: `Supabase auth is not configured on server (missing: ${missing.join(', ')})`
      });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey
      }
    });

    if (!authResponse.ok) {
      return res.status(401).json({ error: 'Invalid or expired Supabase session token' });
    }

    const authUser = await authResponse.json();
    if (!authUser?.id) {
      return res.status(401).json({ error: 'Invalid Supabase user payload' });
    }

    const db = getDb();
    let profileResult = null;
    try {
      profileResult = await db.query(
        'SELECT id, role, branch_id FROM users WHERE auth_user_id = $1 LIMIT 1',
        [authUser.id]
      );
    } catch (dbError) {
      // Legacy DB schema may not have auth_user_id yet.
      if (dbError?.code !== '42703') {
        throw dbError;
      }
    }

    // Fallback for legacy schema: match by email.
    if ((!profileResult || profileResult.rows.length === 0) && authUser?.email) {
      profileResult = await db.query(
        'SELECT id, role, branch_id FROM users WHERE lower(email) = lower($1) LIMIT 1',
        [authUser.email]
      );
    }

    if ((!profileResult || profileResult.rows.length === 0)) {
      try {
        const profileUrl = new URL(`${supabaseUrl}/rest/v1/users`);
        profileUrl.searchParams.set('select', 'id,role,branch_id');
        profileUrl.searchParams.set('auth_user_id', `eq.${authUser.id}`);
        profileUrl.searchParams.set('limit', '1');

        const supabaseProfileResponse = await fetch(profileUrl.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: supabaseAnonKey,
            Accept: 'application/json'
          }
        });

        if (supabaseProfileResponse.ok) {
          const supabaseProfiles = await supabaseProfileResponse.json();
          if (Array.isArray(supabaseProfiles) && supabaseProfiles.length > 0) {
            req.user = supabaseProfiles[0];
            return next();
          }
        }
      } catch (profileLookupError) {
        console.error('Supabase profile lookup fallback failed:', profileLookupError);
      }
    }

    if (!profileResult || profileResult.rows.length === 0) {
      return res.status(403).json({ error: 'User profile not found' });
    }

    req.user = profileResult.rows[0];
    next();
  } catch (error) {
    console.error('Supabase auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

module.exports = {
  authenticateSupabaseToken
};
