import { getDb } from './database';

export interface WastageEntry {
  id: number;
  product_id: number | null;
  product_name: string;
  qty: number;
  reason: string;
  cost: number;
  user_id: number | null;
  created_at: string;
}

export const WASTAGE_REASONS = ['Expired', 'Damaged', 'Theft', 'Spillage', 'Quality Reject', 'Other'];

export const wastageQueries = {
  record: async (entry: Omit<WastageEntry, 'id' | 'created_at'>): Promise<void> => {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO wastage_log (product_id, product_name, qty, reason, cost, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [entry.product_id, entry.product_name, entry.qty, entry.reason, entry.cost, entry.user_id],
    );
    if (entry.product_id) {
      const prod = await db.getFirstAsync<{ stock_qty: number; track_stock: number }>(
        'SELECT stock_qty, track_stock FROM products WHERE id = ?', [entry.product_id],
      );
      if (prod?.track_stock) {
        const newQty = Math.max(0, (prod.stock_qty ?? 0) - entry.qty);
        await db.runAsync('UPDATE products SET stock_qty = ? WHERE id = ?', [newQty, entry.product_id]);
        await db.runAsync(
          'INSERT INTO stock_log (product_id, product_name, change_qty, balance_after, reason, user_id) VALUES (?,?,?,?,?,?)',
          [entry.product_id, entry.product_name, -entry.qty, newQty, `Wastage: ${entry.reason}`, entry.user_id],
        );
      }
    }
  },

  getAll: async (limit = 50): Promise<WastageEntry[]> => {
    const db = await getDb();
    return db.getAllAsync<WastageEntry>(
      'SELECT * FROM wastage_log ORDER BY created_at DESC LIMIT ?', [limit],
    );
  },

  getSummary: async (from: string, to: string) => {
    const db = await getDb();
    return db.getFirstAsync<{ total_qty: number; total_cost: number }>(
      `SELECT SUM(qty) as total_qty, SUM(cost) as total_cost FROM wastage_log
       WHERE created_at BETWEEN ? AND ?`,
      [from, to + 'T23:59:59'],
    );
  },
};
