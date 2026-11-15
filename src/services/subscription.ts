import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { SUBSCRIPTION_SERVER_URL } from '../config';

const CACHE_KEY = 'nexora_sub_cache';
const GRACE_DAYS = 7; // days to stay unlocked after server is unreachable

export interface SubscriptionStatus {
  active: boolean;
  expiresAt: string | null;
  daysLeft: number;
  plan: string | null;
}

interface CachedEntry {
  status: SubscriptionStatus;
  cachedAt: string;
}

export const subscriptionService = {
  async checkStatus(identifier: string): Promise<SubscriptionStatus> {
    const res = await axios.get(
      `${SUBSCRIPTION_SERVER_URL}/api/status/${encodeURIComponent(identifier)}`,
      { timeout: 8000 },
    );
    return res.data as SubscriptionStatus;
  },

  async getCached(): Promise<CachedEntry | null> {
    try {
      const raw = await SecureStore.getItemAsync(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async setCached(status: SubscriptionStatus): Promise<void> {
    try {
      await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify({ status, cachedAt: new Date().toISOString() }));
    } catch {}
  },

  // Main function: returns active + source (live / cache / grace).
  // Never throws — falls back to cache then grace period so offline users stay unlocked.
  async isActive(identifier: string): Promise<{ active: boolean; daysLeft: number; source: 'live' | 'cache' | 'grace' | 'none' }> {
    try {
      const status = await subscriptionService.checkStatus(identifier);
      await subscriptionService.setCached(status);
      return { active: status.active, daysLeft: status.daysLeft, source: 'live' };
    } catch {}

    const cached = await subscriptionService.getCached();
    if (cached) {
      const hoursSince = (Date.now() - new Date(cached.cachedAt).getTime()) / 3_600_000;
      const graceHoursLeft = GRACE_DAYS * 24 - hoursSince;

      if (cached.status.active) {
        return { active: true, daysLeft: cached.status.daysLeft, source: hoursSince < 24 ? 'cache' : 'grace' };
      }
      // Even expired, give grace period if server is unreachable
      if (graceHoursLeft > 0) {
        return { active: true, daysLeft: 0, source: 'grace' };
      }
    }

    return { active: false, daysLeft: 0, source: 'none' };
  },

  async initiateMpesa(phone: string, name: string, email?: string): Promise<{ txRef: string; message: string }> {
    const res = await axios.post(
      `${SUBSCRIPTION_SERVER_URL}/api/subscribe/mpesa`,
      { phone, name, email },
      { timeout: 15000 },
    );
    return res.data;
  },

  async initiateCard(name: string, email: string, phone?: string): Promise<{ txRef: string; paymentLink: string }> {
    const res = await axios.post(
      `${SUBSCRIPTION_SERVER_URL}/api/subscribe/card`,
      { name, email, phone },
      { timeout: 15000 },
    );
    return res.data;
  },

  // Polls every 3 s until subscription becomes active (max ~60 s).
  async pollUntilActive(identifier: string, maxAttempts = 20): Promise<SubscriptionStatus | null> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const status = await subscriptionService.checkStatus(identifier);
        if (status.active) {
          await subscriptionService.setCached(status);
          return status;
        }
      } catch {}
    }
    return null;
  },
};
