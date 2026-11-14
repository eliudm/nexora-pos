import { Linking, Alert } from 'react-native';
import { ReceiptSale } from './receipt';

/**
 * Share a receipt via WhatsApp.
 * Opens WhatsApp with a pre-filled text message.
 * If the customer phone is not available, opens WhatsApp without a recipient.
 */
export const whatsappService = {
  sendReceipt: async (
    sale: ReceiptSale,
    bizName: string,
    customerPhone?: string | null,
  ): Promise<void> => {
    const lines = [
      `*${bizName} — Receipt*`,
      `Invoice: ${sale.invoice_no}`,
      `Date: ${new Date(sale.created_at).toLocaleString('en-KE')}`,
      ``,
      ...sale.items.map((i) => `  ${i.product_name} x${i.qty}  KES ${i.total.toFixed(0)}`),
      ``,
      sale.discount > 0 ? `Discount: -KES ${sale.discount.toFixed(0)}` : null,
      `*Total: KES ${sale.total.toFixed(0)}*`,
      `Payment: ${sale.payment_method}`,
      sale.mpesa_ref ? `M-Pesa Ref: ${sale.mpesa_ref}` : null,
      ``,
      `Thank you for your business!`,
    ].filter(Boolean).join('\n');

    const encoded = encodeURIComponent(lines);
    let url: string;

    if (customerPhone) {
      // Strip non-digits and ensure 254 prefix
      const digits = customerPhone.replace(/\D/g, '');
      const international = digits.startsWith('0') ? `254${digits.slice(1)}` : digits.startsWith('254') ? digits : `254${digits}`;
      url = `https://wa.me/${international}?text=${encoded}`;
    } else {
      url = `https://wa.me/?text=${encoded}`;
    }

    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('WhatsApp not installed', 'WhatsApp is not installed on this device.');
      return;
    }
    await Linking.openURL(url);
  },

  sendCustomMessage: async (phone: string, message: string): Promise<void> => {
    const digits = phone.replace(/\D/g, '');
    const international = digits.startsWith('0') ? `254${digits.slice(1)}` : digits;
    const url = `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('WhatsApp not installed', 'WhatsApp is not installed on this device.');
      return;
    }
    await Linking.openURL(url);
  },
};
