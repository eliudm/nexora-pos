import { getDb } from './database';

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  credit_balance: number;
  credit_limit: number;
  loyalty_points: number;
  created_at: string;
}

export const customerQueries = {
  getAll: async (search = ''): Promise<Customer[]> => {
    const db = await getDb();
    const q = `%${search}%`;
    return db.getAllAsync<Customer>(
      'SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name',
      [q, q],
    );
  },

  getById: async (id: number): Promise<Customer | null> => {
    const db = await getDb();
    return db.getFirstAsync<Customer>('SELECT * FROM customers WHERE id = ?', [id]);
  },

  create: async (data: Omit<Customer, 'id' | 'created_at' | 'loyalty_points' | 'credit_limit'> & { loyalty_points?: number; credit_limit?: number }): Promise<number> => {
    const db = await getDb();
    const r = await db.runAsync(
      'INSERT INTO customers (name, phone, email, credit_balance) VALUES (?, ?, ?, ?)',
      [data.name, data.phone, data.email, data.credit_balance],
    );
    return r.lastInsertRowId;
  },

  update: async (id: number, data: Partial<Omit<Customer, 'id' | 'created_at'>>): Promise<void> => {
    const db = await getDb();
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    await db.runAsync(`UPDATE customers SET ${fields} WHERE id = ?`, [...Object.values(data), id]);
  },

  delete: async (id: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync('DELETE FROM customers WHERE id = ?', [id]);
  },

  adjustCredit: async (id: number, delta: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync('UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?', [delta, id]);
  },
};
