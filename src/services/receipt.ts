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

  // Totals — prices are VAT-inclusive; VAT shown as informational after TOTAL
  r += `[L]${pad('Subtotal', `KES ${sale.subtotal.toFixed(0)}`)}\n`;
  if (sale.discount > 0) {
    r += `[L]${pad('Discount', `-KES ${sale.discount.toFixed(0)}`)}\n`;
  }

  r += divider('=');
  r += `[L]<b>${pad('TOTAL', `KES ${sale.total.toFixed(0)}`)}</b>\n`;
  r += divider('=');
  r += `[L]${pad('Incl. VAT (16%)', `KES ${sale.tax_amount.toFixed(0)}`)}\n`;

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

/** Narrow HTML receipt — matches thermal paper width (80 mm / ~300 px). Used for "Print via System". */
export function buildReceiptHtml(sale: ReceiptSale, biz: BusinessInfo): string {
  const itemRows = sale.items.map((i) =>
    `<tr>
      <td style="padding:3px 2px">${i.product_name}</td>
      <td style="text-align:center;padding:3px 2px;white-space:nowrap">${i.qty}</td>
      <td style="text-align:right;padding:3px 2px;white-space:nowrap">KES ${i.total.toFixed(0)}</td>
    </tr>
    <tr><td colspan="3" style="padding:0 2px 4px;font-size:11px;color:#666">&nbsp;&nbsp;${i.qty} x KES ${i.unit_price.toLocaleString()}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Courier New', monospace; max-width: 300px; margin: 0 auto; padding: 12px 10px; font-size: 12px; color: #000; background: #fff; }
      h1 { font-size: 16px; text-align: center; font-weight: 900; margin-bottom: 2px; }
      p { text-align: center; margin: 1px 0; font-size: 11px; }
      hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
      hr.solid { border-top: 1px solid #000; }
      hr.double { border-top: 3px double #000; }
      .meta { margin: 2px 0; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; }
      .total-row td { font-weight: 700; font-size: 13px; padding: 4px 2px; border-top: 1px solid #000; border-bottom: 1px solid #000; }
      .vat-row td { font-size: 10px; color: #555; padding: 2px; }
      @media print { @page { size: 80mm auto; margin: 4mm; } }
    </style>
  </head><body>
    <h1>${biz.name}</h1>
    ${biz.phone ? `<p>${biz.phone}</p>` : ''}
    ${biz.address ? `<p>${biz.address}</p>` : ''}
    ${biz.vatNo ? `<p>PIN: ${biz.vatNo}</p>` : ''}
    <hr/>
    <div class="meta">Invoice: <b>${sale.invoice_no}</b></div>
    <div class="meta">Date: ${dayjs(sale.created_at).format('D MMM YYYY HH:mm')}</div>
    ${sale.customer_name ? `<div class="meta">Customer: ${sale.customer_name}</div>` : ''}
    ${sale.cashier_name ? `<div class="meta">Cashier: ${sale.cashier_name}</div>` : ''}
    <hr/>
    <table>
      <thead><tr>
        <th style="text-align:left;padding:2px">ITEM</th>
        <th style="text-align:center;padding:2px">QTY</th>
        <th style="text-align:right;padding:2px">AMT</th>
      </tr></thead>
      <tbody><tr><td colspan="3"><hr class="solid" style="margin:2px 0"/></td></tr>${itemRows}</tbody>
    </table>
    <hr/>
    <table>
      <tr><td style="padding:2px">Subtotal</td><td style="text-align:right;padding:2px">KES ${sale.subtotal.toFixed(0)}</td></tr>
      ${sale.discount > 0 ? `<tr><td style="padding:2px">Discount</td><td style="text-align:right;padding:2px;color:#c00">-KES ${sale.discount.toFixed(0)}</td></tr>` : ''}
      <tr class="total-row"><td>TOTAL</td><td style="text-align:right">KES ${sale.total.toFixed(0)}</td></tr>
      <tr class="vat-row"><td>Incl. VAT (16%)</td><td style="text-align:right">KES ${sale.tax_amount.toFixed(0)}</td></tr>
      <tr><td style="padding:2px">Payment</td><td style="text-align:right;padding:2px;font-weight:700">${sale.payment_method}</td></tr>
      ${sale.mpesa_ref ? `<tr><td style="padding:2px">Ref</td><td style="text-align:right;padding:2px">${sale.mpesa_ref}</td></tr>` : ''}
    </table>
    ${(biz.mpesaTill || biz.mpesaPaybill) ? `
      <hr/>
      <p style="font-weight:700">PAY VIA M-PESA</p>
      ${biz.mpesaTill ? `<p>Till: ${biz.mpesaTill}</p>` : ''}
      ${biz.mpesaPaybill ? `<p>Paybill: ${biz.mpesaPaybill}</p>` : ''}
    ` : ''}
    <hr/>
    <p style="font-size:11px">${biz.receiptFooter ?? 'Thank you for your business!'}</p>
    <p style="font-size:10px;color:#aaa;margin-top:2px">Powered by Nexora POS</p>
    <p style="font-size:9px;color:#ccc">&nbsp;</p>
  </body></html>`;
}

/** Full A4 invoice — professional layout used for "Share as PDF". */
export function buildInvoiceHtml(sale: ReceiptSale, biz: BusinessInfo): string {
  const accent = '#1db8a0';

  const itemRows = sale.items.map((item, idx) => {
    const vatF = item.vat_rate / 100;
    const unitExVAT = item.unit_price / (1 + vatF);
    const vatAmt = item.total - item.total / (1 + vatF);
    return `<tr style="background:${idx % 2 === 0 ? '#fff' : '#f9fafb'}">
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb">${idx + 1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${item.product_name}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${item.qty}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right">KES ${unitExVAT.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${item.vat_rate}%</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700">KES ${item.total.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>`;
  }).join('');

  const paymentDetail = sale.payment_method === 'SPLIT'
    ? `Split — Cash: KES ${(sale.split_cash ?? 0).toFixed(0)} / M-Pesa: KES ${(sale.split_mpesa ?? 0).toFixed(0)}`
    : sale.payment_method;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 13px; padding: 40px; background: #fff; }
      @media print { @page { size: A4; margin: 15mm 20mm; } body { padding: 0; } }
    </style>
  </head><body>

    <!-- Header -->
    <table style="width:100%;margin-bottom:36px">
      <tr>
        <td style="vertical-align:top">
          <div style="font-size:26px;font-weight:900;color:${accent};letter-spacing:-0.5px">${biz.name}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:6px;line-height:1.8">
            ${biz.phone ? biz.phone + '<br>' : ''}
            ${biz.address ? biz.address + '<br>' : ''}
            ${biz.vatNo ? 'VAT/PIN: ' + biz.vatNo : ''}
          </div>
        </td>
        <td style="text-align:right;vertical-align:top">
          <div style="font-size:40px;font-weight:900;color:${accent};letter-spacing:-1px">INVOICE</div>
          <div style="font-size:13px;color:#374151;margin-top:8px;line-height:2">
            <b>${sale.invoice_no}</b><br>
            ${dayjs(sale.created_at).format('D MMMM YYYY')}<br>
            ${dayjs(sale.created_at).format('HH:mm')}
          </div>
        </td>
      </tr>
    </table>

    <!-- Bill To / Details Bar -->
    <table style="width:100%;background:#f3fdfb;border-radius:8px;margin-bottom:28px;border:1px solid #d1faf4">
      <tr>
        <td style="padding:16px 20px;vertical-align:top;width:50%">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:700;margin-bottom:4px">Bill To</div>
          <div style="font-size:15px;font-weight:700;color:#111827">${sale.customer_name || 'Walk-in Customer'}</div>
        </td>
        ${sale.cashier_name ? `<td style="padding:16px 20px;vertical-align:top;border-left:1px solid #d1faf4">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:700;margin-bottom:4px">Served By</div>
          <div style="font-size:14px;font-weight:600;color:#374151">${sale.cashier_name}</div>
        </td>` : ''}
        <td style="padding:16px 20px;vertical-align:top;border-left:1px solid #d1faf4">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:700;margin-bottom:4px">Payment</div>
          <div style="font-size:14px;font-weight:600;color:#374151">${paymentDetail}</div>
          ${sale.mpesa_ref ? `<div style="font-size:11px;color:#6b7280">Ref: ${sale.mpesa_ref}</div>` : ''}
        </td>
      </tr>
    </table>

    <!-- Items Table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead>
        <tr style="background:${accent};color:#fff">
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;width:30px">#</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Description</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;width:60px">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;width:120px">Unit (ex. VAT)</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;width:60px">VAT</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;width:120px">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <!-- Totals -->
    <table style="width:100%;margin-bottom:28px">
      <tr>
        <td style="width:55%"></td>
        <td>
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:6px 0;color:#6b7280">Subtotal (incl. VAT)</td>
              <td style="padding:6px 0;text-align:right;font-weight:600">KES ${sale.subtotal.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            ${sale.discount > 0 ? `<tr>
              <td style="padding:6px 0;color:#6b7280">Discount</td>
              <td style="padding:6px 0;text-align:right;font-weight:600;color:#dc2626">-KES ${sale.discount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>` : ''}
            <tr style="border-top:2px solid ${accent}">
              <td style="padding:12px 0 4px;font-size:16px;font-weight:900;color:${accent}">TOTAL</td>
              <td style="padding:12px 0 4px;text-align:right;font-size:16px;font-weight:900;color:${accent}">KES ${sale.total.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;font-size:11px;color:#9ca3af">VAT included</td>
              <td style="padding:2px 0;text-align:right;font-size:11px;color:#9ca3af">KES ${sale.tax_amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${(biz.mpesaTill || biz.mpesaPaybill) ? `
    <!-- M-Pesa Info -->
    <div style="background:#f0fdf9;border:1px solid #d1faf4;border-radius:8px;padding:16px 20px;margin-bottom:28px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:${accent};font-weight:700;margin-bottom:8px">Pay via M-Pesa</div>
      ${biz.mpesaTill ? `<div style="font-size:13px;color:#374151">Till Number: <b>${biz.mpesaTill}</b></div>` : ''}
      ${biz.mpesaPaybill ? `<div style="font-size:13px;color:#374151">Paybill: <b>${biz.mpesaPaybill}</b></div>` : ''}
    </div>` : ''}

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;padding-top:16px;text-align:center;color:#9ca3af;font-size:11px;line-height:2">
      ${biz.receiptFooter ? `<div style="color:#374151;font-weight:600;font-size:12px;margin-bottom:4px">${biz.receiptFooter}</div>` : ''}
      <div>Powered by Nexora POS &nbsp;|&nbsp; ${dayjs(sale.created_at).format('D MMM YYYY HH:mm')}</div>
    </div>

  </body></html>`;
}
