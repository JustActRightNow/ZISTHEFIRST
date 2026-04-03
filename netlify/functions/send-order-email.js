// ═══════════════════════════════════════════════════
// ZISTHEFIRST — Order Confirmation Email
// Netlify Function — POST /netlify/functions/send-order-email
// Uses Resend API to send branded HTML email to customer
// ═══════════════════════════════════════════════════

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.error('RESEND_API_KEY not set');
    return { statusCode: 500, body: 'Email service not configured' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const {
    customer_name, customer_email, customer_phone,
    customer_whatsapp, delivery_address, delivery_option,
    delivery_cost, items, subtotal, total, paystack_ref
  } = body;

  if (!customer_email || !paystack_ref) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  // Build items HTML rows
  const parsedItems = Array.isArray(items) ? items : JSON.parse(items || '[]');
  const itemRows = parsedItems.map(i => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #1a1a1a;font-family:'Courier New',monospace;font-size:13px;color:#ffffff;">
        ${escHtml(i.name)}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #1a1a1a;text-align:center;font-size:12px;color:#888888;">
        ${escHtml(i.size)}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #1a1a1a;text-align:center;font-size:12px;color:#888888;">
        ×${i.qty || 1}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #1a1a1a;text-align:right;font-family:'Courier New',monospace;font-size:13px;color:#ffffff;">
        ₦${((i.price || 0) * (i.qty || 1)).toLocaleString('en-NG')}
      </td>
    </tr>`).join('');

  const waContact = customer_whatsapp || customer_phone;

  const htmlEmail = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Order Confirmed — ZISTHEFIRST</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Courier New',Courier,monospace;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

      <!-- HEADER BARCODE STRIP -->
      <tr>
        <td style="background:repeating-linear-gradient(90deg,#cc0000 0,#cc0000 2px,transparent 2px,transparent 8px);height:4px;"></td>
      </tr>

      <!-- LOGO -->
      <tr>
        <td style="background:#111111;padding:28px 32px 20px;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;">
          <p style="margin:0;font-size:28px;letter-spacing:0.12em;font-weight:700;font-family:Arial,sans-serif;">
            <span style="color:#ffffff;">ZISTHE</span><span style="color:#cc0000;">FIRST</span>
          </p>
          <p style="margin:6px 0 0;font-size:9px;letter-spacing:0.3em;color:#444444;text-transform:uppercase;">
            ORDER CONFIRMATION
          </p>
        </td>
      </tr>

      <!-- CONFIRMATION BADGE -->
      <tr>
        <td style="background:#111111;padding:0 32px 28px;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#001a08;border:1px solid #00aa44;padding:10px 18px;">
                <span style="color:#00aa44;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;">
                  ✓ &nbsp;ORDER CONFIRMED
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- GREETING -->
      <tr>
        <td style="background:#111111;padding:0 32px 24px;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;">
          <p style="margin:0;font-size:15px;color:#ffffff;letter-spacing:0.04em;line-height:1.6;">
            ${escHtml(customer_name.split(' ')[0])},
          </p>
          <p style="margin:8px 0 0;font-size:12px;color:#666666;letter-spacing:0.06em;line-height:1.8;">
            Your order is confirmed and being processed. Our team will contact you on 
            WhatsApp at <strong style="color:#ffffff;">${escHtml(waContact)}</strong> to arrange your GIG Logistics delivery.
            Expect your order within <strong style="color:#cc0000;">3–5 business days</strong>.
          </p>
        </td>
      </tr>

      <!-- DIVIDER -->
      <tr>
        <td style="background:#111111;padding:0 32px;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;">
          <div style="height:1px;background:#1a1a1a;"></div>
        </td>
      </tr>

      <!-- ORDER REFERENCE -->
      <tr>
        <td style="background:#111111;padding:20px 32px;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;">
          <p style="margin:0;font-size:9px;letter-spacing:0.25em;color:#444444;text-transform:uppercase;">Order Reference</p>
          <p style="margin:6px 0 0;font-size:13px;color:#cc0000;letter-spacing:0.1em;">${escHtml(paystack_ref)}</p>
        </td>
      </tr>

      <!-- DIVIDER -->
      <tr>
        <td style="background:#111111;padding:0 32px;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;">
          <div style="height:1px;background:#1a1a1a;"></div>
        </td>
      </tr>

      <!-- ITEMS -->
      <tr>
        <td style="background:#111111;padding:20px 32px;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;">
          <p style="margin:0 0 14px;font-size:9px;letter-spacing:0.25em;color:#444444;text-transform:uppercase;">Items Ordered</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <th style="text-align:left;font-size:9px;letter-spacing:0.15em;color:#444444;text-transform:uppercase;padding-bottom:8px;">Item</th>
              <th style="text-align:center;font-size:9px;letter-spacing:0.15em;color:#444444;text-transform:uppercase;padding-bottom:8px;">Size</th>
              <th style="text-align:center;font-size:9px;letter-spacing:0.15em;color:#444444;text-transform:uppercase;padding-bottom:8px;">Qty</th>
              <th style="text-align:right;font-size:9px;letter-spacing:0.15em;color:#444444;text-transform:uppercase;padding-bottom:8px;">Price</th>
            </tr>
            ${itemRows}
          </table>
        </td>
      </tr>

      <!-- ORDER TOTALS -->
      <tr>
        <td style="background:#0d0d0d;padding:18px 32px;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;border-top:1px solid #1a1a1a;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:11px;color:#666666;padding-bottom:7px;">Subtotal</td>
              <td style="text-align:right;font-size:11px;color:#ffffff;padding-bottom:7px;">₦${Number(subtotal).toLocaleString('en-NG')}</td>
            </tr>
            <tr>
              <td style="font-size:11px;color:#666666;padding-bottom:7px;">Delivery (${escHtml(delivery_option)})</td>
              <td style="text-align:right;font-size:11px;color:#ffffff;padding-bottom:7px;">₦${Number(delivery_cost).toLocaleString('en-NG')}</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#ffffff;font-weight:700;padding-top:10px;border-top:1px solid #222222;">TOTAL</td>
              <td style="text-align:right;font-size:14px;font-weight:700;padding-top:10px;border-top:1px solid #222222;">
                <span style="color:#cc0000;">₦</span>${Number(total).toLocaleString('en-NG')}
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- DELIVERY INFO -->
      <tr>
        <td style="background:#111111;padding:20px 32px;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;border-top:1px solid #1a1a1a;">
          <p style="margin:0 0 12px;font-size:9px;letter-spacing:0.25em;color:#444444;text-transform:uppercase;">Delivery Details</p>
          <p style="margin:0;font-size:11px;color:#888888;line-height:1.8;">
            <span style="color:#666666;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;">Address</span><br/>
            <span style="color:#ffffff;">${escHtml(delivery_address)}</span>
          </p>
          <p style="margin:14px 0 0;font-size:11px;color:#888888;line-height:1.8;">
            <span style="color:#666666;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;">WhatsApp for Updates</span><br/>
            <span style="color:#ffffff;">${escHtml(waContact)}</span>
          </p>
        </td>
      </tr>

      <!-- SUPPORT -->
      <tr>
        <td style="background:#0d0d0d;padding:18px 32px;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;border-top:1px solid #1a1a1a;">
          <p style="margin:0;font-size:10px;color:#444444;letter-spacing:0.08em;line-height:1.7;">
            Questions? WhatsApp us at 
            <a href="https://wa.me/2347034626602" style="color:#cc0000;text-decoration:none;">+234 703 462 6602</a>.
            Please quote your order reference in any message.
          </p>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="background:#111111;padding:22px 32px;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;border-bottom:1px solid #1a1a1a;text-align:center;">
          <p style="margin:0;font-size:18px;letter-spacing:0.12em;font-weight:700;font-family:Arial,sans-serif;">
            <span style="color:#ffffff;">ZISTHE</span><span style="color:#cc0000;">FIRST</span>
          </p>
          <p style="margin:8px 0 0;font-size:9px;letter-spacing:0.22em;color:#333333;text-transform:uppercase;">
            I FUXS WITH IT &nbsp;★&nbsp; ESTABLISHED 2026 &nbsp;★&nbsp; LAGOS, NG
          </p>
        </td>
      </tr>

      <!-- BOTTOM BARCODE STRIP -->
      <tr>
        <td style="background:repeating-linear-gradient(90deg,#ffffff 0,#ffffff 2px,transparent 2px,transparent 8px);height:3px;opacity:0.06;"></td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  // Send via Resend
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from:    'ZISTHEFIRST <onboarding@resend.dev>',
        to:      [customer_email],
        subject: `Order Confirmed — ${paystack_ref} | ZISTHEFIRST`,
        html:    htmlEmail
      })
    });

    const result = await res.json();

    if (!res.ok) {
      console.error('Resend error:', result);
      return { statusCode: 500, body: JSON.stringify({ error: 'Email failed', detail: result }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: result.id })
    };
  } catch (err) {
    console.error('Email send exception:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
