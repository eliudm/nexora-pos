/**
 * Safaricom Daraja API — M-Pesa STK Push (Lipa na M-Pesa Online)
 *
 * To use this, configure in Settings:
 *   - Consumer Key (from Daraja portal)
 *   - Consumer Secret (from Daraja portal)
 *   - Business Short Code (Paybill or Till)
 *   - Passkey (from Daraja portal)
 *   - Callback URL (must be publicly accessible HTTPS endpoint)
 *
 * In a fully standalone app without a backend, this requires calling Daraja
 * directly from the device, which exposes your credentials. For production use,
 * proxy these calls through your own backend server.
 */

import { getSetting, setSetting } from '../db/settings';

export interface DarajaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passkey: string;
  callbackUrl: string;
  environment: 'sandbox' | 'live';
}

const DARAJA_URLS = {
  sandbox: {
    auth: 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    stkPush: 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
  },
  live: {
    auth: 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    stkPush: 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
  },
};

export const darajaService = {
  getConfig: async (): Promise<DarajaConfig | null> => {
    const raw = await getSetting('daraja_config');
    if (!raw) return null;
    try { return JSON.parse(raw) as DarajaConfig; } catch { return null; }
  },

  saveConfig: async (config: DarajaConfig): Promise<void> => {
    await setSetting('daraja_config', JSON.stringify(config));
  },

  isConfigured: async (): Promise<boolean> => {
    const c = await darajaService.getConfig();
    return !!(c?.consumerKey && c?.consumerSecret && c?.shortCode && c?.passkey);
  },

  getToken: async (config: DarajaConfig): Promise<string> => {
    const credentials = btoa(`${config.consumerKey}:${config.consumerSecret}`);
    const urls = DARAJA_URLS[config.environment ?? 'live'];
    const response = await fetch(urls.auth, {
      method: 'GET',
      headers: { Authorization: `Basic ${credentials}` },
    });
    if (!response.ok) throw new Error('Failed to get Daraja access token');
    const data = await response.json();
    return data.access_token;
  },

  stkPush: async (
    phone: string,
    amount: number,
    accountRef: string,
    description: string,
  ): Promise<{ success: boolean; checkoutRequestId?: string; error?: string }> => {
    const config = await darajaService.getConfig();
    if (!config) return { success: false, error: 'Daraja not configured. Set up in Settings → Integrations.' };

    try {
      const token = await darajaService.getToken(config);
      const urls = DARAJA_URLS[config.environment ?? 'live'];

      const now = new Date();
      const timestamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
      ].join('');

      const password = btoa(`${config.shortCode}${config.passkey}${timestamp}`);
      const digits = phone.replace(/\D/g, '');
      const international = digits.startsWith('0') ? `254${digits.slice(1)}` : digits;

      const body = {
        BusinessShortCode: config.shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.ceil(amount),
        PartyA: international,
        PartyB: config.shortCode,
        PhoneNumber: international,
        CallBackURL: config.callbackUrl || 'https://example.com/callback',
        AccountReference: accountRef,
        TransactionDesc: description,
      };

      const response = await fetch(urls.stkPush, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.ResponseCode === '0') {
        return { success: true, checkoutRequestId: data.CheckoutRequestID };
      }
      return { success: false, error: data.CustomerMessage || data.errorMessage || 'STK Push failed' };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Network error' };
    }
  },
};
