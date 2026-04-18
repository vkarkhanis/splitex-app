import { EntitlementService } from '../../services/entitlement.service';

const userStore: Record<string, any> = {};

jest.mock('../../config/firebase', () => ({
  db: {
    collection: jest.fn().mockImplementation((name: string) => {
      if (name !== 'users') throw new Error(`Unexpected collection ${name}`);
      return {
        doc: (id: string) => ({
          get: jest.fn().mockResolvedValue({
            exists: Boolean(userStore[id]),
            data: () => userStore[id],
          }),
          set: jest.fn().mockImplementation(async (patch: any, options?: any) => {
            if (options?.merge) {
              userStore[id] = { ...(userStore[id] || {}), ...patch };
            } else {
              userStore[id] = patch;
            }
          }),
        }),
      };
    }),
  },
}));

describe('EntitlementService', () => {
  let service: EntitlementService;

  beforeEach(() => {
    Object.keys(userStore).forEach((k) => delete userStore[k]);
    service = new EntitlementService();
  });

  it('returns default free entitlement when user does not exist', async () => {
    const entitlement = await service.getEntitlement('u1');
    expect(entitlement.tier).toBe('free');
    expect(entitlement.entitlementStatus).toBe('active');
    expect(entitlement.internalTester).toBe(false);
  });

  it('computes Pro capabilities only for active/grace pro', () => {
    expect(service.computeCapabilities({
      tier: 'pro',
      entitlementStatus: 'active',
      entitlementExpiresAt: null,
      entitlementSource: 'manual_override',
      internalTester: false,
    }).multiCurrencySettlement).toBe(true);

    expect(service.computeCapabilities({
      tier: 'pro',
      entitlementStatus: 'expired',
      entitlementExpiresAt: null,
      entitlementSource: 'manual_override',
      internalTester: false,
    }).multiCurrencySettlement).toBe(false);
  });

  it('switches tier and persists entitlement metadata', async () => {
    await service.switchTier('u1', 'pro', 'manual_override');
    expect(userStore.u1.tier).toBe('pro');
    expect(userStore.u1.entitlementStatus).toBe('active');
    expect(userStore.u1.entitlementSource).toBe('manual_override');

    await service.switchTier('u1', 'free', 'manual_override');
    expect(userStore.u1.tier).toBe('free');
    expect(userStore.u1.entitlementStatus).toBe('expired');
    expect(typeof userStore.u1.entitlementExpiresAt).toBe('string');
  });

  it('assertCapability passes for active pro and throws typed error for free', async () => {
    userStore.u1 = {
      tier: 'pro',
      entitlementStatus: 'active',
      entitlementSource: 'manual_override',
      internalTester: false,
    };

    await expect(service.assertCapability('u1', 'multiCurrencySettlement')).resolves.toBeUndefined();

    userStore.u1 = {
      tier: 'free',
      entitlementStatus: 'active',
      entitlementSource: 'system',
      internalTester: false,
    };

    await expect(service.assertCapability('u1', 'multiCurrencySettlement')).rejects.toMatchObject({
      statusCode: 403,
      errorCode: 'FEATURE_REQUIRES_PRO',
      feature: 'multi_currency_settlement',
    });
  });

  it('applies RevenueCat entitlement and defaults invalid status/source safely', async () => {
    userStore.u2 = {
      tier: 'pro',
      entitlementStatus: 'weird-status',
      entitlementSource: 'unknown-source',
      entitlementExpiresAt: 123,
      internalTester: true,
    };

    const safe = await service.getEntitlement('u2');
    expect(safe.entitlementStatus).toBe('active');
    expect(safe.entitlementSource).toBe('system');
    expect(safe.entitlementExpiresAt).toBeNull();
    expect(safe.internalTester).toBe(true);

    const updated = await service.applyRevenueCatEntitlement('u2', {
      tier: 'free',
      entitlementStatus: 'expired',
      entitlementExpiresAt: '2026-12-31T00:00:00.000Z',
    });
    expect(updated.tier).toBe('free');
    expect(updated.entitlementSource).toBe('revenuecat');
    expect(updated.entitlementStatus).toBe('expired');
  });

  it('returns a detached default entitlement object', () => {
    const one = service.getDefaultEntitlement();
    const two = service.getDefaultEntitlement();
    expect(one).toEqual(two);
    expect(one).not.toBe(two);
  });
});
