import { getDb } from './database';

export interface StockLogEntry {
  id: number;
  product_id: number;
  product_name: string;
  change_qty: number;
  balance_after: number;
  reason: string;
  user_id: number | null;
  user_name: string | null;
  created_at: string;
}

export const stockLogQueries = {
  add: async (entry: Omit<StockLogEntry, 'id' | 'created_at'>): Promise<void> => {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO stock_log (product_id, product_name, change_qty, balance_after, reason, user_id, user_name) VALUES (?,?,?,?,?,?,?)',
      [entry.product_id, entry.product_name, entry.change_qty, entry.balance_after, entry.reason, entry.user_id, entry.user_name],
    );
  },

  getForProduct: async (productId: number, limit = 50): Promise<StockLogEntry[]> => {
    const db = await getDb();
    return db.getAllAsync<StockLogEntry>(
      'SELECT * FROM stock_log WHERE product_id = ? ORDER BY id DESC LIMIT ?',
      [productId, limit],
    );
  },

  getAll: async (limit = 100): Promise<StockLogEntry[]> => {
    const db = await getDb();
    return db.getAllAsync<StockLogEntry>('SELECT * FROM stock_log ORDER BY id DESC LIMIT ?', [limit]);
  },
};
