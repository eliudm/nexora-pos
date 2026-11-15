import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { SUBSCRIPTION_SERVER_URL } from '../config';

const CACHE_KEY = 'nexora_sub_cache';
const TRIAL_KEY = 'nexora_trial_start';
const PAYWALL_DISMISSED_KEY = 'nexora_paywall_dismissed';
const GRACE_DAYS = 7;
export const TRIAL_DAYS = 14;

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

  // ── Trial ──────────────────────────────────────────────────────────────────

  async startTrial(): Promise<void> {
    const existing = await SecureStore.getItemAsync(TRIAL_KEY);
    if (!existing) {
      await SecureStore.setItemAsync(TRIAL_KEY, new Date().toISOString());
    }
  },

  async getTrialInfo(): Promise<{ startedAt: string | null; daysLeft: number; daysUsed: number; expired: boolean }> {
    try {
      const raw = await SecureStore.getItemAsync(TRIAL_KEY);
      if (!raw) return { startedAt: null, daysLeft: TRIAL_DAYS, daysUsed: 0, expired: false };
      const daysUsed = Math.floor((Date.now() - new Date(raw).getTime()) / 86_400_000);
      const daysLeft = Math.max(0, TRIAL_DAYS - daysUsed);
      return { startedAt: raw, daysLeft, daysUsed, expired: daysLeft === 0 };
    } catch {
      return { startedAt: null, daysLeft: TRIAL_DAYS, daysUsed: 0, expired: false };
    }
  },

  async isPaywallDismissed(): Promise<boolean> {
    try {
      const raw = await SecureStore.getItemAsync(PAYWALL_DISMISSED_KEY);
      if (!raw) return false;
      return new Date(raw) > new Date();
    } catch { return false; }
  },

  async dismissPaywall(): Promise<void> {
    const until = new Date();
    until.setHours(until.getHours() + 24);
    await SecureStore.setItemAsync(PAYWALL_DISMISSED_KEY, until.toISOString());
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
