import { getDb } from './database';
import dayjs from 'dayjs';

export interface PurchaseOrder {
  id: number;
  po_no: string;
  supplier_id: number | null;
  supplier_name: string | null;
  status: 'PENDING' | 'RECEIVED' | 'PARTIAL' | 'CANCELLED';
  total_amount: number;
  notes: string | null;
  expected_date: string | null;
  received_at: string | null;
  cashier_id: number | null;
  created_at: string;
  items?: POItem[];
}

export interface POItem {
  id: number;
  po_id: number;
  product_id: number | null;
  product_name: string;
  qty_ordered: number;
  qty_received: number;
  unit_cost: number;
  total_cost: number;
}

let _poCounter = 0;

const nextPoNo = async (): Promise<string> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM purchase_orders');
  _poCounter = (row?.c ?? 0) + 1;
  return `PO-${dayjs().format('YYYYMMDD')}-${String(_poCounter).padStart(4, '0')}`;
};

export const poQueries = {
  create: async (
    items: Omit<POItem, 'id' | 'po_id'>[],
    opts: {
      supplierId?: number;
      supplierName?: string;
      notes?: string;
      expectedDate?: string;
      cashierId?: number;
    },
  ): Promise<number> => {
    const db = await getDb();
    const poNo = await nextPoNo();
    const total = items.reduce((s, i) => s + i.total_cost, 0);
    const r = await db.runAsync(
      `INSERT INTO purchase_orders (po_no, supplier_id, supplier_name, total_amount, notes, expected_date, cashier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [poNo, opts.supplierId ?? null, opts.supplierName ?? null, total,
       opts.notes ?? null, opts.expectedDate ?? null, opts.cashierId ?? null],
    );
    const poId = r.lastInsertRowId;
    for (const item of items) {
      await db.runAsync(
        `INSERT INTO purchase_order_items (po_id, product_id, product_name, qty_ordered, qty_received, unit_cost, total_cost)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [poId, item.product_id, item.product_name, item.qty_ordered, 0, item.unit_cost, item.total_cost],
      );
    }
    return poId;
  },

  getAll: async (limit = 50): Promise<PurchaseOrder[]> => {
    const db = await getDb();
    return db.getAllAsync<PurchaseOrder>(
      'SELECT * FROM purchase_orders ORDER BY created_at DESC LIMIT ?', [limit],
    );
  },

  getById: async (id: number): Promise<PurchaseOrder | null> => {
    const db = await getDb();
    const po = await db.getFirstAsync<PurchaseOrder>('SELECT * FROM purchase_orders WHERE id = ?', [id]);
    if (!po) return null;
    po.items = await db.getAllAsync<POItem>('SELECT * FROM purchase_order_items WHERE po_id = ?', [id]);
    return po;
  },

  receive: async (poId: number, receivedItems: { itemId: number; qtyReceived: number }[], cashierId?: number): Promise<void> => {
    const db = await getDb();
    for (const ri of receivedItems) {
      const item = await db.getFirstAsync<POItem>('SELECT * FROM purchase_order_items WHERE id = ?', [ri.itemId]);
      if (!item) continue;
      const newReceived = (item.qty_received ?? 0) + ri.qtyReceived;
      await db.runAsync('UPDATE purchase_order_items SET qty_received = ? WHERE id = ?', [newReceived, ri.itemId]);
      if (item.product_id) {
        await db.runAsync('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?', [ri.qtyReceived, item.product_id]);
        await db.runAsync(
          'INSERT INTO stock_log (product_id, product_name, change_qty, balance_after, reason, user_id) SELECT ?, ?, ?, stock_qty, ?, ? FROM products WHERE id = ?',
          [item.product_id, item.product_name, ri.qtyReceived, `PO received`, cashierId ?? null, item.product_id],
        );
      }
    }
    // Check if fully received
    const remaining = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM purchase_order_items WHERE po_id = ? AND qty_received < qty_ordered', [poId],
    );
    const status = (remaining?.c ?? 0) === 0 ? 'RECEIVED' : 'PARTIAL';
    await db.runAsync(
      "UPDATE purchase_orders SET status = ?, received_at = datetime('now') WHERE id = ?", [status, poId],
    );
  },

  cancel: async (poId: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync("UPDATE purchase_orders SET status = 'CANCELLED' WHERE id = ?", [poId]);
  },
};
