import { getDb } from './database';

export interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export const supplierQueries = {
  getAll: async (search = ''): Promise<Supplier[]> => {
    const db = await getDb();
    const q = `%${search}%`;
    return db.getAllAsync<Supplier>(
      'SELECT * FROM suppliers WHERE name LIKE ? OR phone LIKE ? ORDER BY name',
      [q, q],
    );
  },

  getById: async (id: number): Promise<Supplier | null> => {
    const db = await getDb();
    return db.getFirstAsync<Supplier>('SELECT * FROM suppliers WHERE id = ?', [id]);
  },

  create: async (data: Omit<Supplier, 'id' | 'created_at'>): Promise<number> => {
    const db = await getDb();
    const r = await db.runAsync(
      'INSERT INTO suppliers (name, phone, email, address, notes) VALUES (?, ?, ?, ?, ?)',
      [data.name, data.phone, data.email, data.address, data.notes],
    );
    return r.lastInsertRowId;
  },

  update: async (id: number, data: Partial<Omit<Supplier, 'id' | 'created_at'>>): Promise<void> => {
    const db = await getDb();
    const fields = Object.keys(data).map((k) => `${k} = ?`).join(', ');
    await db.runAsync(`UPDATE suppliers SET ${fields} WHERE id = ?`, [...Object.values(data), id]);
  },

  delete: async (id: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync('DELETE FROM suppliers WHERE id = ?', [id]);
  },
};
