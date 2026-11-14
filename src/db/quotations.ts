import { getDb } from './database';
import { CartItem, salesQueries } from './sales';
import dayjs from 'dayjs';

export interface Quotation {
  id: number;
  quote_no: string;
  customer_id: number | null;
  customer_name: string | null;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'EXPIRED' | 'CONVERTED' | 'CANCELLED';
  subtotal: number;
  tax_amount: number;
  discount: number;
  total: number;
  valid_until: string | null;
  note: string | null;
  cashier_id: number | null;
  converted_sale_id: number | null;
  created_at: string;
  items?: CartItem[];
}

let _quoteCounter = 0;

const nextQuoteNo = async (): Promise<string> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM quotations');
  _quoteCounter = (row?.c ?? 0) + 1;
  return `QT-${dayjs().format('YYYYMMDD')}-${String(_quoteCounter).padStart(4, '0')}`;
};

export const quotationQueries = {
  create: async (
    items: CartItem[],
    opts: {
      customerId?: number;
      customerName?: string;
      discount?: number;
      validDays?: number;
      note?: string;
      cashierId?: number;
    },
  ): Promise<number> => {
    const db = await getDb();
    const quoteNo = await nextQuoteNo();
    const subtotal = items.reduce((s, i) => s + i.unit_price * i.qty - i.discount, 0);
    const taxAmount = items.reduce((s, i) => s + i.vat_amount, 0);
    const discount = opts.discount ?? 0;
    const total = subtotal + taxAmount - discount;
    const validUntil = dayjs().add(opts.validDays ?? 7, 'day').format('YYYY-MM-DD');

    const r = await db.runAsync(
      `INSERT INTO quotations (quote_no, customer_id, customer_name, subtotal, tax_amount, discount, total, valid_until, note, cashier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [quoteNo, opts.customerId ?? null, opts.customerName ?? null,
       subtotal, taxAmount, discount, total, validUntil, opts.note ?? null, opts.cashierId ?? null],
    );
    const quoteId = r.lastInsertRowId;
    for (const item of items) {
      await db.runAsync(
        `INSERT INTO quotation_items (quote_id, product_id, product_name, qty, unit_price, discount, vat_rate, vat_amount, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [quoteId, item.product_id, item.product_name, item.qty,
         item.unit_price, item.discount, item.vat_rate, item.vat_amount, item.total],
      );
    }
    return quoteId;
  },

  getAll: async (limit = 50): Promise<Quotation[]> => {
    const db = await getDb();
    return db.getAllAsync<Quotation>(
      'SELECT * FROM quotations ORDER BY created_at DESC LIMIT ?', [limit],
    );
  },

  getById: async (id: number): Promise<Quotation | null> => {
    const db = await getDb();
    const q = await db.getFirstAsync<Quotation>('SELECT * FROM quotations WHERE id = ?', [id]);
    if (!q) return null;
    q.items = await db.getAllAsync<CartItem>(
      'SELECT product_id, product_name, qty, unit_price, discount, vat_rate, vat_amount, total FROM quotation_items WHERE quote_id = ?',
      [id],
    );
    return q;
  },

  convertToSale: async (quoteId: number, paymentMethod: string, cashierId?: number): Promise<number> => {
    const db = await getDb();
    const quote = await quotationQueries.getById(quoteId);
    if (!quote || !quote.items) throw new Error('Quote not found');
    const saleId = await salesQueries.create(quote.items, {
      customerId: quote.customer_id ?? undefined,
      cashierId,
      discount: quote.discount,
      paymentMethod,
    });
    await db.runAsync(
      "UPDATE quotations SET status = 'CONVERTED', converted_sale_id = ? WHERE id = ?",
      [saleId, quoteId],
    );
    return saleId;
  },

  updateStatus: async (id: number, status: Quotation['status']): Promise<void> => {
    const db = await getDb();
    await db.runAsync('UPDATE quotations SET status = ? WHERE id = ?', [status, id]);
  },
};
