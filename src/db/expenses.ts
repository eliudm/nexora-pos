import { getDb } from './database';

export interface Expense {
  id: number;
  category: string;
  description: string | null;
  amount: number;
  payment_method: string;
  reference: string | null;
  cashier_id: number | null;
  created_at: string;
}

export const EXPENSE_CATEGORIES = [
  'Rent', 'Utilities', 'Salaries', 'Stock Purchase', 'Transport',
  'Maintenance', 'Marketing', 'Office Supplies', 'Other',
];

export const expenseQueries = {
  getAll: async (from?: string, to?: string, limit = 100): Promise<Expense[]> => {
    const db = await getDb();
    let where = '';
    const params: any[] = [];
    if (from && to) {
      where = 'WHERE created_at BETWEEN ? AND ?';
      params.push(from, to + 'T23:59:59');
    }
    return db.getAllAsync<Expense>(
      `SELECT * FROM expenses ${where} ORDER BY created_at DESC LIMIT ?`,
      [...params, limit],
    );
  },

  create: async (data: Omit<Expense, 'id' | 'created_at'>): Promise<number> => {
    const db = await getDb();
    const r = await db.runAsync(
      'INSERT INTO expenses (category, description, amount, payment_method, reference, cashier_id) VALUES (?, ?, ?, ?, ?, ?)',
      [data.category, data.description, data.amount, data.payment_method, data.reference, data.cashier_id],
    );
    return r.lastInsertRowId;
  },

  delete: async (id: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
  },

  getSummary: async (from: string, to: string) => {
    const db = await getDb();
    return db.getAllAsync<{ category: string; total: number }>(
      `SELECT category, SUM(amount) as total FROM expenses
       WHERE created_at BETWEEN ? AND ? GROUP BY category ORDER BY total DESC`,
      [from, to + 'T23:59:59'],
    );
  },
};
