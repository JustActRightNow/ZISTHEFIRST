// ═══════════════════════════════════════════════════
// ZISTHEFIRST — Database Setup Endpoint
// Netlify Function — POST /netlify/functions/setup-db
// Creates the `drops` and `drop_products` tables in
// Supabase if they do not already exist, then enables
// RLS with sensible read-write policies.
//
// Required Netlify env var:
//   DATABASE_URL — Supabase direct Postgres connection
//   string, found in Supabase → Project Settings →
//   Database → Connection string (URI).
//
// This function is idempotent: calling it multiple
// times is always safe (CREATE TABLE IF NOT EXISTS).
// ═══════════════════════════════════════════════════

const { Client } = require('pg');

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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'DATABASE_URL environment variable is not set. ' +
               'Add it in Netlify → Site settings → Environment variables. ' +
               'You can find the value in Supabase → Project Settings → Database → Connection string (URI).'
      })
    };
  }

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
    console.error('setup-db error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  } finally {
    await client.end().catch(() => {});
  }
};
