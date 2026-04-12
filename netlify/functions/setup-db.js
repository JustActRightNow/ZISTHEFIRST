// ═══════════════════════════════════════════════════
// ZISTHEFIRST — Database Setup Endpoint
// Netlify Function — POST /netlify/functions/setup-db
// Creates the `drops` and `drop_products` tables in
// Supabase if they do not already exist, then enables
// RLS with sensible read-write policies.
//
// Two connection methods are supported (in priority order):
//
// Method 1 — Supabase Management API (recommended for
//   Netlify/serverless — uses HTTPS, no raw TCP needed):
//   SUPABASE_URL         — your project URL, e.g.
//                          https://xxxx.supabase.co
//   SUPABASE_ACCESS_TOKEN — a Personal Access Token from
//                          supabase.com → Account →
//                          Access Tokens
//
// Method 2 — Direct Postgres connection (fallback):
//   DATABASE_URL — Supabase connection string (URI),
//   found in Supabase → Project Settings → Database.
//   Use the Session-mode Pooler URL
//   (aws-0-<region>.pooler.supabase.com:5432) rather
//   than the direct host to avoid DNS failures in
//   serverless environments.
//
// This function is idempotent: calling it multiple
// times is always safe (CREATE TABLE IF NOT EXISTS).
// ═══════════════════════════════════════════════════

const SETUP_SQL = `
-- drops table
CREATE TABLE IF NOT EXISTS drops (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  cover_image text,
  drop_date   date,
  description text,
  sort_order  int         DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- drop_products join table
CREATE TABLE IF NOT EXISTS drop_products (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id    uuid REFERENCES drops(id)    ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE(drop_id, product_id)
);

-- Enable row-level security
ALTER TABLE drops         ENABLE ROW LEVEL SECURITY;
ALTER TABLE drop_products ENABLE ROW LEVEL SECURITY;

-- Anyone can read drops (needed for the storefront)
DO $$ BEGIN
  CREATE POLICY "drops_public_select"
    ON drops FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "drop_products_public_select"
    ON drop_products FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Authenticated users (admin) can insert / update / delete
DO $$ BEGIN
  CREATE POLICY "drops_auth_all"
    ON drops FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "drop_products_auth_all"
    ON drop_products FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

const { Client } = require('pg');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // ── Method 1: Supabase Management API (preferred in serverless) ──────────
  // Uses HTTPS to api.supabase.com — no raw TCP connection, no DNS issues.
  const supabaseUrl   = process.env.SUPABASE_URL;
  const accessToken   = process.env.SUPABASE_ACCESS_TOKEN;

  if (supabaseUrl && accessToken) {
    return runViaManagementApi(supabaseUrl, accessToken);
  }

  // ── Method 2: Direct Postgres connection ─────────────────────────────────
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error:
          'No database credentials found. Set one of:\n' +
          '  Option A (recommended): SUPABASE_URL + SUPABASE_ACCESS_TOKEN\n' +
          '    SUPABASE_URL is your project URL (https://xxxx.supabase.co).\n' +
          '    SUPABASE_ACCESS_TOKEN is a Personal Access Token from\n' +
          '    supabase.com → Account → Access Tokens.\n' +
          '  Option B: DATABASE_URL\n' +
          '    Use the Session-mode Pooler connection string from\n' +
          '    Supabase → Project Settings → Database → Connection string.\n' +
          '    The Pooler URL (aws-0-<region>.pooler.supabase.com) is more\n' +
          '    reliable in serverless environments than the direct host.'
      })
    };
  }

  return runViaDirectPostgres(dbUrl);
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function runViaManagementApi(supabaseUrl, accessToken) {
  let projectRef;
  try {
    projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  } catch (parseError) {
    console.error('setup-db: invalid SUPABASE_URL:', parseError.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'SUPABASE_URL is not a valid URL.' })
    };
  }

  const apiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

  let res, body;
  try {
    res  = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: SETUP_SQL })
    });
    body = await res.json().catch((parseErr) => {
      console.error('setup-db: failed to parse Management API response:', parseErr.message);
      return {};
    });
  } catch (err) {
    console.error('setup-db management-api fetch error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Management API request failed: ' + err.message })
    };
  }

  if (!res.ok) {
    const msg = body.message || body.error || `Management API error (HTTP ${res.status})`;
    console.error('setup-db management-api error:', msg);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: msg })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, message: 'drops and drop_products tables are ready.' })
  };
}

async function runViaDirectPostgres(dbUrl) {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: true } });
  try {
    await client.connect();
    await client.query(SETUP_SQL);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, message: 'drops and drop_products tables are ready.' })
    };
  } catch (err) {
    console.error('setup-db postgres error:', err.message);

    let errorMessage = err.message;
    if (err.code === 'ENOTFOUND') {
      const host = err.hostname || 'the database host';
      errorMessage =
        `Cannot resolve ${host}. ` +
        'Possible causes: ' +
        '(1) Your Supabase project may be paused — visit https://supabase.com/dashboard to resume it. ' +
        '(2) DATABASE_URL may be using the direct host (db.xxx.supabase.co) which can fail in ' +
        'serverless environments. Switch to the Session-mode Pooler URL from ' +
        'Supabase → Project Settings → Database → Connection string. ' +
        '(3) Alternatively, set SUPABASE_URL + SUPABASE_ACCESS_TOKEN to bypass direct Postgres entirely.';
    }

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: errorMessage })
    };
  } finally {
    await client.end().catch(() => {});
  }
}
