import { getDb } from './database';

export interface CashDrawerEntry {
  id: number;
  type: 'IN' | 'OUT';
  amount: number;
  reason: string;
  balance_after: number;
  cashier_id: number | null;
  cashier_name: string | null;
  created_at: string;
}

export const cashDrawerQueries = {
  getCurrentBalance: async (): Promise<number> => {
    const db = await getDb();
    const row = await db.getFirstAsync<{ balance_after: number }>(
      'SELECT balance_after FROM cash_drawer_log ORDER BY created_at DESC LIMIT 1',
    );
    return row?.balance_after ?? 0;
  },

  add: async (entry: Omit<CashDrawerEntry, 'id' | 'created_at' | 'balance_after'>): Promise<void> => {
    const db = await getDb();
    const current = await cashDrawerQueries.getCurrentBalance();
    const delta = entry.type === 'IN' ? entry.amount : -entry.amount;
    const newBalance = current + delta;
    await db.runAsync(
      'INSERT INTO cash_drawer_log (type, amount, reason, balance_after, cashier_id, cashier_name) VALUES (?, ?, ?, ?, ?, ?)',
      [entry.type, entry.amount, entry.reason, newBalance, entry.cashier_id, entry.cashier_name],
    );
  },

  getAll: async (limit = 50): Promise<CashDrawerEntry[]> => {
    const db = await getDb();
    return db.getAllAsync<CashDrawerEntry>(
      'SELECT * FROM cash_drawer_log ORDER BY created_at DESC LIMIT ?', [limit],
    );
  },
};
