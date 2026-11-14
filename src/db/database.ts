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
      low_stock_threshold REAL DEFAULT 0,
      reorder_qty REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      credit_balance REAL DEFAULT 0,
      loyalty_points INTEGER DEFAULT 0,
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
      split_cash REAL DEFAULT 0,
      split_mpesa REAL DEFAULT 0,
      mpesa_ref TEXT,
      loyalty_points_earned INTEGER DEFAULT 0,
      loyalty_points_redeemed INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_no TEXT NOT NULL UNIQUE,
      supplier_id INTEGER REFERENCES suppliers(id),
      supplier_name TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      total_amount REAL DEFAULT 0,
      notes TEXT,
      expected_date TEXT,
      received_at TEXT,
      cashier_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      qty_ordered REAL NOT NULL,
      qty_received REAL DEFAULT 0,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hold_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT,
      cart_json TEXT NOT NULL,
      customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT,
      cashier_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'CASH',
      reference TEXT,
      cashier_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cash_drawer_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      balance_after REAL DEFAULT 0,
      cashier_id INTEGER REFERENCES users(id),
      cashier_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      sale_id INTEGER REFERENCES sales(id),
      points_change INTEGER NOT NULL,
      type TEXT NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wastage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      qty REAL NOT NULL,
      reason TEXT NOT NULL,
      cost REAL DEFAULT 0,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stocktake_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS stocktake_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES stocktake_sessions(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      expected_qty REAL DEFAULT 0,
      counted_qty REAL,
      variance REAL
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_no TEXT NOT NULL UNIQUE,
      customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      valid_until TEXT,
      note TEXT,
      cashier_id INTEGER REFERENCES users(id),
      converted_sale_id INTEGER REFERENCES sales(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      qty REAL NOT NULL,
      unit_price REAL NOT NULL,
      discount REAL DEFAULT 0,
      vat_rate REAL DEFAULT 16,
      vat_amount REAL DEFAULT 0,
      total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_name TEXT NOT NULL,
      sku TEXT,
      price_adjustment REAL DEFAULT 0,
      stock_qty REAL DEFAULT 0,
      barcode TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS layaways (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layaway_no TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      customer_name TEXT,
      description TEXT,
      total_amount REAL NOT NULL,
      deposit_paid REAL DEFAULT 0,
      balance_due REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      cashier_id INTEGER,
      cashier_name TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS layaway_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layaway_id INTEGER NOT NULL REFERENCES layaways(id),
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'CASH',
      mpesa_ref TEXT,
      cashier_id INTEGER,
      cashier_name TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // Safe ALTER TABLE for columns that may not exist on older DB instances
  const safeAlter = async (sql: string) => {
    try { await db.execAsync(sql); } catch {}
  };
  await safeAlter('ALTER TABLE sales ADD COLUMN split_cash REAL DEFAULT 0');
  await safeAlter('ALTER TABLE sales ADD COLUMN split_mpesa REAL DEFAULT 0');
  await safeAlter('ALTER TABLE sales ADD COLUMN loyalty_points_earned INTEGER DEFAULT 0');
  await safeAlter('ALTER TABLE sales ADD COLUMN loyalty_points_redeemed INTEGER DEFAULT 0');
  await safeAlter('ALTER TABLE customers ADD COLUMN loyalty_points INTEGER DEFAULT 0');
  await safeAlter('ALTER TABLE products ADD COLUMN low_stock_threshold REAL DEFAULT 0');
  await safeAlter('ALTER TABLE products ADD COLUMN reorder_qty REAL DEFAULT 0');

  // Seed default admin if none exists
  const userCount = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM users');
  if ((userCount?.c ?? 0) === 0) {
    await db.runAsync(
      `INSERT INTO users (name, pin_hash, role) VALUES (?, ?, ?)`,
      ['Admin', '1234', 'ADMIN'],
    );
  }
}
