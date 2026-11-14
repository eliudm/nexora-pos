import { getDb } from './database';

export interface Shift {
  id: number;
  cashier_id: number | null;
  cashier_name: string | null;
  opening_cash: number;
  closing_cash: number | null;
  total_sales: number;
  total_revenue: number;
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
  closed_at: string | null;
}

export const shiftQueries = {
  getOpen: async (): Promise<Shift | null> => {
    const db = await getDb();
    return db.getFirstAsync<Shift>("SELECT * FROM shifts WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1");
  },

  open: async (cashierId: number, cashierName: string, openingCash: number): Promise<number> => {
    const db = await getDb();
    const r = await db.runAsync(
      'INSERT INTO shifts (cashier_id, cashier_name, opening_cash) VALUES (?, ?, ?)',
      [cashierId, cashierName, openingCash],
    );
    return r.lastInsertRowId;
  },

  close: async (shiftId: number, closingCash: number, totalSales: number, totalRevenue: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync(
      `UPDATE shifts SET status='CLOSED', closing_cash=?, total_sales=?, total_revenue=?, closed_at=datetime('now') WHERE id=?`,
      [closingCash, totalSales, totalRevenue, shiftId],
    );
  },

  getAll: async (limit = 30): Promise<Shift[]> => {
    const db = await getDb();
    return db.getAllAsync<Shift>('SELECT * FROM shifts ORDER BY id DESC LIMIT ?', [limit]);
  },
};
