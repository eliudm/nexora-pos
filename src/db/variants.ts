import { getDb } from './database';

export interface ProductVariant {
  id: number;
  product_id: number;
  variant_name: string;
  sku: string | null;
  price_adjustment: number;
  stock_qty: number;
  barcode: string | null;
  is_active: number;
}

export const variantQueries = {
  getByProduct: async (productId: number): Promise<ProductVariant[]> => {
    const db = await getDb();
    return db.getAllAsync<ProductVariant>(
      'SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY variant_name',
      [productId],
    );
  },

  create: async (data: Omit<ProductVariant, 'id'>): Promise<number> => {
    const db = await getDb();
    const r = await db.runAsync(
      'INSERT INTO product_variants (product_id, variant_name, sku, price_adjustment, stock_qty, barcode, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.product_id, data.variant_name, data.sku, data.price_adjustment, data.stock_qty, data.barcode, data.is_active],
    );
    return r.lastInsertRowId;
  },

  update: async (id: number, data: Partial<Omit<ProductVariant, 'id' | 'product_id'>>): Promise<void> => {
    const db = await getDb();
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    await db.runAsync(`UPDATE product_variants SET ${fields} WHERE id = ?`, [...Object.values(data), id]);
  },

  delete: async (id: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync('UPDATE product_variants SET is_active = 0 WHERE id = ?', [id]);
  },
};
