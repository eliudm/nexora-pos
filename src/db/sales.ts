import { getDb } from './database';
import dayjs from 'dayjs';

export interface CartItem {
  product_id: number;
  product_name: string;
  qty: number;
  unit_price: number;
  cost_price: number;
  discount: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  track_stock?: number;
  stock_qty?: number;
  original_price?: number;
}

export interface SplitPayment {
  cash: number;
  mpesa: number;
  mpesaRef?: string;
}

export interface Sale {
  id: number;
  invoice_no: string;
  customer_id: number | null;
  customer_name?: string;
  cashier_id: number | null;
  cashier_name?: string;
  subtotal: number;
  tax_amount: number;
  discount: number;
  total: number;
  payment_method: string;
  split_cash: number;
  split_mpesa: number;
  mpesa_ref: string | null;
  loyalty_points_earned: number;
  loyalty_points_redeemed: number;
  status: string;
  note: string | null;
  created_at: string;
  items?: CartItem[];
  sale_cogs?: number;
}

let _invoiceCounter = 0;

const nextInvoiceNo = async (): Promise<string> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM sales');
  _invoiceCounter = (row?.c ?? 0) + 1;
  return `INV-${dayjs().format('YYYYMMDD')}-${String(_invoiceCounter).padStart(4, '0')}`;
};

export const salesQueries = {
  create: async (
    items: CartItem[],
    opts: {
      customerId?: number;
      cashierId?: number;
      discount?: number;
      loyaltyDiscount?: number;
      paymentMethod: string;
      splitPayment?: SplitPayment;
      mpesaRef?: string;
      note?: string;
      loyaltyPointsRedeemed?: number;
    },
  ): Promise<number> => {
    const db = await getDb();
    // subtotal = sum of item totals (VAT-inclusive), after item-level discounts
    const subtotal = items.reduce((s, i) => s + i.unit_price * i.qty - i.discount, 0);
    // taxAmount is extracted VAT for KRA reporting only — it is already within subtotal
    const taxAmount = items.reduce((s, i) => s + i.vat_amount, 0);
    const discount = (opts.discount ?? 0) + (opts.loyaltyDiscount ?? 0);
    const total = subtotal - discount;
    const invoiceNo = await nextInvoiceNo();

    const splitCash = opts.splitPayment?.cash ?? 0;
    const splitMpesa = opts.splitPayment?.mpesa ?? 0;
    const mpesaRef = opts.splitPayment?.mpesaRef ?? opts.mpesaRef ?? null;

    const result = await db.runAsync(
      `INSERT INTO sales (invoice_no, customer_id, cashier_id, subtotal, tax_amount, discount, total, payment_method, split_cash, split_mpesa, mpesa_ref, loyalty_points_redeemed, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNo, opts.customerId ?? null, opts.cashierId ?? null,
       subtotal, taxAmount, discount, total,
       opts.paymentMethod, splitCash, splitMpesa, mpesaRef,
       opts.loyaltyPointsRedeemed ?? 0, opts.note ?? null],
    );

    const saleId = result.lastInsertRowId;

    for (const item of items) {
      await db.runAsync(
        `INSERT INTO sale_items (sale_id, product_id, product_name, qty, unit_price, cost_price, discount, vat_rate, vat_amount, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleId, item.product_id, item.product_name, item.qty,
         item.unit_price, item.cost_price ?? 0, item.discount, item.vat_rate, item.vat_amount, item.total],
      );
      // Deduct stock and log
      const prod = await db.getFirstAsync<{ stock_qty: number; name: string; track_stock: number }>(
        'SELECT stock_qty, name, track_stock FROM products WHERE id = ?', [item.product_id],
      );
      if (prod?.track_stock) {
        const newQty = (prod.stock_qty ?? 0) - item.qty;
        await db.runAsync('UPDATE products SET stock_qty = ? WHERE id = ?', [newQty, item.product_id]);
        await db.runAsync(
          'INSERT INTO stock_log (product_id, product_name, change_qty, balance_after, reason, user_id) VALUES (?,?,?,?,?,?)',
          [item.product_id, item.product_name, -item.qty, newQty, `Sale ${invoiceNo}`, opts.cashierId ?? null],
        );
      }
    }

    // Deduct from customer credit balance if payment method is CREDIT
    if (opts.paymentMethod === 'CREDIT' && opts.customerId) {
      await db.runAsync(
        'UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?',
        [total, opts.customerId],
      );
    }

    // Earn loyalty points for customer
    if (opts.customerId) {
      const points = Math.floor(total * (1 / 100));
      if (points > 0) {
        await db.runAsync('UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?', [points, opts.customerId]);
        await db.runAsync(
          'INSERT INTO loyalty_transactions (customer_id, sale_id, points_change, type, note) VALUES (?, ?, ?, ?, ?)',
          [opts.customerId, saleId, points, 'EARN', `Sale ${invoiceNo}`],
        );
        await db.runAsync('UPDATE sales SET loyalty_points_earned = ? WHERE id = ?', [points, saleId]);
      }
    }

    return saleId;
  },

  getAll: async (from?: string, to?: string, limit = 100): Promise<Sale[]> => {
    const db = await getDb();
    let where = '';
    const params: any[] = [];
    if (from && to) {
      where = 'WHERE s.created_at BETWEEN ? AND ?';
      params.push(from, to + 'T23:59:59');
    }
    return db.getAllAsync<Sale>(`
      SELECT s.*, c.name as customer_name, u.name as cashier_name,
        COALESCE((
          SELECT SUM((si.cost_price / (1.0 + si.vat_rate / 100.0)) * si.qty)
          FROM sale_items si WHERE si.sale_id = s.id AND si.cost_price > 0
        ), 0) as sale_cogs
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.cashier_id = u.id
      ${where}
      ORDER BY s.created_at DESC LIMIT ?
    `, [...params, limit]);
  },

  getByInvoiceNo: async (invoiceNo: string): Promise<Sale | null> => {
    const db = await getDb();
    const sale = await db.getFirstAsync<Sale>(`
      SELECT s.*, c.name as customer_name, u.name as cashier_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE s.invoice_no = ?
    `, [invoiceNo]);
    if (!sale) return null;
    sale.items = await db.getAllAsync<CartItem>(
      'SELECT * FROM sale_items WHERE sale_id = ?', [sale.id],
    );
    return sale;
  },

  getById: async (id: number): Promise<Sale | null> => {
    const db = await getDb();
    const sale = await db.getFirstAsync<Sale>(`
      SELECT s.*, c.name as customer_name, u.name as cashier_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE s.id = ?
    `, [id]);
    if (!sale) return null;
    sale.items = await db.getAllAsync<CartItem>(
      'SELECT * FROM sale_items WHERE sale_id = ?', [id],
    );
    return sale;
  },

  getDailySummary: async (date: string) => {
    const db = await getDb();
    return db.getFirstAsync<{
      total_sales: number; total_revenue: number;
      cash_total: number; mpesa_total: number; credit_total: number;
    }>(`
      SELECT
        COUNT(*) as total_sales,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN payment_method='CASH' THEN total ELSE 0 END), 0) as cash_total,
        COALESCE(SUM(CASE WHEN payment_method='MPESA' THEN total ELSE 0 END), 0) as mpesa_total,
        COALESCE(SUM(CASE WHEN payment_method='CREDIT' THEN total ELSE 0 END), 0) as credit_total
      FROM sales WHERE date(created_at) = ? AND status = 'PAID'
    `, [date]);
  },

  getTopProducts: async (from: string, to: string, limit = 5) => {
    const db = await getDb();
    return db.getAllAsync<{ product_name: string; total_qty: number; total_revenue: number }>(`
      SELECT si.product_name, SUM(si.qty) as total_qty, SUM(si.total) as total_revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE date(s.created_at) BETWEEN ? AND ? AND s.status = 'PAID'
      GROUP BY si.product_name
      ORDER BY total_revenue DESC LIMIT ?
    `, [from, to, limit]);
  },

  reverseSale: async (saleId: number, reason: string, userId: number | null): Promise<string> => {
    const db = await getDb();
    const sale = await db.getFirstAsync<{
      status: string; invoice_no: string; customer_id: number | null;
      subtotal: number; tax_amount: number; discount: number; total: number; payment_method: string;
    }>('SELECT status, invoice_no, customer_id, subtotal, tax_amount, discount, total, payment_method FROM sales WHERE id = ?', [saleId]);

    if (!sale) throw new Error('Sale not found');
    if (sale.status !== 'PAID') throw new Error('Only PAID sales can be reversed');

    const items = await db.getAllAsync<CartItem>(
      'SELECT * FROM sale_items WHERE sale_id = ?', [saleId],
    );

    const reversalInvoiceNo = `REV-${sale.invoice_no}`;
    const reversalNote = `Reversal of ${sale.invoice_no}${reason ? ': ' + reason : ''}`;

    // Create reversal sale with negative amounts
    const result = await db.runAsync(
      `INSERT INTO sales (invoice_no, customer_id, cashier_id, subtotal, tax_amount, discount, total, payment_method, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REVERSAL', ?)`,
      [reversalInvoiceNo, sale.customer_id, userId,
       -sale.subtotal, -sale.tax_amount, -sale.discount, -sale.total,
       sale.payment_method, reversalNote],
    );
    const reversalSaleId = result.lastInsertRowId;

    // Insert negative sale items and restore stock
    for (const item of items) {
      await db.runAsync(
        `INSERT INTO sale_items (sale_id, product_id, product_name, qty, unit_price, cost_price, discount, vat_rate, vat_amount, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [reversalSaleId, item.product_id, item.product_name,
         -item.qty, item.unit_price, item.cost_price,
         -item.discount, item.vat_rate, -item.vat_amount, -item.total],
      );
      const prod = await db.getFirstAsync<{ stock_qty: number; track_stock: number }>(
        'SELECT stock_qty, track_stock FROM products WHERE id = ?', [item.product_id],
      );
      if (prod?.track_stock) {
        const newQty = (prod.stock_qty ?? 0) + item.qty;
        await db.runAsync('UPDATE products SET stock_qty = ? WHERE id = ?', [newQty, item.product_id]);
        await db.runAsync(
          'INSERT INTO stock_log (product_id, product_name, change_qty, balance_after, reason, user_id) VALUES (?,?,?,?,?,?)',
          [item.product_id, item.product_name, item.qty, newQty, `Reversal of ${sale.invoice_no}`, userId],
        );
      }
    }

    // Restore credit balance if applicable
    if (sale.payment_method === 'CREDIT' && sale.customer_id) {
      await db.runAsync(
        'UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?',
        [sale.total, sale.customer_id],
      );
    }

    // Mark original as REVERSED
    await db.runAsync(
      "UPDATE sales SET status = 'REVERSED' WHERE id = ?", [saleId],
    );

    return reversalInvoiceNo;
  },

  voidSale: async (saleId: number, userId: number | null): Promise<void> => {
    const db = await getDb();
    const sale = await db.getFirstAsync<{ status: string; customer_id: number | null; total: number; payment_method: string }>(
      'SELECT status, customer_id, total, payment_method FROM sales WHERE id = ?', [saleId],
    );
    if (!sale || sale.status === 'VOIDED') return;

    // Restore stock
    const items = await db.getAllAsync<CartItem & { product_id: number }>(
      'SELECT * FROM sale_items WHERE sale_id = ?', [saleId],
    );
    for (const item of items) {
      const prod = await db.getFirstAsync<{ stock_qty: number; track_stock: number }>(
        'SELECT stock_qty, track_stock FROM products WHERE id = ?', [item.product_id],
      );
      if (prod?.track_stock) {
        const newQty = (prod.stock_qty ?? 0) + item.qty;
        await db.runAsync('UPDATE products SET stock_qty = ? WHERE id = ?', [newQty, item.product_id]);
        await db.runAsync(
          'INSERT INTO stock_log (product_id, product_name, change_qty, balance_after, reason, user_id) VALUES (?,?,?,?,?,?)',
          [item.product_id, item.product_name, item.qty, newQty, `Void sale ${saleId}`, userId],
        );
      }
    }

    // Restore credit balance if was credit sale
    if (sale.payment_method === 'CREDIT' && sale.customer_id) {
      await db.runAsync(
        'UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?',
        [sale.total, sale.customer_id],
      );
    }

    await db.runAsync("UPDATE sales SET status = 'VOIDED' WHERE id = ?", [saleId]);
  },

  getRevenueTrend: async (days = 7) => {
    const db = await getDb();
    return db.getAllAsync<{ date: string; revenue: number; sales_count: number }>(`
      SELECT date(created_at) as date,
             SUM(total) as revenue,
             COUNT(*) as sales_count
      FROM sales
      WHERE created_at >= datetime('now', '-${days} days') AND status = 'PAID'
      GROUP BY date(created_at)
      ORDER BY date ASC
    `);
  },

  getHourlySales: async (days = 7) => {
    const db = await getDb();
    return db.getAllAsync<{ hour: number; revenue: number; sales_count: number }>(`
      SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour,
             SUM(total) as revenue,
             COUNT(*) as sales_count
      FROM sales
      WHERE created_at >= datetime('now', '-${days} days') AND status = 'PAID'
      GROUP BY hour
      ORDER BY hour ASC
    `);
  },

  getPaymentMix: async (from: string, to: string) => {
    const db = await getDb();
    return db.getAllAsync<{ payment_method: string; total: number; count: number }>(`
      SELECT payment_method,
             SUM(total) as total,
             COUNT(*) as count
      FROM sales
      WHERE date(created_at) BETWEEN ? AND ? AND status = 'PAID'
      GROUP BY payment_method
      ORDER BY total DESC
    `, [from, to]);
  },

  getCategorySales: async (from: string, to: string) => {
    const db = await getDb();
    return db.getAllAsync<{ category_name: string; revenue: number; qty: number }>(`
      SELECT COALESCE(c.name, 'Uncategorised') as category_name,
             SUM(si.total) as revenue,
             SUM(si.qty) as qty
      FROM sale_items si
      JOIN products p ON p.id = si.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      JOIN sales s ON s.id = si.sale_id
      WHERE date(s.created_at) BETWEEN ? AND ? AND s.status = 'PAID'
      GROUP BY c.id
      ORDER BY revenue DESC
      LIMIT 8
    `, [from, to]);
  },

  getCashierSales: async (from: string, to: string) => {
    const db = await getDb();
    return db.getAllAsync<{ cashier_name: string; revenue: number; count: number }>(`
      SELECT cashier_name,
             SUM(total) as revenue,
             COUNT(*) as count
      FROM sales
      WHERE date(created_at) BETWEEN ? AND ? AND status = 'PAID'
      GROUP BY cashier_id
      ORDER BY revenue DESC
    `, [from, to]);
  },

  getCOGS: async (from: string, to: string): Promise<number> => {
    const db = await getDb();
    // Buying prices are VAT-inclusive just like selling prices.
    // Divide cost by (1 + vat_rate/100) to get net cost excl. VAT,
    // which is the actual expense after reclaiming input VAT from KRA.
    const row = await db.getFirstAsync<{ total_cogs: number }>(`
      SELECT COALESCE(SUM(
        CASE WHEN si.cost_price > 0
             THEN (si.cost_price / (1.0 + si.vat_rate / 100.0)) * si.qty
             ELSE (COALESCE(p.cost, 0) / (1.0 + COALESCE(p.vat_rate, 16.0) / 100.0)) * si.qty
        END
      ), 0) as total_cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE date(s.created_at) BETWEEN ? AND ? AND s.status IN ('PAID', 'REVERSAL')
    `, [from, to]);
    return row?.total_cogs ?? 0;
  },
};
