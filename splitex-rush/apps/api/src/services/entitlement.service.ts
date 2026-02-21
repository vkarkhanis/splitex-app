import { db } from '../config/firebase';
import type { EntitlementSource, EntitlementStatus, PlanTier, UserCapabilities } from '@splitex/shared';

export interface UserEntitlement {
  tier: PlanTier;
  entitlementStatus: EntitlementStatus;
  entitlementExpiresAt: string | null;
  entitlementSource: EntitlementSource;
  internalTester: boolean;
}

const DEFAULT_ENTITLEMENT: UserEntitlement = {
  tier: 'free',
  entitlementStatus: 'active',
  entitlementExpiresAt: null,
  entitlementSource: 'system',
  internalTester: false,
};

const PRO_FEATURE_CODES = {
  multiCurrencySettlement: 'multi_currency_settlement',
} as const;

export class EntitlementService {
  async getEntitlement(userId: string): Promise<UserEntitlement> {
    const snap = await db.collection('users').doc(userId).get();
    const data = (snap.exists ? snap.data() : {}) || {};

    const tier = data.tier === 'pro' ? 'pro' : 'free';
    const rawStatus = String(data.entitlementStatus || 'active');
    const entitlementStatus: EntitlementStatus = (
      ['active', 'grace_period', 'billing_retry', 'expired', 'revoked'].includes(rawStatus)
        ? rawStatus
        : 'active'
    ) as EntitlementStatus;
    const entitlementSource: EntitlementSource = (
      ['revenuecat', 'manual_override', 'system'].includes(String(data.entitlementSource))
        ? data.entitlementSource
        : 'system'
    ) as EntitlementSource;

    return {
      tier,
      entitlementStatus,
      entitlementExpiresAt: typeof data.entitlementExpiresAt === 'string' ? data.entitlementExpiresAt : null,
      entitlementSource,
      internalTester: data.internalTester === true,
    };
  }

  computeCapabilities(entitlement: UserEntitlement): UserCapabilities {
    const isActivePro =
      entitlement.tier === 'pro' &&
      (entitlement.entitlementStatus === 'active' || entitlement.entitlementStatus === 'grace_period');

    return {
      multiCurrencySettlement: isActivePro,
    };
  }

  async assertCapability(userId: string, capability: keyof UserCapabilities): Promise<void> {
    const entitlement = await this.getEntitlement(userId);
    const capabilities = this.computeCapabilities(entitlement);
    if (capabilities[capability]) return;

    const err = new Error('This feature requires Pro');
    (err as any).statusCode = 403;
    (err as any).errorCode = 'FEATURE_REQUIRES_PRO';
    (err as any).feature = PRO_FEATURE_CODES[capability];
    throw err;
  }

  async switchTier(
    userId: string,
    tier: PlanTier,
    source: EntitlementSource = 'manual_override',
  ): Promise<UserEntitlement> {
    const now = new Date().toISOString();
    const next: Partial<UserEntitlement> & { updatedAt: string } = {
      tier,
      entitlementStatus: tier === 'pro' ? 'active' : 'expired',
      entitlementExpiresAt: tier === 'pro' ? null : now,
      entitlementSource: source,
      updatedAt: now,
    };
    await db.collection('users').doc(userId).set(next, { merge: true });
    return this.getEntitlement(userId);
  }

  async applyRevenueCatEntitlement(
    userId: string,
    input: Partial<UserEntitlement>,
  ): Promise<UserEntitlement> {
    const patch = {
      ...input,
      entitlementSource: 'revenuecat' as EntitlementSource,
      updatedAt: new Date().toISOString(),
    };
    await db.collection('users').doc(userId).set(patch, { merge: true });
    return this.getEntitlement(userId);
  }

  getDefaultEntitlement(): UserEntitlement {
    return { ...DEFAULT_ENTITLEMENT };
  }
}
