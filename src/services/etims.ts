import { getDb } from '../db/database';
import { getSetting } from '../db/settings';

interface EtimsConfig {
  deviceSerial: string;
  tin: string;
  bhfId: string;
  serverUrl: string;
}

interface SaleItem {
  product_name: string;
  qty: number;
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
}

interface SaleData {
  id: number;
  invoice_no: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  items: SaleItem[];
}

export const etimsService = {
  getConfig: async (): Promise<EtimsConfig | null> => {
    const [deviceSerial, tin, bhfId, serverUrl] = await Promise.all([
      getSetting('etims_device_serial'),
      getSetting('vat_no'),
      getSetting('etims_bhf_id'),
      getSetting('etims_server_url'),
    ]);
    if (!deviceSerial || !tin || !bhfId || !serverUrl) return null;
    return { deviceSerial, tin, bhfId: bhfId || '00', serverUrl: serverUrl || 'https://etims-api.kra.go.ke' };
  },

  submitSale: async (sale: SaleData): Promise<{ success: boolean; receiptNo?: string; qrCode?: string; error?: string }> => {
    const db = await getDb();
    const config = await etimsService.getConfig();

    if (!config) {
      await db.runAsync(
        "INSERT INTO etims_submissions (sale_id, status, error_msg) VALUES (?, 'SKIPPED', ?)",
        [sale.id, 'eTIMS not configured'],
      );
      return { success: false, error: 'eTIMS not configured. Set up in Settings → VAT/PIN and eTIMS details.' };
    }

    try {
      const payload = {
        tin: config.tin,
        bhfId: config.bhfId,
        invcNo: sale.invoice_no,
        totItemCnt: sale.items.length,
        totAmt: sale.total,
        totTaxblAmt: sale.subtotal,
        totTaxAmt: sale.tax_amount,
        items: sale.items.map((item, i) => ({
          itemSeq: i + 1,
          itemNm: item.product_name,
          qty: item.qty,
          prc: item.unit_price,
          splyAmt: item.unit_price * item.qty,
          taxTyCd: item.vat_rate > 0 ? 'B' : 'E',
          taxAmt: item.vat_amount,
          totAmt: item.total,
        })),
      };

      const response = await fetch(`${config.serverUrl}/api/method/saveTrnsSalesOsdc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'tin': config.tin, 'bhfId': config.bhfId },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.resultCd === '000') {
        const receiptNo = result.data?.rcptNo ?? '';
        const qrCode = result.data?.qrCodeUrl ?? '';
        await db.runAsync(
          "INSERT INTO etims_submissions (sale_id, status, receipt_no, qr_code, submitted_at) VALUES (?, 'SUBMITTED', ?, ?, datetime('now'))",
          [sale.id, receiptNo, qrCode],
        );
        return { success: true, receiptNo, qrCode };
      } else {
        const errMsg = result.resultMsg ?? 'eTIMS submission failed';
        await db.runAsync(
          "INSERT INTO etims_submissions (sale_id, status, error_msg) VALUES (?, 'FAILED', ?)",
          [sale.id, errMsg],
        );
        return { success: false, error: errMsg };
      }
    } catch (e: any) {
      const errMsg = e.message ?? 'Network error';
      await db.runAsync(
        "INSERT INTO etims_submissions (sale_id, status, error_msg) VALUES (?, 'FAILED', ?)",
        [sale.id, errMsg],
      );
      return { success: false, error: errMsg };
    }
  },
};
