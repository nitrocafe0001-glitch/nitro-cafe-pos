
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '5mb' }));
app.use(express.static(ROOT));

const limiter = rateLimit({
  windowMs: 60000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

const supabase = process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

function configured() {
  return !!(
    process.env.POS_SHARED_PASSWORD &&
    process.env.POS_SHARED_PASSWORD.length >= 8
  );
}

app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && expected && token === expected) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/api/whatsapp/webhook', (req, res) => {
  if (req.body?.object === 'whatsapp_business_account') {
    console.log('WhatsApp webhook event received.');
  }
  return res.sendStatus(200);
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'NITRO CAFÃ‰ POS',
    sharedSync: true,
    passwordConfigured: configured(),
    databaseConfigured: !!supabase,
    whatsappConfigured: config().configured,
    missingConfiguration: config().missing
  });
});

app.post('/api/login', limiter, (req, res) => {
  if (!configured()) {
    return res.status(503).json({
      error: 'Set POS_SHARED_PASSWORD in server environment.'
    });
  }

  if (String(req.body?.password || '') !== process.env.POS_SHARED_PASSWORD) {
    return res.status(401).json({
      error: 'Incorrect shared login password.'
    });
  }

  res.json({ ok: true });
});

function auth(req, res, next) {
  if (!configured()) {
    return res.status(503).json({
      error: 'Shared login is not configured.'
    });
  }

  if (req.get('x-pos-password') !== process.env.POS_SHARED_PASSWORD) {
    return res.status(401).json({
      error: 'Login expired. Please sign in again.'
    });
  }

  next();
}

function makeOtpHash(billId, otp) {
  return crypto
    .createHmac('sha256', process.env.POS_SHARED_PASSWORD)
    .update(`${billId}:${otp}`)
    .digest('hex');
}

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

app.post('/api/delete/request-otp', auth, otpLimiter, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      error: 'Supabase database is not configured.'
    });
  }

  let insertedOtpId = null;

  try {
    const billId = String(req.body?.billId || '').trim();
    const ownerEmail = process.env.OWNER_EMAIL;
    const apiKey = process.env.RESEND_API_KEY;

    if (!billId) {
      return res.status(400).json({
        error: 'Bill ID is required.'
      });
    }

    if (!ownerEmail || !apiKey) {
      return res.status(503).json({
        error: 'Email OTP is not configured.'
      });
    }

    const { data: record, error: readError } = await supabase
      .from('pos_shared_data')
      .select('data')
      .eq('id', 1)
      .maybeSingle();

    if (readError) throw readError;

    const order = record?.data?.orders?.find(
      item => String(item.bill) === billId
    );

    if (!order || order.status === 'Cancelled' || order.cancelledAt) {
      return res.status(404).json({
        error: 'Active bill not found.'
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = makeOtpHash(billId, otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { data: insertedOtp, error: insertError } = await supabase
      .from('pos_delete_otps')
      .insert({
        bill_id: billId,
        otp_hash: otpHash,
        expires_at: expiresAt
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    insertedOtpId = insertedOtp.id;

    const mailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'NITRO CAFÃ‰ <onboarding@resend.dev>',
        to: [ownerEmail],
        subject: `NITRO CAFÃ‰ - Bill ${billId} cancellation OTP`,
        text: `Your OTP to cancel bill ${billId} is ${otp}. It expires in 5 minutes. Do not share this code.`
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!mailResponse.ok) {
      console.error('Resend email failed:', mailResponse.status);

      const { error: cleanupError } = await supabase
        .from('pos_delete_otps')
        .update({ used_at: new Date().toISOString() })
        .eq('id', insertedOtpId)
        .is('used_at', null);

      if (cleanupError) {
        console.error('OTP cleanup error:', cleanupError);
      }

      return res.status(502).json({
        error: 'Could not send OTP email.'
      });
    }

    // Invalidate all previous unused OTPs for this bill.
    const { error: invalidateError } = await supabase
      .from('pos_delete_otps')
      .update({ used_at: new Date().toISOString() })
      .eq('bill_id', billId)
      .is('used_at', null)
      .neq('id', insertedOtpId);

    if (invalidateError) {
      console.error('Previous OTP invalidation error:', invalidateError);

      // Do not leave the newly issued OTP usable if invalidation failed.
      const { error: cleanupError } = await supabase
        .from('pos_delete_otps')
        .update({ used_at: new Date().toISOString() })
        .eq('id', insertedOtpId)
        .is('used_at', null);

      if (cleanupError) {
        console.error('OTP cleanup error:', cleanupError);
      }

      return res.status(500).json({
        error: 'Could not safely issue a new OTP. Please request again.'
      });
    }

    return res.json({
      ok: true,
      message: 'OTP sent to owner email.'
    });
  } catch (error) {
    console.error('OTP request error:', error);

    if (supabase && insertedOtpId !== null) {
      const { error: cleanupError } = await supabase
        .from('pos_delete_otps')
        .update({ used_at: new Date().toISOString() })
        .eq('id', insertedOtpId)
        .is('used_at', null);

      if (cleanupError) {
        console.error('OTP cleanup error:', cleanupError);
      }
    }

    return res.status(500).json({
      error: 'Could not request OTP.'
    });
  }
});

app.post('/api/delete/verify-otp', auth, otpLimiter, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      error: 'Supabase database is not configured.'
    });
  }

  try {
    const billId = String(req.body?.billId || '').trim();
    const otp = String(req.body?.otp || '').trim();
    const reason = String(req.body?.reason || '').trim();
    const allowedReasons = [
      'Customer cancelled',
      'Wrong order',
      'Duplicate bill',
      'Payment issue',
      'Other'
    ];

    if (!billId || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        error: 'Enter the 6-digit OTP.'
      });
    }

    if (!allowedReasons.includes(reason)) {
      return res.status(400).json({
        error: 'Select a valid cancellation reason.'
      });
    }

    const otpHash = makeOtpHash(billId, otp);

    const { data, error } = await supabase.rpc('pos_cancel_bill', {
      p_bill_id: billId,
      p_otp_hash: otpHash,
      p_reason: reason
    });

    if (error) {
      console.error('OTP verification database error:', error);
      return res.status(400).json({
        error: 'Invalid, expired, or already used OTP.'
      });
    }

    return res.json({
      ok: true,
      result: data
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    return res.status(500).json({
      error: 'Could not verify OTP.'
    });
  }
});

app.post('/api/menu/delete/request-otp', auth, otpLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured.' });

  let insertedOtpId = null;

  try {
    const itemId = String(req.body?.itemId || '').trim();
    const scope = 'MENU:' + itemId;
    const ownerEmail = process.env.OWNER_EMAIL;
    const apiKey = process.env.RESEND_API_KEY;

    if (!itemId) return res.status(400).json({ error: 'Product ID required.' });
    if (!ownerEmail || !apiKey) return res.status(503).json({ error: 'Email OTP is not configured.' });

    const { data: record, error: readError } = await supabase
      .from('pos_shared_data').select('data').eq('id', 1).maybeSingle();

    if (readError) throw readError;

    const item = record?.data?.menu?.find(x => String(x.id) === itemId);
    if (!item) return res.status(404).json({ error: 'Product not found.' });

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = makeOtpHash(scope, otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from('pos_delete_otps')
      .insert({ bill_id: scope, otp_hash: otpHash, expires_at: expiresAt })
      .select('id').single();

    if (insertError) throw insertError;
    insertedOtpId = inserted.id;

    const { error: invalidateError } = await supabase
      .from('pos_delete_otps').update({ used_at: new Date().toISOString() })
      .eq('bill_id', scope).is('used_at', null).neq('id', insertedOtpId);

    if (invalidateError) throw invalidateError;

    const mail = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'NITRO CAFE <onboarding@resend.dev>',
        to: [ownerEmail],
        subject: 'NITRO CAFE - Product deletion OTP',
        text: `Your OTP to delete "${item.name}" is ${otp}. It expires in 5 minutes.`
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!mail.ok) throw new Error('Could not send OTP email.');

    return res.json({ ok: true, message: 'OTP sent to owner email.' });
  } catch (error) {
    console.error('Product OTP request error:', error);
    if (insertedOtpId !== null) {
      await supabase.from('pos_delete_otps')
        .update({ used_at: new Date().toISOString() })
        .eq('id', insertedOtpId).is('used_at', null);
    }
    return res.status(500).json({ error: 'Could not send product deletion OTP.' });
  }
});

app.post('/api/menu/delete/verify-otp', auth, otpLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured.' });

  try {
    const itemId = String(req.body?.itemId || '').trim();
    const otp = String(req.body?.otp || '').trim();

    if (!itemId || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'Enter the 6-digit OTP.' });
    }

    const { data, error } = await supabase.rpc('pos_delete_menu_item', {
      p_item_id: itemId,
      p_otp_hash: makeOtpHash('MENU:' + itemId, otp)
    });

    if (error) {
      console.error('Product OTP verification error:', error);
      return res.status(400).json({ error: 'Invalid, expired, or already used OTP.' });
    }

    return res.json({ ok: true, result: data });
  } catch (error) {
    console.error('Product deletion error:', error);
    return res.status(500).json({ error: 'Could not delete product.' });
  }
});
app.post('/api/checkout', auth, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      error: 'Supabase database is not configured.'
    });
  }

  const order = req.body?.order;

  if (
    !order ||
    !order.bill ||
    !Array.isArray(order.items) ||
    order.items.length === 0
  ) {
    return res.status(400).json({
      error: 'Invalid order.'
    });
  }

  try {
    const { data, error } = await supabase.rpc(
      'pos_checkout_order',
      { p_order: order }
    );

    if (error) {
      console.error('Checkout error:', error);
      return res.status(400).json({
        error: error.message.includes('Insufficient stock')
          ? 'Insufficient stock. Please refresh the POS and try again.'
          : 'Could not complete order. Please refresh and try again.'
      });
    }

    if (
      !data ||
      !data.data ||
      !Array.isArray(data.data.menu) ||
      !Array.isArray(data.data.orders) ||
      data.version === undefined
    ) {
      console.error('Unexpected checkout RPC response:', data);
      return res.status(500).json({
        error: 'Unexpected checkout response. Please contact support.'
      });
    }

    return res.json({
      ok: true,
      data: data.data,
      version: data.version
    });
  } catch (error) {
    console.error('Checkout API error:', error);
    return res.status(500).json({
      error: 'Could not complete order.'
    });
  }
});

app.get('/api/shared-data', auth, async (_req, res) => {
  if (!supabase) {
    return res.status(503).json({
      error: 'Supabase database is not configured.'
    });
  }

  try {
    const { data, error } = await supabase
      .from('pos_shared_data')
      .select('data, version')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;

    return res.json({
      data: data?.data || null,
      version: Number(data?.version || 1)
    });
  } catch (error) {
    console.error('Shared data read error:', error);
    return res.status(500).json({
      error: 'Could not read shared data.'
    });
  }
});

const settingsOtpTokens = new Map();
const settingsOtpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false });

app.post('/api/settings/request-otp', auth, settingsOtpLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured.' });
  let insertedOtpId = null;
  try {
    const ownerEmail = process.env.OWNER_EMAIL;
    const apiKey = process.env.RESEND_API_KEY;
    if (!ownerEmail || !apiKey) return res.status(503).json({ error: 'Email OTP is not configured.' });

    const scope = 'SETTINGS';
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = makeOtpHash(scope, otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from('pos_delete_otps')
      .insert({ bill_id: scope, otp_hash: otpHash, expires_at: expiresAt })
      .select('id').single();
    if (insertError) throw insertError;
    insertedOtpId = inserted.id;

    const { error: invalidateError } = await supabase
      .from('pos_delete_otps').update({ used_at: new Date().toISOString() })
      .eq('bill_id', scope).is('used_at', null).neq('id', insertedOtpId);
    if (invalidateError) throw invalidateError;

    const mail = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'NITRO CAFE <onboarding@resend.dev>',
        to: [ownerEmail],
        subject: 'NITRO CAFE - Settings OTP',
        text: `Your Settings verification OTP is ${otp}. It expires in 5 minutes.`
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!mail.ok) throw new Error('Could not send OTP email.');
    return res.json({ ok: true, message: 'OTP sent to owner email.' });
  } catch (error) {
    console.error('Settings OTP request error:', error);
    if (insertedOtpId !== null) {
      await supabase.from('pos_delete_otps').update({ used_at: new Date().toISOString() }).eq('id', insertedOtpId).is('used_at', null);
    }
    return res.status(500).json({ error: 'Could not send Settings OTP.' });
  }
});

app.post('/api/settings/verify-otp', auth, settingsOtpLimiter, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database not configured.' });
  try {
    const otp = String(req.body?.otp || '').trim();
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Enter the 6-digit OTP.' });

    const { data: record, error } = await supabase.from('pos_delete_otps')
      .select('id')
      .eq('bill_id', 'SETTINGS')
      .eq('otp_hash', makeOtpHash('SETTINGS', otp))
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!record) return res.status(400).json({ error: 'Invalid, expired, or already used OTP.' });

    const { data: used, error: useError } = await supabase.from('pos_delete_otps')
      .update({ used_at: new Date().toISOString() })
      .eq('id', record.id)
      .is('used_at', null)
      .select('id')
      .maybeSingle();

    if (useError) throw useError;
    if (!used) return res.status(400).json({ error: 'OTP has already been used.' });

    const settingsToken = crypto.randomBytes(32).toString('hex');
    settingsOtpTokens.set(settingsToken, Date.now() + 5 * 60 * 1000);
    return res.json({ ok: true, settingsToken });
  } catch (error) {
    console.error('Settings OTP verification error:', error);
    return res.status(500).json({ error: 'Could not verify Settings OTP.' });
  }
});
app.put('/api/shared-data', auth, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      error: 'Supabase database is not configured.'
    });
  }

  const d = req.body?.data;
  const expectedVersion = Number(req.body?.expectedVersion);

  if (
    !d ||
    !Array.isArray(d.menu) ||
    !Array.isArray(d.orders)
  ) {
    return res.status(400).json({
      error: 'Invalid POS data.'
    });
  }

  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    return res.status(400).json({
      error: 'A valid expected version is required. Please refresh the POS.'
    });
  }

  try {
    const { data: currentRecord, error: readError } = await supabase
      .from('pos_shared_data')
      .select('data')
      .eq('id', 1)
      .maybeSingle();

    if (readError) throw readError;

    const currentSettings = currentRecord?.data?.settings || {};
    const incomingSettings = d.settings || {};
    const settingsChanged = JSON.stringify(currentSettings) !== JSON.stringify(incomingSettings);

    if (settingsChanged) {
      const settingsToken = String(req.headers['x-settings-otp-token'] || '');
      const tokenExpiry = settingsOtpTokens.get(settingsToken);

      if (!settingsToken || !tokenExpiry || tokenExpiry < Date.now()) {
        return res.status(403).json({ error: 'Settings change requires a fresh email OTP.' });
      }

      settingsOtpTokens.delete(settingsToken);
    }

    const { data: result, error } = await supabase.rpc(
      'pos_save_shared_data',
      {
        p_expected_version: expectedVersion,
        p_data: d
      }
    );

    if (error) {
      console.error('Shared data save RPC error:', error);

      if (
        error.message?.includes('Bills cannot be deleted directly') ||
        error.message?.includes('Owner OTP is required') ||
        error.message?.includes('Cancelled bill cannot be reactivated')
      ) {
        return res.status(403).json({
          error: error.message
        });
      }

      return res.status(500).json({
        error: 'Could not save shared data.'
      });
    }

    if (result?.conflict) {
      return res.status(409).json({
        ok: false,
        conflict: true,
        version: result.version,
        data: result.data,
        error: 'Another device updated the POS. Latest data has been returned.'
      });
    }

    if (!result?.ok) {
      return res.status(500).json({
        error: 'Could not save shared data.'
      });
    }

    return res.json({
      ok: true,
      version: result.version,
      data: result.data,
      savedAt: Date.now()
    });
  } catch (error) {
    console.error('Shared data save error:', error);
    return res.status(500).json({
      error: 'Could not save shared data.'
    });
  }
});

function config() {
  const common = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'GRAPH_API_VERSION'
  ];

  const missing = common.filter(k =>
    !process.env[k] ||
    process.env[k].startsWith('PASTE_') ||
    process.env[k] === 'vXX.X'
  );

  return { configured: missing.length === 0, missing };
}

function normalizePhone(p) {
  let n = String(p || '').replace(/\D/g, '');

  if (n.length === 10) {
    n = (process.env.DEFAULT_COUNTRY_CODE || '91') + n;
  }

  return n.length >= 10 && n.length <= 15 ? n : null;
}

async function sendTemplate(req, res, templateKey, kind) {
  const c = config();

  if (!c.configured) {
    return res.status(503).json({
      error: 'WhatsApp API is not configured.',
      missingConfiguration: c.missing
    });
  }

  const body = req.body || {};

  if (body.consent !== true) {
    return res.status(400).json({
      error: 'Customer consent is required.'
    });
  }

  const phone = normalizePhone(body.phone);

  if (!phone) {
    return res.status(400).json({
      error: 'A valid customer phone number is required.'
    });
  }

  const template = process.env[templateKey];

  if (!template) {
    return res.status(503).json({
      error: `Missing ${templateKey} in server environment.`
    });
  }

  const params = kind === 'bill'
    ? [
        String(body.customerName || 'Customer'),
        String(body.billNo || 'Bill'),
        `â‚¹${Number(body.total || 0).toFixed(2)}`
      ]
    : [
        String(body.customerName || 'Customer'),
        String(body.billNo || 'Order'),
        String(body.shopName || 'NITRO CAFÃ‰')
      ];

  const url =
    `https://graph.facebook.com/${process.env.GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'template',
        template: {
          name: template,
          language: {
            code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en'
          },
          components: [{
            type: 'body',
            parameters: params.map(text => ({
              type: 'text',
              text: text.slice(0, 200)
            }))
          }]
        }
      }),
      signal: AbortSignal.timeout(15000)
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      console.error('Meta API error', r.status, data.error?.message);
      return res.status(502).json({
        error: data.error?.message ||
          'Meta WhatsApp request failed.'
      });
    }

    return res.json({
      ok: true,
      messageId: data.messages?.[0]?.id || null,
      recipient: phone,
      message: 'Request accepted by Meta; delivery is not guaranteed.'
    });
  } catch (e) {
    return res.status(502).json({
      error: 'Could not reach Meta WhatsApp API.'
    });
  }
}

app.post('/api/whatsapp/send-bill', limiter, (req, res) =>
  sendTemplate(req, res, 'WHATSAPP_BILL_TEMPLATE', 'bill')
);

app.post('/api/whatsapp/food-ready', limiter, (req, res) =>
  sendTemplate(req, res, 'WHATSAPP_FOOD_READY_TEMPLATE', 'foodReady')
);

app.listen(PORT, () => {
  console.log(`NITRO CAFÃ‰ POS running on port ${PORT}`);

  if (!configured()) {
    console.log('Set POS_SHARED_PASSWORD in server environment.');
  }

  if (!supabase) {
    console.log('Supabase database is not configured.');
  }
});
