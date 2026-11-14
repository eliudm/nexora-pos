import { getDb } from './database';

export const getSetting = async (key: string): Promise<string | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
};

export const setSetting = async (key: string, value: string): Promise<void> => {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
};

export const getBusinessInfo = async () => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map: Record<string, string> = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return {
    name: map['business_name'] ?? '',
    phone: map['business_phone'] ?? '',
    address: map['business_address'] ?? '',
    vatNo: map['vat_number'] ?? '',
    receiptFooter: map['receipt_footer'] ?? 'Thank you for your business!',
    mpesaPaybill: map['mpesa_paybill'] ?? '',
    mpesaTill: map['mpesa_till'] ?? '',
  };
};
