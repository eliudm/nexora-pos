import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

export const getDb = async (): Promise<SQLite.SQLiteDatabase> => {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('nexora_pos.db');
  await migrate(_db);
  return _db;
};

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`PRAGMA journal_mode = WAL;`);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#1db8a0',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      price REAL NOT NULL DEFAULT 0,
      cost REAL DEFAULT 0,
      barcode TEXT,
      stock_qty REAL DEFAULT 0,
      track_stock INTEGER DEFAULT 0,
      vat_rate REAL DEFAULT 16,
      is_active INTEGER DEFAULT 1,
      image_uri TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      credit_balance REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'CASHIER',
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL UNIQUE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      cashier_id INTEGER REFERENCES users(id),
      subtotal REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'CASH',
      mpesa_ref TEXT,
      status TEXT NOT NULL DEFAULT 'PAID',
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      qty REAL NOT NULL,
      unit_price REAL NOT NULL,
      discount REAL DEFAULT 0,
      vat_rate REAL DEFAULT 16,
      vat_amount REAL DEFAULT 0,
      total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS etims_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      status TEXT NOT NULL DEFAULT 'PENDING',
      receipt_no TEXT,
      qr_code TEXT,
      error_msg TEXT,
      submitted_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cashier_id INTEGER REFERENCES users(id),
      cashier_name TEXT,
      opening_cash REAL DEFAULT 0,
      closing_cash REAL,
      total_sales INTEGER DEFAULT 0,
      total_revenue REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'OPEN',
      opened_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
      product_name TEXT NOT NULL,
      change_qty REAL NOT NULL,
      balance_after REAL NOT NULL,
      reason TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      user_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed default admin if none exists
  const userCount = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM users');
  if ((userCount?.c ?? 0) === 0) {
    // Default PIN: 1234 (SHA-256 not available natively, store as plain for initial seed — user changes on setup)
    await db.runAsync(
      `INSERT INTO users (name, pin_hash, role) VALUES (?, ?, ?)`,
      ['Admin', '1234', 'ADMIN'],
    );
  }
}
