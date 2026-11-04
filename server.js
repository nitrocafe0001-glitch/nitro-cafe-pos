require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
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

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'NITRO CAFÉ POS',
    sharedSync: true,
    passwordConfigured: configured(),
    databaseConfigured: !!supabase
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

app.get('/api/shared-data', auth, async (_req, res) => {
  if (!supabase) {
    return res.status(503).json({
      error: 'Supabase database is not configured.'
    });
  }

  const { data, error } = await supabase
    .from('pos_shared_data')
    .select('data')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({
      error: 'Could not read shared data.'
    });
  }

  res.json({ data: data?.data || null });
});

app.put('/api/shared-data', auth, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      error: 'Supabase database is not configured.'
    });
  }

  const d = req.body?.data;

  if (!d || !Array.isArray(d.menu) || !Array.isArray(d.orders)) {
    return res.status(400).json({
      error: 'Invalid POS data.'
    });
  }

  const { error } = await supabase
    .from('pos_shared_data')
    .upsert({
      id: 1,
      data: d,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });

  if (error) {
    console.error(error);
    return res.status(500).json({
      error: 'Could not save shared data.'
    });
  }

  res.json({
    ok: true,
    savedAt: Date.now()
  });
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
        `₹${Number(body.total || 0).toFixed(2)}`
      ]
    : [
        String(body.customerName || 'Customer'),
        String(body.billNo || 'Order'),
        String(body.shopName || 'NITRO CAFÉ')
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
  console.log(`NITRO CAFÉ POS running on port ${PORT}`);

  if (!configured()) {
    console.log('Set POS_SHARED_PASSWORD in server environment.');
  }

  if (!supabase) {
    console.log('Supabase database is not configured.');
  }
});