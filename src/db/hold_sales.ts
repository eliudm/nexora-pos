import { getDb } from './database';
import { CartItem } from './sales';

export interface HoldSale {
  id: number;
  label: string | null;
  cart_json: string;
  customer_id: number | null;
  customer_name: string | null;
  cashier_id: number | null;
  created_at: string;
  items?: CartItem[];
}

export const holdSalesQueries = {
  save: async (
    items: CartItem[],
    opts: { label?: string; customerId?: number; customerName?: string; cashierId?: number },
  ): Promise<number> => {
    const db = await getDb();
    const r = await db.runAsync(
      'INSERT INTO hold_sales (label, cart_json, customer_id, customer_name, cashier_id) VALUES (?, ?, ?, ?, ?)',
      [opts.label ?? null, JSON.stringify(items),
       opts.customerId ?? null, opts.customerName ?? null, opts.cashierId ?? null],
    );
    return r.lastInsertRowId;
  },

  getAll: async (): Promise<HoldSale[]> => {
    const db = await getDb();
    const rows = await db.getAllAsync<HoldSale>(
      'SELECT * FROM hold_sales ORDER BY created_at DESC',
    );
    return rows.map((r) => ({ ...r, items: JSON.parse(r.cart_json) as CartItem[] }));
  },

  delete: async (id: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync('DELETE FROM hold_sales WHERE id = ?', [id]);
  },
};
