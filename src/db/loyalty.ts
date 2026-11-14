import { getDb } from './database';

export interface LoyaltyTransaction {
  id: number;
  customer_id: number;
  sale_id: number | null;
  points_change: number;
  type: 'EARN' | 'REDEEM' | 'ADJUST';
  note: string | null;
  created_at: string;
}

// Default: 1 point per KES 100 spent; 100 points = KES 10 discount
export const POINTS_PER_KES = 1 / 100; // 1 point per 100 KES
export const KES_PER_POINT = 0.1;       // 1 point = 0.10 KES

export const loyaltyQueries = {
  getBalance: async (customerId: number): Promise<number> => {
    const db = await getDb();
    const row = await db.getFirstAsync<{ loyalty_points: number }>(
      'SELECT loyalty_points FROM customers WHERE id = ?', [customerId],
    );
    return row?.loyalty_points ?? 0;
  },

  earn: async (customerId: number, saleId: number, saleTotal: number): Promise<number> => {
    const db = await getDb();
    const points = Math.floor(saleTotal * POINTS_PER_KES);
    if (points <= 0) return 0;
    await db.runAsync('UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?', [points, customerId]);
    await db.runAsync(
      'INSERT INTO loyalty_transactions (customer_id, sale_id, points_change, type, note) VALUES (?, ?, ?, ?, ?)',
      [customerId, saleId, points, 'EARN', `Sale ${saleId}`],
    );
    return points;
  },

  redeem: async (customerId: number, points: number, saleId?: number): Promise<number> => {
    const db = await getDb();
    const balance = await loyaltyQueries.getBalance(customerId);
    const toRedeem = Math.min(points, balance);
    if (toRedeem <= 0) return 0;
    await db.runAsync('UPDATE customers SET loyalty_points = loyalty_points - ? WHERE id = ?', [toRedeem, customerId]);
    await db.runAsync(
      'INSERT INTO loyalty_transactions (customer_id, sale_id, points_change, type, note) VALUES (?, ?, ?, ?, ?)',
      [customerId, saleId ?? null, -toRedeem, 'REDEEM', `Redeemed for discount`],
    );
    return toRedeem * KES_PER_POINT;
  },

  adjust: async (customerId: number, points: number, note: string): Promise<void> => {
    const db = await getDb();
    await db.runAsync('UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?', [points, customerId]);
    await db.runAsync(
      'INSERT INTO loyalty_transactions (customer_id, points_change, type, note) VALUES (?, ?, ?, ?)',
      [customerId, points, 'ADJUST', note],
    );
  },

  getHistory: async (customerId: number, limit = 20): Promise<LoyaltyTransaction[]> => {
    const db = await getDb();
    return db.getAllAsync<LoyaltyTransaction>(
      'SELECT * FROM loyalty_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?',
      [customerId, limit],
    );
  },
};
