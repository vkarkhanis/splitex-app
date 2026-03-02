import { db } from '../../config/firebase';
import type { EntitlementSource, EntitlementStatus, PlanTier, UserCapabilities } from '@traxettle/shared';

type RevenueCatEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  aliases?: string[];
  expiration_at_ms?: number | null;
  expiration_at?: string | null;
  entitlement_ids?: string[];
};

export class RevenueCatService {
  private readonly webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET || '';
  private readonly proEntitlementIds = (process.env.REVENUECAT_PRO_ENTITLEMENT_ID || 'pro,traxettle-pro')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

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
      entitlement_ids: Array.isArray(event.entitlement_ids) ? event.entitlement_ids : [],
    };
  }

  async resolveUserId(event: RevenueCatEvent): Promise<string | null> {
    const candidate = event.app_user_id || event.aliases?.[0] || null;
    if (!candidate) return null;

    // Mobile client tags RevenueCat app_user_id as "<env>::<userId>" to avoid
    // cross-environment customer collisions (local/staging/prod).
    const match = candidate.match(/^(local|staging|production|internal)::(.+)$/i);
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

  mapTier(event: RevenueCatEvent): PlanTier {
    const entitlements = event.entitlement_ids || [];
    if (entitlements.some((id) => this.proEntitlementIds.includes(id))) return 'pro';

    const t = (event.type || '').toUpperCase();
    if (['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'NON_RENEWING_PURCHASE'].includes(t)) {
      return 'pro';
    }
    return 'free';
  }

  mapStatus(event: RevenueCatEvent): EntitlementStatus {
    const t = (event.type || '').toUpperCase();
    if (['BILLING_ISSUE', 'SUBSCRIPTION_PAUSED'].includes(t)) return 'billing_retry';
    if (['CANCELLATION', 'EXPIRATION', 'REFUND', 'REVOKE'].includes(t)) return 'expired';
    return 'active';
  }

  getExpiry(event: RevenueCatEvent): string | null {
    if (typeof event.expiration_at === 'string') return event.expiration_at;
    if (typeof event.expiration_at_ms === 'number') return new Date(event.expiration_at_ms).toISOString();
    return null;
  }
}
