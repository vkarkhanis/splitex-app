import type { EntitlementStatus, PlanTier } from '@traxettle/shared';

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

  resolveUserId(event: RevenueCatEvent): string | null {
    const candidate = event.app_user_id || event.aliases?.[0] || null;
    if (!candidate) return null;

    // Mobile client tags RevenueCat app_user_id as "<env>::<userId>" to avoid
    // cross-environment customer collisions (local/staging/prod).
    const match = candidate.match(/^(local|staging|production|internal)::(.+)$/i);
    if (match?.[2]) return match[2];
    return candidate;
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
