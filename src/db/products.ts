import { getDb } from './database';

export interface Product {
  id: number;
  name: string;
  category_id: number | null;
  category_name?: string;
  price: number;
  cost: number;
  barcode: string | null;
  stock_qty: number;
  track_stock: number;
  vat_rate: number;
  is_active: number;
  image_uri: string | null;
  low_stock_threshold: number;
  reorder_qty: number;
  expiry_date: string | null;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  sort_order: number;
}

export const productQueries = {
  getAll: async (search = ''): Promise<Product[]> => {
    const db = await getDb();
    const q = `%${search}%`;
    return db.getAllAsync<Product>(`
      SELECT p.*, c.name as category_name
      FROM products p LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = 1 AND (p.name LIKE ? OR p.barcode LIKE ?)
      ORDER BY p.name
    `, [q, q]);
  },

  getById: async (id: number): Promise<Product | null> => {
    const db = await getDb();
    return db.getFirstAsync<Product>('SELECT * FROM products WHERE id = ?', [id]);
  },

  getByBarcode: async (barcode: string): Promise<Product | null> => {
    const db = await getDb();
    return db.getFirstAsync<Product>('SELECT * FROM products WHERE barcode = ? AND is_active = 1', [barcode]);
  },

  create: async (data: Omit<Product, 'id' | 'category_name'>): Promise<number> => {
    const db = await getDb();
    const r = await db.runAsync(
      `INSERT INTO products (name, category_id, price, cost, barcode, stock_qty, track_stock, vat_rate, image_uri)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.category_id, data.price, data.cost, data.barcode,
       data.stock_qty, data.track_stock, data.vat_rate, data.image_uri],
    );
    return r.lastInsertRowId;
  },

  update: async (id: number, data: Partial<Omit<Product, 'id' | 'category_name'>>): Promise<void> => {
    const db = await getDb();
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    await db.runAsync(`UPDATE products SET ${fields} WHERE id = ?`, [...Object.values(data), id]);
  },

  delete: async (id: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
  },

  adjustStock: async (id: number, delta: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?', [delta, id]);
  },

  getCategories: async (): Promise<Category[]> => {
    const db = await getDb();
    return db.getAllAsync<Category>('SELECT * FROM categories ORDER BY sort_order, name');
  },

  createCategory: async (name: string, color: string): Promise<number> => {
    const db = await getDb();
    const r = await db.runAsync('INSERT INTO categories (name, color) VALUES (?, ?)', [name, color]);
    return r.lastInsertRowId;
  },

  updateCategory: async (id: number, name: string, color: string): Promise<void> => {
    const db = await getDb();
    await db.runAsync('UPDATE categories SET name = ?, color = ? WHERE id = ?', [name, color, id]);
  },

  deleteCategory: async (id: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
  },

  getOutOfStock: async (): Promise<Product[]> => {
    const db = await getDb();
    return db.getAllAsync<Product>(
      `SELECT p.*, c.name as category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = 1 AND p.track_stock = 1 AND p.stock_qty <= 0
       ORDER BY p.name`,
    );
  },

  getLowStock: async (): Promise<Product[]> => {
    const db = await getDb();
    return db.getAllAsync<Product>(
      `SELECT p.*, c.name as category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = 1 AND p.track_stock = 1
         AND p.low_stock_threshold > 0
         AND p.stock_qty > 0
         AND p.stock_qty <= p.low_stock_threshold
       ORDER BY p.stock_qty ASC`,
    );
  },

  getExpiring: async (daysAhead = 30): Promise<Product[]> => {
    const db = await getDb();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return db.getAllAsync<Product>(
      `SELECT p.*, c.name as category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = 1 AND p.expiry_date IS NOT NULL AND p.expiry_date <= ?
       ORDER BY p.expiry_date ASC`,
      [cutoffStr],
    );
  },
};
