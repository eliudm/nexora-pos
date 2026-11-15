require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const {
  db, getSubscription, upsertSubscription, activateSubscription,
  activateByIdentifier, createTransaction, updateTransaction,
} = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const FLW_SECRET = process.env.FLW_SECRET_KEY;
const FLW_BASE = 'https://api.flutterwave.com/v3';
const AMOUNT = parseInt(process.env.SUBSCRIPTION_AMOUNT || '600');
const DAYS = parseInt(process.env.SUBSCRIPTION_DAYS || '30');
const SERVER_URL = (process.env.SERVER_URL || 'http://localhost:3000').replace(/\/$/, '');

function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '254' + digits.slice(1);
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) return '254' + digits;
  return digits;
}

async function flwPost(path, body) {
  const res = await fetch(`${FLW_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FLW_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Initiate M-Pesa STK Push ─────────────────────────────────────────────────
app.post('/api/subscribe/mpesa', async (req, res) => {
  const { phone, name, email } = req.body;
  if (!phone || !name) return res.status(400).json({ error: 'phone and name are required' });

  const identifier = normalizePhone(phone);
  const txRef = `NXP-${uuidv4()}`;

  try {
    const result = await flwPost('/charges?type=mpesa', {
      phone_number: identifier,
      amount: AMOUNT,
      currency: 'KES',
      email: email || `${identifier}@nexorapos.com`,
      tx_ref: txRef,
      fullname: name,
    });

    if (result.status !== 'success') {
      return res.status(400).json({ error: result.message || 'Failed to initiate M-Pesa payment' });
    }

    upsertSubscription({ identifier, name, email, txRef, paymentMethod: 'mpesa' });
    createTransaction({ txRef, amount: AMOUNT, currency: 'KES', paymentMethod: 'mpesa', status: 'pending', rawResponse: JSON.stringify(result) });

    res.json({ txRef, status: 'pending', message: 'Check your phone for the M-Pesa prompt and enter your PIN.' });
  } catch (err) {
    console.error('M-Pesa error:', err.message);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ── Initiate card payment (hosted Flutterwave page) ──────────────────────────
app.post('/api/subscribe/card', async (req, res) => {
  const { name, email, phone } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email are required' });

  const txRef = `NXP-${uuidv4()}`;
  const identifier = phone ? normalizePhone(phone) : email;

  try {
    const result = await flwPost('/payments', {
      tx_ref: txRef,
      amount: AMOUNT,
      currency: 'KES',
      redirect_url: `${SERVER_URL}/api/payment/callback`,
      customer: { email, phone_number: phone ? normalizePhone(phone) : undefined, name },
      customizations: {
        title: 'Nexora POS',
        description: `Monthly subscription · KES ${AMOUNT}`,
      },
      payment_options: 'card',
    });

    if (result.status !== 'success') {
      return res.status(400).json({ error: result.message || 'Failed to create payment link' });
    }

    upsertSubscription({ identifier, name, email, txRef, paymentMethod: 'card' });
    createTransaction({ txRef, amount: AMOUNT, currency: 'KES', paymentMethod: 'card', status: 'pending', rawResponse: JSON.stringify(result) });

    res.json({ txRef, paymentLink: result.data?.link });
  } catch (err) {
    console.error('Card error:', err.message);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ── Card payment callback (Flutterwave redirects here after checkout) ─────────
app.get('/api/payment/callback', async (req, res) => {
  const { tx_ref, status, transaction_id } = req.query;

  if (status === 'successful' && tx_ref && transaction_id) {
    try {
      const verifyRes = await fetch(`${FLW_BASE}/transactions/${transaction_id}/verify`, {
        headers: { Authorization: `Bearer ${FLW_SECRET}` },
      });
      const verify = await verifyRes.json();

      if (verify.data?.status === 'successful' && verify.data?.amount >= AMOUNT) {
        activateSubscription(tx_ref, DAYS);
        updateTransaction(tx_ref, 'successful', verify.data?.flw_ref);
      }
    } catch (e) {
      console.error('Callback verify error:', e.message);
    }
  }

  const success = status === 'successful';
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nexora POS</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}.card{background:#fff;border-radius:16px;padding:40px;max-width:360px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}.icon{font-size:56px;margin-bottom:16px}.title{font-size:22px;font-weight:800;color:${success ? '#22c55e' : '#e53935'}}.msg{font-size:14px;color:#666;margin-top:8px;line-height:1.6}</style></head><body><div class="card"><div class="icon">${success ? '✅' : '❌'}</div><div class="title">${success ? 'Payment Successful!' : 'Payment Failed'}</div><div class="msg">${success ? 'Your Nexora POS subscription is now active.<br>You can close this page and return to the app.' : 'Your payment was not completed.<br>Please go back to the app and try again.'}</div></div></body></html>`);
});

// ── Flutterwave webhook ───────────────────────────────────────────────────────
app.post('/api/webhook/flutterwave', (req, res) => {
  const hash = req.headers['verif-hash'];
  if (hash !== process.env.FLW_WEBHOOK_HASH) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event, data } = req.body;
  if (event === 'charge.completed' && data?.status === 'successful') {
    const { tx_ref, amount, currency, flw_ref } = data;
    if (amount >= AMOUNT && currency === 'KES') {
      activateSubscription(tx_ref, DAYS);
      updateTransaction(tx_ref, 'successful', flw_ref);
      console.log(`✅ Subscription activated via webhook: ${tx_ref}`);
    }
  }

  res.json({ status: 'ok' });
});

// ── Check subscription status ─────────────────────────────────────────────────
app.get('/api/status/:identifier', (req, res) => {
  const raw = decodeURIComponent(req.params.identifier);
  const identifier = normalizePhone(raw);

  // Try normalized phone first, then raw (for email lookups)
  const sub = getSubscription(identifier) || getSubscription(raw);

  if (!sub || sub.status !== 'active') {
    return res.json({ active: false, expiresAt: null, daysLeft: 0, plan: null });
  }

  const now = Date.now();
  const expiry = new Date(sub.expires_at).getTime();
  const daysLeft = Math.max(0, Math.ceil((expiry - now) / 86400000));

  if (daysLeft === 0) {
    db.prepare("UPDATE subscriptions SET status='expired', updated_at=datetime('now') WHERE identifier=?").run(sub.identifier);
    return res.json({ active: false, expiresAt: sub.expires_at, daysLeft: 0, plan: sub.plan });
  }

  res.json({ active: true, expiresAt: sub.expires_at, daysLeft, plan: sub.plan });
});

// ── Admin: manually activate (for bank transfers) ────────────────────────────
app.post('/api/admin/activate', (req, res) => {
  const { identifier, adminKey } = req.body;
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid admin key' });
  }
  const normalized = normalizePhone(identifier);
  activateByIdentifier(normalized, DAYS);
  res.json({ success: true, identifier: normalized, message: `Activated for ${DAYS} days` });
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nexora subscription server on port ${PORT}`));
