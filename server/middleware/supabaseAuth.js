const { getDb } = require('../database/init');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const authenticateSupabaseToken = async (req, res, next) => {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({ error: 'Supabase auth is not configured on server' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY
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
    const profileResult = await db.query(
      'SELECT id, role, branch_id FROM users WHERE auth_user_id = $1 LIMIT 1',
      [authUser.id]
    );

    if (profileResult.rows.length === 0) {
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
