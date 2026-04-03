// ═══════════════════════════════════════════════════
// ZISTHEFIRST — Public Config Endpoint
// Netlify Function — GET /netlify/functions/get-config
// Serves only PUBLIC keys (safe to expose to browser)
// Secret keys (Paystack secret, Supabase service role)
// are NEVER returned here — they stay server-side only
// ═══════════════════════════════════════════════════

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600', // cache 1 hour — these don't change
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      supabaseUrl:      process.env.SUPABASE_URL,
      supabaseAnonKey:  process.env.SUPABASE_ANON_KEY,
      cloudinaryName:   process.env.CLOUDINARY_NAME || 'dadjmvc82',
      paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY
    })
  };
};
