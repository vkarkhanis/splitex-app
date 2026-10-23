import { db } from '../../config/firebase';
import type { EntitlementSource, EntitlementStatus, PlanTier, UserCapabilities } from '@traxettle/shared';

type RevenueCatEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  aliases?: string[];
  expiration_at_ms?: number | null;
  expiration_at?: string | null;
  grace_period_expiration_at_ms?: number | null;
  entitlement_ids?: string[];
  // TRANSFER only: the customers a purchase moved from and to (e.g. Restore Purchase on another account).
  transferred_from?: string[];
  transferred_to?: string[];
};

export type RevenueCatEntitlementState = {
  tier: PlanTier;
  entitlementStatus: EntitlementStatus;
  entitlementExpiresAt: string | null;
};

type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

const ENV_PREFIX = /^(local|staging|production|internal)::(.+)$/i;

export class RevenueCatService {
  private readonly webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET || '';
  private readonly proEntitlementIds = (process.env.REVENUECAT_PRO_ENTITLEMENT_ID || 'pro,traxettle-pro')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  constructor(private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike) {}

  private normaliseSecret(value: string | undefined): string {
    if (!value) return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^Bearer\s+/i.test(trimmed)) {
      return trimmed.replace(/^Bearer\s+/i, '').trim();
    }
    return trimmed;
  }

  validateWebhookSecret(headerSecret: string | undefined): boolean {
    if (!this.webhookSecret) return true; // local fallback
    const incoming = this.normaliseSecret(headerSecret);
    const expected = this.normaliseSecret(this.webhookSecret);
    return incoming === expected;
  }

  parseEvent(payload: any): RevenueCatEvent {
    const event = payload?.event || payload || {};
    return {
      id: event.id || event.event_id,
      type: event.type,
      app_user_id: event.app_user_id,
      aliases: Array.isArray(event.aliases) ? event.aliases : [],
      expiration_at_ms: typeof event.expiration_at_ms === 'number' ? event.expiration_at_ms : null,
      expiration_at: typeof event.expiration_at === 'string' ? event.expiration_at : null,
      grace_period_expiration_at_ms:
        typeof event.grace_period_expiration_at_ms === 'number' ? event.grace_period_expiration_at_ms : null,
      entitlement_ids: Array.isArray(event.entitlement_ids) ? event.entitlement_ids : [],
      transferred_from: Array.isArray(event.transferred_from) ? event.transferred_from : [],
      transferred_to: Array.isArray(event.transferred_to) ? event.transferred_to : [],
    };
  }

  isTransfer(event: RevenueCatEvent): boolean {
    return (event.type || '').toUpperCase() === 'TRANSFER';
  }

  /**
   * The Traxettle accounts a TRANSFER moved a purchase between, each with its RevenueCat id.
   * Anonymous RevenueCat customers and unknown ids are skipped: a transfer never creates an account.
   */
  async resolveTransferAccounts(event: RevenueCatEvent): Promise<Array<{ appUserId: string; userId: string }>> {
    const accounts: Array<{ appUserId: string; userId: string }> = [];
    const seen = new Set<string>();
    for (const appUserId of [...(event.transferred_from || []), ...(event.transferred_to || [])]) {
      if (!appUserId || appUserId.startsWith('$RCAnonymousID:') || seen.has(appUserId)) continue;
      seen.add(appUserId);
      const userId = appUserId.match(ENV_PREFIX)?.[2] || appUserId;
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) accounts.push({ appUserId, userId });
    }
    return accounts;
  }

  /**
   * The customer's Pro entitlement as RevenueCat holds it now. Needed after a TRANSFER, whose event
   * carries no entitlement. Uses the secret key if configured, else a public SDK key (the same
   * customer lookup the app's SDK makes).
   */
  async fetchEntitlementState(appUserId: string, now: number = Date.now()): Promise<RevenueCatEntitlementState> {
    const { key, platform } = this.lookupKey();
    if (!key) throw new Error('No RevenueCat API key configured to look up a transferred purchase');
    const res = await this.fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        ...(platform ? { 'X-Platform': platform } : {}),
      },
    });
    if (!res.ok) throw new Error(`RevenueCat customer lookup failed (${res.status})`);
    const entitlements = (await res.json())?.subscriber?.entitlements || {};
    const pro = this.proEntitlementIds.map((id) => entitlements[id]).find(Boolean);
    if (!pro) return { tier: 'free', entitlementStatus: 'expired', entitlementExpiresAt: null };

    const expiresAt: string | null = pro.expires_date ?? null; // null: never expires
    if (!expiresAt || Date.parse(expiresAt) > now) {
      return { tier: 'pro', entitlementStatus: 'active', entitlementExpiresAt: expiresAt };
    }
    const graceEndsAt = pro.grace_period_expires_date ? Date.parse(pro.grace_period_expires_date) : 0;
    if (graceEndsAt > now) return { tier: 'pro', entitlementStatus: 'grace_period', entitlementExpiresAt: expiresAt };
    return { tier: 'free', entitlementStatus: 'expired', entitlementExpiresAt: expiresAt };
  }

  private lookupKey(): { key: string; platform: 'ios' | 'android' | null } {
    const secret = process.env.REVENUECAT_API_KEY || '';
    if (secret.startsWith('sk_')) return { key: secret, platform: null };
    const apple = process.env.REVENUECAT_APPLE_API_KEY || '';
    if (apple) return { key: apple, platform: 'ios' };
    const google = process.env.REVENUECAT_GOOGLE_API_KEY || '';
    return { key: google, platform: google ? 'android' : null };
  }

  async resolveUserId(event: RevenueCatEvent): Promise<string | null> {
    const candidate = event.app_user_id || event.aliases?.[0] || null;
    if (!candidate) return null;

    // Mobile client tags RevenueCat app_user_id as "<env>::<userId>" to avoid
    // cross-environment customer collisions (local/staging/prod).
    const match = candidate.match(ENV_PREFIX);
    const extractedUserId = match?.[2] || candidate;

    console.log('[RevenueCat] Resolving user ID:', { candidate, extractedUserId });

    // First try to find existing user by matching the extracted user ID
    const userDoc = await db.collection('users').doc(extractedUserId).get();
    if (userDoc.exists) {
      console.log('[RevenueCat] Found existing user by ID:', extractedUserId);
      return extractedUserId;
    }

    // If not found by ID, we need to find the user by email
    // RevenueCat webhooks include customer info with email
    const email = this.extractEmailFromEvent(event);
    if (email) {
      console.log('[RevenueCat] Looking for user by email:', email);
      const usersSnapshot = await db.collection('users')
        .where('email', '==', email.toLowerCase())
        .limit(1)
        .get();
      
      if (!usersSnapshot.empty) {
        const existingUserId = usersSnapshot.docs[0].id;
        console.log('[RevenueCat] Found existing user by email:', email, '→', existingUserId);
        
        // Update the existing user with the RevenueCat user ID for future webhooks
        await db.collection('users').doc(existingUserId).set({
          revenueCatAppUserId: candidate,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        
        return existingUserId;
      }
    }

    console.log('[RevenueCat] Creating new user for:', extractedUserId);
    return extractedUserId;
  }

  private extractEmailFromEvent(event: RevenueCatEvent): string | null {
    // RevenueCat webhooks may include email in various places
    // This is a simplified version - you might need to adjust based on actual webhook payload
    if (event.app_user_id && event.app_user_id.includes('@')) {
      return event.app_user_id;
    }
    
    // Check aliases for email
    if (event.aliases) {
      for (const alias of event.aliases) {
        if (alias.includes('@')) {
          return alias;
        }
      }
    }
    
    return null;
  }

  // RevenueCat still lists the Pro entitlement on events that end access (EXPIRATION),
  // so the event type has to be checked before the entitlement list.
  mapTier(event: RevenueCatEvent, now: number = Date.now()): PlanTier {
    if (this.endsAccess(event, now)) return 'free';

    const entitlements = event.entitlement_ids || [];
    if (entitlements.some((id) => this.proEntitlementIds.includes(id))) return 'pro';

    const t = (event.type || '').toUpperCase();
    if (['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'NON_RENEWING_PURCHASE'].includes(t)) {
      return 'pro';
    }
    return 'free';
  }

  mapStatus(event: RevenueCatEvent, now: number = Date.now()): EntitlementStatus {
    if (this.endsAccess(event, now)) return 'expired';

    const t = (event.type || '').toUpperCase();
    if (t === 'BILLING_ISSUE') {
      // During the store's grace period the subscriber keeps access while the charge is retried.
      const graceEndsAt = event.grace_period_expiration_at_ms;
      return typeof graceEndsAt === 'number' && graceEndsAt > now ? 'grace_period' : 'billing_retry';
    }
    // CANCELLATION (auto-renew turned off) and SUBSCRIPTION_PAUSED (pause scheduled) keep access
    // for the period already paid for; RevenueCat sends EXPIRATION when it ends.
    return 'active';
  }

  /**
   * EXPIRATION ends access. A CANCELLATION ends it only once its expiry has passed, as with a
   * refund; RevenueCat has no separate refund event.
   */
  private endsAccess(event: RevenueCatEvent, now: number): boolean {
    const t = (event.type || '').toUpperCase();
    if (t === 'EXPIRATION') return true;
    if (t === 'CANCELLATION') {
      const expiry = this.getExpiry(event);
      return !expiry || Date.parse(expiry) <= now;
    }
    return false;
  }

  getExpiry(event: RevenueCatEvent): string | null {
    if (typeof event.expiration_at === 'string') return event.expiration_at;
    if (typeof event.expiration_at_ms === 'number') return new Date(event.expiration_at_ms).toISOString();
    return null;
  }
}
