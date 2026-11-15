const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'subscriptions.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT UNIQUE NOT NULL,
    name TEXT,
    email TEXT,
    plan TEXT DEFAULT 'monthly',
    status TEXT DEFAULT 'pending',
    tx_ref TEXT,
    payment_method TEXT,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_ref TEXT UNIQUE NOT NULL,
    amount REAL,
    currency TEXT,
    payment_method TEXT,
    status TEXT DEFAULT 'pending',
    flw_ref TEXT,
    raw_response TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

function getSubscription(identifier) {
  return db.prepare('SELECT * FROM subscriptions WHERE identifier = ?').get(identifier);
}

function upsertSubscription({ identifier, name, email, txRef, paymentMethod }) {
  db.prepare(`
    INSERT INTO subscriptions (identifier, name, email, tx_ref, payment_method)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(identifier) DO UPDATE SET
      name = coalesce(excluded.name, name),
      email = coalesce(excluded.email, email),
      tx_ref = excluded.tx_ref,
      payment_method = excluded.payment_method,
      updated_at = datetime('now')
  `).run(identifier, name || null, email || null, txRef, paymentMethod);
}

function activateSubscription(txRef, days) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  db.prepare(`
    UPDATE subscriptions
    SET status = 'active', expires_at = ?, updated_at = datetime('now')
    WHERE tx_ref = ?
  `).run(expiresAt.toISOString(), txRef);
}

function activateByIdentifier(identifier, days) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  db.prepare(`
    INSERT INTO subscriptions (identifier, plan, status, payment_method, expires_at)
    VALUES (?, 'monthly', 'active', 'bank', ?)
    ON CONFLICT(identifier) DO UPDATE SET
      status = 'active',
      expires_at = ?,
      updated_at = datetime('now')
  `).run(identifier, expiresAt.toISOString(), expiresAt.toISOString());
}

function createTransaction({ txRef, amount, currency, paymentMethod, status, rawResponse }) {
  db.prepare(`
    INSERT OR IGNORE INTO transactions (tx_ref, amount, currency, payment_method, status, raw_response)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(txRef, amount, currency, paymentMethod, status, rawResponse || null);
}

function updateTransaction(txRef, status, flwRef) {
  db.prepare('UPDATE transactions SET status = ?, flw_ref = ? WHERE tx_ref = ?')
    .run(status, flwRef || null, txRef);
}

module.exports = { db, getSubscription, upsertSubscription, activateSubscription, activateByIdentifier, createTransaction, updateTransaction };
