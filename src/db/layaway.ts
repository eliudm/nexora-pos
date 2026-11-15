import { getDb } from './database';

export interface Layaway {
  id: number;
  layaway_no: string;
  customer_id: number | null;
  customer_name: string | null;
  description: string | null;
  total_amount: number;
  deposit_paid: number;
  balance_due: number;
  status: 'OPEN' | 'RESERVED' | 'COMPLETED' | 'CANCELLED';
  cashier_id: number | null;
  cashier_name: string | null;
  created_at: string;
}

export interface LayawayPayment {
  id: number;
  layaway_id: number;
  amount: number;
  payment_method: string;
  mpesa_ref: string | null;
  cashier_id: number | null;
  cashier_name: string | null;
  created_at: string;
}

export const layawayQueries = {
  create: async (data: {
    customerId?: number | null;
    customerName: string;           // required
    description?: string | null;
    totalAmount: number;
    depositAmount: number;
    paymentMethod?: string;
    mpesaRef?: string;
    cashierId?: number | null;
    cashierName?: string | null;
    collectLater?: boolean;         // pay in full now, collect later → RESERVED
  }): Promise<number> => {
    const db = await getDb();
    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const existing = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM layaways WHERE date(created_at) = date('now')",
    );
    const seq = String((existing?.c ?? 0) + 1).padStart(4, '0');
    const layawayNo = `LAY-${dateStr}-${seq}`;

    // RESERVED = paid in full upfront, waiting for collection
    const depositAmount = data.collectLater ? data.totalAmount : data.depositAmount;
    const balanceDue = data.totalAmount - depositAmount;
    const status = data.collectLater ? 'RESERVED' : 'OPEN';

    const r = await db.runAsync(
      `INSERT INTO layaways (layaway_no, customer_id, customer_name, description, total_amount, deposit_paid, balance_due, status, cashier_id, cashier_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [layawayNo, data.customerId ?? null, data.customerName, data.description ?? null,
       data.totalAmount, depositAmount, balanceDue, status,
       data.cashierId ?? null, data.cashierName ?? null],
    );
    const layawayId = r.lastInsertRowId;

    if (depositAmount > 0) {
      await db.runAsync(
        `INSERT INTO layaway_payments (layaway_id, amount, payment_method, mpesa_ref, cashier_id, cashier_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [layawayId, depositAmount, data.paymentMethod ?? 'CASH', data.mpesaRef ?? null,
         data.cashierId ?? null, data.cashierName ?? null],
      );
    }
    return layawayId;
  },

  addPayment: async (layawayId: number, data: {
    amount: number;
    paymentMethod?: string;
    mpesaRef?: string;
    cashierId?: number | null;
    cashierName?: string | null;
  }): Promise<void> => {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO layaway_payments (layaway_id, amount, payment_method, mpesa_ref, cashier_id, cashier_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [layawayId, data.amount, data.paymentMethod ?? 'CASH', data.mpesaRef ?? null,
       data.cashierId ?? null, data.cashierName ?? null],
    );
    await db.runAsync(
      `UPDATE layaways
       SET deposit_paid = deposit_paid + ?,
           balance_due  = balance_due  - ?,
           status = CASE WHEN balance_due - ? <= 0 THEN 'COMPLETED' ELSE 'OPEN' END
       WHERE id = ?`,
      [data.amount, data.amount, data.amount, layawayId],
    );
  },

  getAll: async (limit = 50): Promise<Layaway[]> => {
    const db = await getDb();
    return db.getAllAsync<Layaway>(
      'SELECT * FROM layaways ORDER BY created_at DESC LIMIT ?', [limit],
    );
  },

  getById: async (id: number): Promise<Layaway | null> => {
    const db = await getDb();
    return db.getFirstAsync<Layaway>('SELECT * FROM layaways WHERE id = ?', [id]);
  },

  getPayments: async (layawayId: number): Promise<LayawayPayment[]> => {
    const db = await getDb();
    return db.getAllAsync<LayawayPayment>(
      'SELECT * FROM layaway_payments WHERE layaway_id = ? ORDER BY created_at',
      [layawayId],
    );
  },

  cancel: async (id: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync("UPDATE layaways SET status = 'CANCELLED' WHERE id = ?", [id]);
  },

  // Used for RESERVED items when customer comes to collect, and for COMPLETED layaways.
  postAsSale: async (layawayId: number, cashierId?: number | null): Promise<{
    invoiceNo: string;
    paymentMethod: string;
    mpesaRef: string | null;
    total: number;
    customerName: string | null;
    description: string | null;
  }> => {
    const db = await getDb();
    const layaway = await db.getFirstAsync<Layaway>('SELECT * FROM layaways WHERE id = ?', [layawayId]);
    if (!layaway) throw new Error('Layaway not found');

    const lastPay = await db.getFirstAsync<{ payment_method: string; mpesa_ref: string | null }>(
      'SELECT payment_method, mpesa_ref FROM layaway_payments WHERE layaway_id = ? ORDER BY created_at DESC LIMIT 1',
      [layawayId],
    );
    const payMethod = lastPay?.payment_method ?? 'CASH';
    const mpesaRef = payMethod === 'MPESA' ? (lastPay?.mpesa_ref ?? null) : null;

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const existing = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM sales WHERE date(created_at) = date('now')",
    );
    const seq = String((existing?.c ?? 0) + 1).padStart(4, '0');
    const invoiceNo = `INV-${dateStr}-${seq}`;

    const result = await db.runAsync(
      `INSERT INTO sales (invoice_no, customer_id, cashier_id, subtotal, tax_amount, discount, total, payment_method, mpesa_ref, status, note)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, 'PAID', ?)`,
      [invoiceNo, layaway.customer_id, cashierId ?? null,
       layaway.total_amount, layaway.total_amount,
       payMethod, mpesaRef,
       `Layaway: ${layaway.layaway_no}`],
    );
    const saleId = result.lastInsertRowId;

    await db.runAsync(
      `INSERT INTO sale_items (sale_id, product_id, product_name, qty, unit_price, cost_price, discount, vat_rate, vat_amount, total)
       VALUES (?, NULL, ?, 1, ?, 0, 0, 0, 0, ?)`,
      [saleId, layaway.description ?? 'Layaway Item', layaway.total_amount, layaway.total_amount],
    );

    await db.runAsync("UPDATE layaways SET status = 'COMPLETED' WHERE id = ?", [layawayId]);

    return { invoiceNo, paymentMethod: payMethod, mpesaRef, total: layaway.total_amount, customerName: layaway.customer_name, description: layaway.description };
  },
};
