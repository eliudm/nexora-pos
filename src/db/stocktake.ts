import { getDb } from './database';

export interface StocktakeSession {
  id: number;
  status: 'OPEN' | 'COMPLETED';
  notes: string | null;
  user_id: number | null;
  started_at: string;
  completed_at: string | null;
  items?: StocktakeItem[];
}

export interface StocktakeItem {
  id: number;
  session_id: number;
  product_id: number | null;
  product_name: string;
  expected_qty: number;
  counted_qty: number | null;
  variance: number | null;
}

export const stocktakeQueries = {
  startSession: async (userId?: number, notes?: string): Promise<number> => {
    const db = await getDb();
    // Load all tracked products into the session
    const r = await db.runAsync(
      'INSERT INTO stocktake_sessions (user_id, notes) VALUES (?, ?)',
      [userId ?? null, notes ?? null],
    );
    const sessionId = r.lastInsertRowId;
    const products = await db.getAllAsync<{ id: number; name: string; stock_qty: number }>(
      'SELECT id, name, stock_qty FROM products WHERE track_stock = 1 AND is_active = 1',
    );
    for (const p of products) {
      await db.runAsync(
        'INSERT INTO stocktake_items (session_id, product_id, product_name, expected_qty) VALUES (?, ?, ?, ?)',
        [sessionId, p.id, p.name, p.stock_qty],
      );
    }
    return sessionId;
  },

  getOpenSession: async (): Promise<StocktakeSession | null> => {
    const db = await getDb();
    const session = await db.getFirstAsync<StocktakeSession>(
      "SELECT * FROM stocktake_sessions WHERE status = 'OPEN' ORDER BY started_at DESC LIMIT 1",
    );
    if (!session) return null;
    session.items = await db.getAllAsync<StocktakeItem>(
      'SELECT * FROM stocktake_items WHERE session_id = ? ORDER BY product_name', [session.id],
    );
    return session;
  },

  updateCount: async (itemId: number, countedQty: number): Promise<void> => {
    const db = await getDb();
    const item = await db.getFirstAsync<StocktakeItem>(
      'SELECT * FROM stocktake_items WHERE id = ?', [itemId],
    );
    if (!item) return;
    const variance = countedQty - (item.expected_qty ?? 0);
    await db.runAsync(
      'UPDATE stocktake_items SET counted_qty = ?, variance = ? WHERE id = ?',
      [countedQty, variance, itemId],
    );
  },

  complete: async (sessionId: number, applyAdjustments: boolean, userId?: number): Promise<void> => {
    const db = await getDb();
    if (applyAdjustments) {
      const items = await db.getAllAsync<StocktakeItem>(
        'SELECT * FROM stocktake_items WHERE session_id = ? AND counted_qty IS NOT NULL', [sessionId],
      );
      for (const item of items) {
        if (item.product_id && item.counted_qty !== null) {
          await db.runAsync('UPDATE products SET stock_qty = ? WHERE id = ?', [item.counted_qty, item.product_id]);
          if (item.variance !== 0) {
            await db.runAsync(
              'INSERT INTO stock_log (product_id, product_name, change_qty, balance_after, reason, user_id) VALUES (?,?,?,?,?,?)',
              [item.product_id, item.product_name, item.variance ?? 0, item.counted_qty,
               `Stocktake adjustment`, userId ?? null],
            );
          }
        }
      }
    }
    await db.runAsync(
      "UPDATE stocktake_sessions SET status = 'COMPLETED', completed_at = datetime('now') WHERE id = ?",
      [sessionId],
    );
  },
};
