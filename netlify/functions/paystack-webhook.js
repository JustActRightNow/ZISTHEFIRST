// ═══════════════════════════════════════════════════
// ZISTHEFIRST — Paystack Webhook
// Netlify Function — POST /netlify/functions/paystack-webhook
// Receives charge.success events from Paystack
// Verifies HMAC signature, saves order to Supabase
// Acts as server-side backup — handles orders even if
// the customer's browser crashes before frontend callback fires
// ═══════════════════════════════════════════════════

const crypto = require('crypto');

// All config comes from Netlify environment variables — nothing hardcoded

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // ── VERIFY PAYSTACK SIGNATURE ───────────────────
  const secret    = process.env.PAYSTACK_SECRET_KEY;
  const signature = event.headers['x-paystack-signature'];

  if (!secret || !signature) {
    console.error('Missing secret or signature');
    return { statusCode: 400, body: 'Unauthorised' };
  }

  const hash = crypto
    .createHmac('sha512', secret)
    .update(event.body)
    .digest('hex');

  if (hash !== signature) {
    console.error('Signature mismatch — possible spoofed request');
    return { statusCode: 401, body: 'Signature mismatch' };
  }

  // ── PARSE EVENT ─────────────────────────────────
  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  // Only handle successful charges
  if (payload.event !== 'charge.success') {
    return { statusCode: 200, body: 'Event type ignored' };
  }

  const data = payload.data;
  const meta = data.metadata || {};
  const ref  = data.reference;

  if (!ref) {
    return { statusCode: 400, body: 'No reference in payload' };
  }

  // Extract custom fields Paystack passes back
  const fields   = meta.custom_fields || [];
  const getField = (key) => {
    const f = fields.find(f => f.variable_name === key);
    return f ? f.value : '';
  };

  const customerName    = getField('name');
  const customerPhone   = getField('phone');
  const customerWa      = getField('whatsapp') || customerPhone;
  const address         = getField('address');
  const deliveryLabel   = getField('delivery');
  const orderStr        = getField('order'); // "ItemName (size) x1, ..."
  const customerEmail   = data.customer?.email || '';
  const totalKobo       = data.amount || 0;
  const total           = Math.round(totalKobo / 100);

  // Parse delivery cost from label
  let deliveryCost = 0;
  if (deliveryLabel.includes('3,000') || deliveryLabel.toLowerCase().includes('in-lagos')) deliveryCost = 3000;
  else if (deliveryLabel.includes('4,000') || deliveryLabel.toLowerCase().includes('out-lagos')) deliveryCost = 4000;
  else if (deliveryLabel.includes('7,500') || deliveryLabel.toLowerCase().includes('nationwide')) deliveryCost = 7500;

  const subtotal = total - deliveryCost;

  // Parse items string back into array
  // Format from frontend: "Name (size) x1, Name2 (size) x2"
  const items = orderStr ? orderStr.split(', ').map(part => {
    const match = part.match(/^(.+?)\s*\((.+?)\)\s*x(\d+)$/);
    if (match) return { name: match[1].trim(), size: match[2].trim(), qty: parseInt(match[3]) };
    return { name: part, size: '', qty: 1 };
  }) : [];

  // ── UPSERT TO SUPABASE ───────────────────────────
  // Using upsert with onConflict='paystack_ref' means:
  // - If frontend already saved it, this is a no-op (safe)
  // - If frontend failed (browser crash), this saves it (recovery)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  const supaRes = await fetch(`${supabaseUrl}/rest/v1/orders`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer':        'resolution=ignore-duplicates'
    },
    body: JSON.stringify({
      paystack_ref:       ref,
      customer_name:      customerName,
      customer_email:     customerEmail,
      customer_phone:     customerPhone,
      customer_whatsapp:  customerWa,
      delivery_address:   address,
      delivery_option:    deliveryLabel,
      delivery_cost:      deliveryCost,
      items:              JSON.stringify(items),
      subtotal:           subtotal,
      total:              total,
      status:             'confirmed'
    })
  });

  if (!supaRes.ok) {
    const errText = await supaRes.text();
    // 409 conflict = already exists from frontend = fine
    if (!errText.includes('duplicate') && !errText.includes('unique')) {
      console.error('Supabase insert error:', errText);
    }
  }

  // Paystack expects a 200 quickly — always return 200
  return { statusCode: 200, body: JSON.stringify({ received: true, ref }) };
};
