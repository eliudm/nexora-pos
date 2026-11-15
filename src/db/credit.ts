import { getDb } from './database';

export interface CreditTransaction {
  id: number;
  customer_id: number;
  sale_id: number | null;
  type: 'SALE' | 'REPAYMENT' | 'ADJUSTMENT';
  amount: number;
  payment_method: string | null;
  mpesa_ref: string | null;
  note: string | null;
  cashier_id: number | null;
  created_at: string;
}

export interface CreditLedgerEntry {
  date: string;
  type: 'SALE' | 'REPAYMENT' | 'ADJUSTMENT';
  amount: number;
  payment_method: string | null;
  mpesa_ref: string | null;
  note: string | null;
  invoice_no: string | null;
}

export interface Debtor {
  id: number;
  name: string;
  phone: string | null;
  credit_balance: number;
  credit_limit: number;
  oldest_sale_date: string | null;
}

export const creditQueries = {
  getDebtors: async (): Promise<Debtor[]> => {
    const db = await getDb();
    return db.getAllAsync<Debtor>(`
      SELECT c.id, c.name, c.phone, c.credit_balance,
             COALESCE(c.credit_limit, 0) as credit_limit,
             MIN(s.created_at) as oldest_sale_date
      FROM customers c
      LEFT JOIN sales s ON s.customer_id = c.id AND s.payment_method = 'CREDIT' AND s.status = 'PAID'
      WHERE c.credit_balance < 0
      GROUP BY c.id
      ORDER BY c.credit_balance ASC
    `);
  },

  getSummary: async (): Promise<{ totalOwed: number; debtorCount: number }> => {
    const db = await getDb();
    const r = await db.getFirstAsync<{ totalOwed: number; debtorCount: number }>(`
      SELECT
        ABS(COALESCE(SUM(CASE WHEN credit_balance < 0 THEN credit_balance ELSE 0 END), 0)) as totalOwed,
        COUNT(CASE WHEN credit_balance < 0 THEN 1 END) as debtorCount
      FROM customers
    `);
    return r ?? { totalOwed: 0, debtorCount: 0 };
  },

  // Returns unified ledger: credit sales + repayments, newest first
  getLedger: async (customerId: number): Promise<CreditLedgerEntry[]> => {
    const db = await getDb();
    const sales = await db.getAllAsync<CreditLedgerEntry>(`
      SELECT s.created_at as date, 'SALE' as type,
             -s.total as amount, s.payment_method, s.mpesa_ref,
             'Sale on credit' as note, s.invoice_no
      FROM sales s
      WHERE s.customer_id = ? AND s.payment_method = 'CREDIT' AND s.status = 'PAID'
      ORDER BY s.created_at DESC
    `, [customerId]);

    const repayments = await db.getAllAsync<CreditLedgerEntry>(`
      SELECT ct.created_at as date, ct.type, ct.amount, ct.payment_method,
             ct.mpesa_ref, ct.note, NULL as invoice_no
      FROM credit_transactions ct
      WHERE ct.customer_id = ?
      ORDER BY ct.created_at DESC
    `, [customerId]);

    const combined = [...sales, ...repayments].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    return combined;
  },

  recordRepayment: async (data: {
    customerId: number;
    amount: number;
    paymentMethod: string;
    mpesaRef?: string;
    note?: string;
    cashierId?: number | null;
  }): Promise<void> => {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO credit_transactions (customer_id, type, amount, payment_method, mpesa_ref, note, cashier_id)
       VALUES (?, 'REPAYMENT', ?, ?, ?, ?, ?)`,
      [data.customerId, data.amount, data.paymentMethod,
       data.mpesaRef ?? null, data.note ?? null, data.cashierId ?? null],
    );
    await db.runAsync(
      'UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?',
      [data.amount, data.customerId],
    );
  },

  updateCreditLimit: async (customerId: number, limit: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync('UPDATE customers SET credit_limit = ? WHERE id = ?', [limit, customerId]);
  },

  getAgingBuckets: async (): Promise<{ bucket: string; count: number; amount: number }[]> => {
    const db = await getDb();
    return db.getAllAsync<{ bucket: string; count: number; amount: number }>(`
      SELECT
        CASE
          WHEN julianday('now') - julianday(s.created_at) <= 30 THEN '0-30 days'
          WHEN julianday('now') - julianday(s.created_at) <= 60 THEN '31-60 days'
          WHEN julianday('now') - julianday(s.created_at) <= 90 THEN '61-90 days'
          ELSE 'Over 90 days'
        END as bucket,
        COUNT(DISTINCT s.customer_id) as count,
        SUM(s.total) as amount
      FROM sales s
      JOIN customers c ON s.customer_id = c.id
      WHERE s.payment_method = 'CREDIT' AND s.status = 'PAID' AND c.credit_balance < 0
      GROUP BY bucket
    `);
  },
};
