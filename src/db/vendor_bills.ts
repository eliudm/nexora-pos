import { getDb } from './database';
import dayjs from 'dayjs';

export interface VendorBill {
  id: number;
  bill_no: string;
  po_id: number | null;
  po_no: string | null;
  supplier_id: number | null;
  supplier_name: string | null;
  amount: number;
  vat_rate: number;
  vat_amount: number;
  amount_paid: number;
  balance: number;
  due_date: string | null;
  status: 'UNPAID' | 'PARTIAL' | 'PAID';
  notes: string | null;
  cashier_id: number | null;
  created_at: string;
  payments?: BillPayment[];
}

export interface BillPayment {
  id: number;
  bill_id: number;
  amount: number;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  cashier_id: number | null;
  created_at: string;
}

export interface BillSummary {
  total_outstanding: number;
  total_overdue: number;
  total_paid_month: number;
  count_unpaid: number;
}

const nextBillNo = async (): Promise<string> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM vendor_bills');
  return `BILL-${dayjs().format('YYYYMMDD')}-${String((row?.c ?? 0) + 1).padStart(4, '0')}`;
};

export const vendorBillQueries = {
  create: async (data: {
    poId?: number;
    poNo?: string;
    supplierId?: number | null;
    supplierName?: string | null;
    amount: number;
    vatRate?: number;
    dueDate?: string;
    notes?: string;
    cashierId?: number | null;
  }): Promise<number> => {
    const db = await getDb();
    const billNo = await nextBillNo();
    const vatRate = data.vatRate ?? 16;
    // Extract VAT from VAT-inclusive amount: VAT = amount × rate / (100 + rate)
    const vatAmount = data.amount * vatRate / (100 + vatRate);
    const r = await db.runAsync(
      `INSERT INTO vendor_bills (bill_no, po_id, po_no, supplier_id, supplier_name, amount, vat_rate, vat_amount, amount_paid, balance, due_date, notes, cashier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [billNo, data.poId ?? null, data.poNo ?? null,
       data.supplierId ?? null, data.supplierName ?? null,
       data.amount, vatRate, vatAmount, data.amount,
       data.dueDate ?? null, data.notes ?? null, data.cashierId ?? null],
    );
    return r.lastInsertRowId;
  },

  createFromPO: async (
    poId: number, poNo: string,
    supplierId: number | null, supplierName: string | null,
    amount: number, cashierId?: number | null,
  ): Promise<number> => {
    const db = await getDb();
    const existing = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM vendor_bills WHERE po_id = ?', [poId],
    );
    if (existing) return existing.id;
    return vendorBillQueries.create({ poId, poNo, supplierId, supplierName, amount, cashierId });
  },

  getAll: async (status?: string, limit = 100): Promise<VendorBill[]> => {
    const db = await getDb();
    const where = status && status !== 'ALL' ? `WHERE status = '${status}'` : '';
    return db.getAllAsync<VendorBill>(`
      SELECT * FROM vendor_bills ${where}
      ORDER BY
        CASE status WHEN 'UNPAID' THEN 0 WHEN 'PARTIAL' THEN 1 ELSE 2 END,
        due_date ASC,
        created_at DESC
      LIMIT ?
    `, [limit]);
  },

  getById: async (id: number): Promise<VendorBill | null> => {
    const db = await getDb();
    const bill = await db.getFirstAsync<VendorBill>(
      'SELECT * FROM vendor_bills WHERE id = ?', [id],
    );
    if (!bill) return null;
    bill.payments = await db.getAllAsync<BillPayment>(
      'SELECT * FROM vendor_bill_payments WHERE bill_id = ? ORDER BY created_at DESC', [id],
    );
    return bill;
  },

  getSummary: async (): Promise<BillSummary> => {
    const db = await getDb();
    const row = await db.getFirstAsync<BillSummary>(`
      SELECT
        COALESCE(SUM(CASE WHEN status != 'PAID' THEN balance ELSE 0 END), 0) as total_outstanding,
        COALESCE(SUM(CASE WHEN status != 'PAID' AND due_date < date('now') THEN balance ELSE 0 END), 0) as total_overdue,
        COALESCE(SUM(CASE WHEN status = 'PAID' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') THEN amount ELSE 0 END), 0) as total_paid_month,
        COUNT(CASE WHEN status != 'PAID' THEN 1 END) as count_unpaid
      FROM vendor_bills
    `);
    return row ?? { total_outstanding: 0, total_overdue: 0, total_paid_month: 0, count_unpaid: 0 };
  },

  getInputVAT: async (from: string, to: string): Promise<number> => {
    const db = await getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(vat_amount), 0) as total
       FROM vendor_bills
       WHERE date(created_at) BETWEEN ? AND ?`,
      [from, to],
    );
    return row?.total ?? 0;
  },

  recordPayment: async (
    billId: number,
    payment: {
      amount: number;
      paymentMethod: string;
      reference?: string;
      notes?: string;
      cashierId?: number | null;
    },
  ): Promise<void> => {
    const db = await getDb();
    const bill = await db.getFirstAsync<{ amount: number; amount_paid: number; balance: number }>(
      'SELECT amount, amount_paid, balance FROM vendor_bills WHERE id = ?', [billId],
    );
    if (!bill) throw new Error('Bill not found');
    if (payment.amount <= 0) throw new Error('Amount must be greater than 0');
    if (payment.amount > bill.balance + 0.01) {
      throw new Error(`Amount exceeds remaining balance of KES ${bill.balance.toLocaleString()}`);
    }

    await db.runAsync(
      `INSERT INTO vendor_bill_payments (bill_id, amount, payment_method, reference, notes, cashier_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [billId, payment.amount, payment.paymentMethod,
       payment.reference ?? null, payment.notes ?? null, payment.cashierId ?? null],
    );

    const newPaid = bill.amount_paid + payment.amount;
    const newBalance = Math.max(0, bill.amount - newPaid);
    const newStatus = newBalance <= 0.01 ? 'PAID' : 'PARTIAL';
    await db.runAsync(
      'UPDATE vendor_bills SET amount_paid = ?, balance = ?, status = ? WHERE id = ?',
      [newPaid, newBalance, newStatus, billId],
    );
  },
};
