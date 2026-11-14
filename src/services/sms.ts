import { getSetting } from '../db/settings';
import { ReceiptSale } from './receipt';

export const smsService = {
  isConfigured: async (): Promise<boolean> => {
    const key = await getSetting('ats_api_key');
    return !!(key && key.trim());
  },

  send: async (phone: string, message: string): Promise<{ success: boolean; error?: string }> => {
    const [apiKey, senderId] = await Promise.all([
      getSetting('ats_api_key'),
      getSetting('ats_sender_id'),
    ]);

    if (!apiKey) return { success: false, error: 'Africa\'s Talking API key not configured.' };

    const digits = phone.replace(/\D/g, '');
    const international = digits.startsWith('0') ? `+254${digits.slice(1)}` : digits.startsWith('254') ? `+${digits}` : `+${digits}`;

    const params = new URLSearchParams({
      username: 'sandbox', // replaced by live username in settings if needed
      to: international,
      message,
      ...(senderId ? { from: senderId } : {}),
    });

    try {
      const response = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          apiKey: apiKey.trim(),
        },
        body: params.toString(),
      });
      const data = await response.json();
      if (data?.SMSMessageData?.Recipients?.[0]?.status === 'Success') {
        return { success: true };
      }
      return { success: false, error: data?.SMSMessageData?.Message ?? 'SMS failed' };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Network error' };
    }
  },

  sendReceipt: async (
    sale: ReceiptSale,
    bizName: string,
    customerPhone: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const lines = [
      `${bizName} Receipt`,
      `Inv: ${sale.invoice_no}`,
      sale.items.map((i) => `${i.product_name} x${i.qty} KES${i.total.toFixed(0)}`).join(', '),
      sale.discount > 0 ? `Disc: -KES${sale.discount.toFixed(0)}` : null,
      `Total: KES${sale.total.toFixed(0)} (${sale.payment_method})`,
      sale.mpesa_ref ? `Ref: ${sale.mpesa_ref}` : null,
      'Thank you!',
    ].filter(Boolean).join('\n');

    return smsService.send(customerPhone, lines);
  },
};
