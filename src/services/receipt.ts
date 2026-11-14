/**
 * Formats a sale into an ESC/POS receipt string using
 * react-native-thermal-printer tag syntax (48-char wide paper).
 *
 * Tags:
 *   [C] = centre  [L] = left  [R] = right
 *   <b> bold  </b>  <u> underline  </u>
 *   [L]col1[R]col2 = two-column line
 */

import dayjs from 'dayjs';

const WIDTH = 48;

function pad(left: string, right: string, total = WIDTH): string {
  const space = total - left.length - right.length;
  return left + ' '.repeat(Math.max(1, space)) + right;
}

function divider(char = '-'): string {
  return `[C]${char.repeat(WIDTH)}\n`;
}

export interface ReceiptSale {
  invoice_no: string;
  created_at: string;
  customer_name?: string | null;
  cashier_name?: string | null;
  subtotal: number;
  tax_amount: number;
  discount: number;
  total: number;
  payment_method: string;
  mpesa_ref?: string | null;
  split_cash?: number;
  split_mpesa?: number;
  etims_qr?: string | null;
  items: Array<{
    product_name: string;
    qty: number;
    unit_price: number;
    vat_rate: number;
    total: number;
  }>;
}

export interface BusinessInfo {
  name: string;
  phone?: string | null;
  address?: string | null;
  vatNo?: string | null;
  receiptFooter?: string | null;
  mpesaPaybill?: string | null;
  mpesaTill?: string | null;
}

export function buildReceiptText(sale: ReceiptSale, biz: BusinessInfo): string {
  let r = '';

  // Header
  r += `[C]<b>${biz.name.toUpperCase()}</b>\n`;
  if (biz.phone)   r += `[C]${biz.phone}\n`;
  if (biz.address) r += `[C]${biz.address}\n`;
  if (biz.vatNo)   r += `[C]PIN: ${biz.vatNo}\n`;

  r += divider();

  // Sale info
  r += `[L]Invoice: ${sale.invoice_no}\n`;
  r += `[L]Date: ${dayjs(sale.created_at).format('D MMM YYYY HH:mm')}\n`;
  if (sale.customer_name) r += `[L]Customer: ${sale.customer_name}\n`;
  if (sale.cashier_name)  r += `[L]Cashier: ${sale.cashier_name}\n`;

  r += divider();

  // Items
  r += `[L]<b>${pad('ITEM', 'TOTAL')}</b>\n`;
  r += divider();

  for (const item of sale.items) {
    const name = item.product_name.length > 28 ? item.product_name.slice(0, 25) + '...' : item.product_name;
    const total = `KES ${item.total.toFixed(0)}`;
    r += `[L]${pad(name, total)}\n`;
    r += `[L]  ${item.qty} x KES ${item.unit_price.toLocaleString()}\n`;
  }

  r += divider();

  // Totals
  r += `[L]${pad('Subtotal', `KES ${sale.subtotal.toFixed(0)}`)}\n`;
  r += `[L]${pad('VAT (16%)', `KES ${sale.tax_amount.toFixed(0)}`)}\n`;
  if (sale.discount > 0) {
    r += `[L]${pad('Discount', `-KES ${sale.discount.toFixed(0)}`)}\n`;
  }

  r += divider('=');
  r += `[L]<b>${pad('TOTAL', `KES ${sale.total.toFixed(0)}`)}</b>\n`;
  r += divider('=');

  // Payment
  if (sale.payment_method === 'SPLIT') {
    r += `[L]${pad('Payment', 'SPLIT')}\n`;
    if (sale.split_cash && sale.split_cash > 0) r += `[L]${pad('  Cash', `KES ${sale.split_cash.toFixed(0)}`)}\n`;
    if (sale.split_mpesa && sale.split_mpesa > 0) r += `[L]${pad('  M-Pesa', `KES ${sale.split_mpesa.toFixed(0)}`)}\n`;
  } else {
    r += `[L]${pad('Payment', sale.payment_method)}\n`;
  }
  if (sale.mpesa_ref) r += `[L]${pad('M-Pesa Ref', sale.mpesa_ref)}\n`;

  // M-Pesa details for future payments
  if (biz.mpesaTill || biz.mpesaPaybill) {
    r += divider();
    r += `[C]PAY VIA M-PESA\n`;
    if (biz.mpesaTill)    r += `[C]Till: ${biz.mpesaTill}\n`;
    if (biz.mpesaPaybill) r += `[C]Paybill: ${biz.mpesaPaybill}\n`;
  }

  // eTIMS KRA QR code (if present)
  if (sale.etims_qr) {
    r += divider();
    r += `[C]KRA eTIMS VERIFIED\n`;
    r += `[C]${sale.etims_qr}\n`;
  }

  r += divider();
  r += `[C]${biz.receiptFooter ?? 'Thank you for your business!'}\n`;
  r += `[C]Powered by Nexora POS\n`;
  r += '\n\n\n'; // paper feed before cut

  return r;
}

/** Same content as plain text — used as fallback for HTML printing */
export function buildReceiptHtml(sale: ReceiptSale, biz: BusinessInfo): string {
  const itemRows = sale.items.map((i) =>
    `<tr>
      <td>${i.product_name}</td>
      <td style="text-align:center">${i.qty}</td>
      <td style="text-align:right">KES ${i.total.toFixed(0)}</td>
    </tr>`
  ).join('');

  return `
    <html><body style="font-family:monospace;max-width:320px;margin:0 auto;padding:16px;font-size:13px">
      <h2 style="text-align:center;margin:0 0 4px">${biz.name}</h2>
      ${biz.phone ? `<p style="text-align:center;margin:2px 0">${biz.phone}</p>` : ''}
      ${biz.address ? `<p style="text-align:center;margin:2px 0">${biz.address}</p>` : ''}
      ${biz.vatNo ? `<p style="text-align:center;margin:2px 0">PIN: ${biz.vatNo}</p>` : ''}
      <hr/>
      <p style="margin:2px 0">Invoice: <b>${sale.invoice_no}</b></p>
      <p style="margin:2px 0">Date: ${dayjs(sale.created_at).format('D MMM YYYY HH:mm')}</p>
      ${sale.customer_name ? `<p style="margin:2px 0">Customer: ${sale.customer_name}</p>` : ''}
      ${sale.cashier_name ? `<p style="margin:2px 0">Cashier: ${sale.cashier_name}</p>` : ''}
      <hr/>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid #ccc">
            <th style="text-align:left;padding:4px 2px">Item</th>
            <th style="text-align:center;padding:4px 2px">Qty</th>
            <th style="text-align:right;padding:4px 2px">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <hr/>
      <table style="width:100%">
        <tr><td>Subtotal</td><td style="text-align:right">KES ${sale.subtotal.toFixed(0)}</td></tr>
        <tr><td>VAT (16%)</td><td style="text-align:right">KES ${sale.tax_amount.toFixed(0)}</td></tr>
        ${sale.discount > 0 ? `<tr><td>Discount</td><td style="text-align:right">-KES ${sale.discount.toFixed(0)}</td></tr>` : ''}
        <tr style="border-top:2px solid #333;font-weight:bold"><td>TOTAL</td><td style="text-align:right">KES ${sale.total.toFixed(0)}</td></tr>
        <tr><td>Payment</td><td style="text-align:right">${sale.payment_method}</td></tr>
        ${sale.mpesa_ref ? `<tr><td>M-Pesa Ref</td><td style="text-align:right">${sale.mpesa_ref}</td></tr>` : ''}
      </table>
      ${(biz.mpesaTill || biz.mpesaPaybill) ? `
        <hr/>
        <p style="text-align:center;font-size:12px">PAY VIA M-PESA</p>
        ${biz.mpesaTill ? `<p style="text-align:center;font-size:12px">Till: ${biz.mpesaTill}</p>` : ''}
        ${biz.mpesaPaybill ? `<p style="text-align:center;font-size:12px">Paybill: ${biz.mpesaPaybill}</p>` : ''}
      ` : ''}
      <hr/>
      <p style="text-align:center;font-size:12px">${biz.receiptFooter ?? 'Thank you for your business!'}</p>
      <p style="text-align:center;font-size:10px;color:#aaa">Powered by Nexora POS</p>
    </body></html>
  `;
}
